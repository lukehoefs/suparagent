"""Agent groups: named stacks of agents in the sidebar's pinned grid (design: Main.html).

A group is only a way to arrange the sidebar. It holds no settings, so grouping an agent changes
nothing about what it may do, which approvals it asks for, or how its turns run.

Membership is `agent.group_id`, and an agent is in at most one group: putting it in a group takes
it out of the one it was in. A group the last member leaves is kept until it is deleted; the client
deletes it (DELETE) when that is what the person did.

Reading needs the chat scope (the sidebar shows groups wherever it shows agents); changing them
needs the manage scope, like editing an agent (auth/policy.py).

Errors carry `{"detail": {"error_code": "...", "message": "..."}}`.
"""

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import func, select, update

from app.db.models import Agent, AgentGroup
from app.db.transactions import begin_write
from app.routers.threads import get_runtime
from app.schemas.agent_group import (
    AgentGroupCreateRequest,
    AgentGroupMembersRequest,
    AgentGroupResponse,
    AgentGroupUpdateRequest,
)
from app.services.local_access_policy import require_local_access

router = APIRouter(prefix="/agent-groups", tags=["Agent groups"], dependencies=[Depends(require_local_access)])

NAME_LIMIT = 80


def _error(status_code: int, code: str, message: str) -> HTTPException:
    return HTTPException(status_code=status_code, detail={"error_code": code, "message": message})


def _clean_name(value: str) -> str:
    name = value.strip()
    if not name or len(name) > NAME_LIMIT or any(ord(c) < 32 or ord(c) == 127 for c in name):
        raise _error(422, "invalid_name", f"A group name is one line of 1 to {NAME_LIMIT} characters.")
    return name


async def _members(db, owner_id: str, group_ids: list[int]) -> dict[int, list[int]]:
    """Each group's live agents, by name (case-insensitive), then id."""
    found: dict[int, list[Agent]] = {group_id: [] for group_id in group_ids}
    if group_ids:
        rows = (await db.execute(
            select(Agent).where(Agent.owner_id == owner_id, Agent.group_id.in_(group_ids), Agent.archived_at.is_(None))
        )).scalars()
        for agent in rows:
            found[agent.group_id].append(agent)
    return {
        group_id: [agent.id for agent in sorted(agents, key=lambda a: (a.name.casefold(), a.id))]
        for group_id, agents in found.items()
    }


async def _response(db, owner_id: str, group: AgentGroup) -> AgentGroupResponse:
    members = await _members(db, owner_id, [group.id])
    return AgentGroupResponse(
        id=group.id, name=group.name, pinned=group.pinned, position=group.position,
        created_at=group.created_at, agent_ids=members[group.id],
    )


async def _group_or_404(db, owner_id: str, group_id: int, *, lock: bool = False) -> AgentGroup:
    query = select(AgentGroup).where(AgentGroup.id == group_id, AgentGroup.owner_id == owner_id)
    if lock:
        query = query.with_for_update()
    group = await db.scalar(query)
    if group is None:
        raise _error(404, "group_not_found", "No group with that id.")
    return group


async def _check_agents(db, owner_id: str, agent_ids: list[int]) -> None:
    """Every id names a live agent of this owner, once."""
    if len(set(agent_ids)) != len(agent_ids):
        raise _error(422, "duplicate_agents", "Each agent can be listed only once.")
    if not agent_ids:
        return
    live = set((await db.execute(
        select(Agent.id).where(Agent.owner_id == owner_id, Agent.id.in_(agent_ids), Agent.archived_at.is_(None))
    )).scalars())
    if live != set(agent_ids):
        raise _error(404, "agent_not_found", "One of those agents does not exist or is archived.")


async def _set_group(db, statement, group_id: int | None) -> None:
    """Run an UPDATE of agents' group. `updated_at` is the profile's last edit and arranging the
    sidebar is not one, so it is written back unchanged (its onupdate would otherwise fire)."""
    await db.execute(
        statement.values(group_id=group_id, updated_at=Agent.updated_at).execution_options(synchronize_session=False)
    )


async def _move_in(db, owner_id: str, group_id: int, agent_ids: list[int]) -> None:
    if agent_ids:
        await _set_group(db, update(Agent).where(Agent.owner_id == owner_id, Agent.id.in_(agent_ids)), group_id)


@router.get("", response_model=list[AgentGroupResponse])
async def list_groups(rt=Depends(get_runtime)):
    """The owner's groups, by position, each with its live members."""
    async with rt.session() as db:
        groups = list((await db.execute(
            select(AgentGroup).where(AgentGroup.owner_id == rt.owner_id).order_by(AgentGroup.position, AgentGroup.id)
        )).scalars())
        members = await _members(db, rt.owner_id, [group.id for group in groups])
    return [
        AgentGroupResponse(
            id=group.id, name=group.name, pinned=group.pinned, position=group.position,
            created_at=group.created_at, agent_ids=members[group.id],
        )
        for group in groups
    ]


@router.post("", response_model=AgentGroupResponse, status_code=201)
async def create_group(payload: AgentGroupCreateRequest, rt=Depends(get_runtime)):
    """A new group after the owner's others. The agents listed move into it."""
    name = _clean_name(payload.name)
    async with rt.session() as db:
        await begin_write(db)
        await _check_agents(db, rt.owner_id, payload.agent_ids)
        last = await db.scalar(select(func.max(AgentGroup.position)).where(AgentGroup.owner_id == rt.owner_id))
        group = AgentGroup(owner_id=rt.owner_id, name=name, pinned=payload.pinned, position=0 if last is None else last + 1)
        db.add(group)
        await db.flush()
        await _move_in(db, rt.owner_id, group.id, payload.agent_ids)
        await db.commit()
        await db.refresh(group)
        return await _response(db, rt.owner_id, group)


@router.patch("/{group_id}", response_model=AgentGroupResponse)
async def update_group(group_id: int, payload: AgentGroupUpdateRequest, rt=Depends(get_runtime)):
    sent = payload.model_fields_set
    for field in ("name", "pinned", "position"):
        if field in sent and getattr(payload, field) is None:
            raise _error(422, f"invalid_{field}", f"{field} cannot be null.")
    name = _clean_name(payload.name) if "name" in sent else None
    async with rt.session() as db:
        await begin_write(db)
        group = await _group_or_404(db, rt.owner_id, group_id, lock=True)
        if name is not None:
            group.name = name
        if "pinned" in sent:
            group.pinned = payload.pinned
        if "position" in sent:
            group.position = payload.position
        await db.commit()
        await db.refresh(group)
        return await _response(db, rt.owner_id, group)


@router.delete("/{group_id}", status_code=204)
async def delete_group(group_id: int, rt=Depends(get_runtime)):
    """Ungroup: the members stay as they are, in no group, and the group is gone."""
    async with rt.session() as db:
        await begin_write(db)
        group = await _group_or_404(db, rt.owner_id, group_id, lock=True)
        await _set_group(db, update(Agent).where(Agent.owner_id == rt.owner_id, Agent.group_id == group.id), None)
        await db.delete(group)
        await db.commit()
    return Response(status_code=204)


@router.put("/{group_id}/members", response_model=AgentGroupResponse)
async def set_members(group_id: int, payload: AgentGroupMembersRequest, rt=Depends(get_runtime)):
    """Exactly these agents in the group: the ones listed move in, the other members leave."""
    async with rt.session() as db:
        await begin_write(db)
        group = await _group_or_404(db, rt.owner_id, group_id, lock=True)
        await _check_agents(db, rt.owner_id, payload.agent_ids)
        leaving = update(Agent).where(Agent.owner_id == rt.owner_id, Agent.group_id == group.id)
        if payload.agent_ids:
            leaving = leaving.where(Agent.id.not_in(payload.agent_ids))
        await _set_group(db, leaving, None)
        await _move_in(db, rt.owner_id, group.id, payload.agent_ids)
        await db.commit()
        await db.refresh(group)
        return await _response(db, rt.owner_id, group)
