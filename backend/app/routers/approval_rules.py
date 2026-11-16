"""Saved "always allow" rules for Bash commands, managed by the person.

Local access only. A rule only skips the question for a call that matches it;
see services/approval_allowlist.py for exactly what matches."""

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select

from app.db.models import Thread
from app.routers.threads import get_runtime
from app.schemas.approvals import ApprovalRuleCreate, ApprovalRuleResponse
from app.services import agent_store, local_claude_runner
from app.services import approval_allowlist as allowlist
from app.services import decision_log
from app.services.local_access_policy import require_local_access
from app.services.thread_runtime import ThreadRuntime

router = APIRouter(
    prefix="/approval-rules",
    tags=["Approvals"],
    dependencies=[Depends(require_local_access)],
)


def _public(rule) -> ApprovalRuleResponse:
    match, workspace = allowlist.split_scope(rule.connector)
    return ApprovalRuleResponse(
        id=rule.id, match=match, command=rule.tool, workspace=workspace, created_at=rule.created_at
    )


async def _agent_folders(db, owner_id: str, agent_id: int) -> set[str]:
    """The folders one agent's conversations work in, spelled as a conversation
    stores its folder (services/thread_runtime.py): the agent's current folder
    (its chosen workspace, or the one named by its id under the workspace root)
    and the folder of every conversation it has had, which keeps the folder it
    started in when the agent's folder changes later."""
    agent = await agent_store.get_agent(db, agent_id)
    if agent is None or agent.owner_id != owner_id:
        raise HTTPException(status_code=404, detail="Agent not found")
    if agent.workspace_path:
        current = Path(agent.workspace_path)
    else:
        current = local_claude_runner.workspace_dir() / "agents" / str(agent.id)
    folders = {str(current.resolve())}
    rows = await db.execute(
        select(Thread.workspace_path).where(Thread.owner_id == owner_id, Thread.agent_id == agent.id).distinct()
    )
    folders.update(path for path in rows.scalars() if path)
    return folders


@router.get("", response_model=list[ApprovalRuleResponse])
async def list_rules(
    workspace: str | None = Query(default=None, max_length=allowlist.MAX_WORKSPACE_CHARS),
    agent_id: int | None = Query(default=None, ge=1),
    rt: ThreadRuntime = Depends(get_runtime),
):
    """Every saved rule, or with `workspace` only the ones that apply in that
    folder: those tied to it and those with no folder. With `agent_id`, only
    the ones that apply to that agent: those tied to a folder its conversations
    work in, and those with no folder."""
    async with rt.session() as db:
        rules = await allowlist.list_rules(db, rt.owner_id)
        folders = await _agent_folders(db, rt.owner_id, agent_id) if agent_id is not None else None
    if workspace is not None:
        rules = [r for r in rules if allowlist.applies_in(r, workspace)]
    if folders is not None:
        rules = [r for r in rules if allowlist.split_scope(r.connector or "")[1] in folders | {None}]
    return [_public(r) for r in rules]


@router.post("", response_model=ApprovalRuleResponse, status_code=201)
async def add_rule(payload: ApprovalRuleCreate, rt: ThreadRuntime = Depends(get_runtime)):
    try:
        async with rt.session() as db:
            rule = await allowlist.add_rule(
                db, rt.owner_id, payload.match, payload.command, payload.workspace
            )
    except allowlist.InvalidRule as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from None
    return _public(rule)


@router.delete("/{rule_id}", status_code=204)
async def delete_rule(
    rule_id: int,
    thread_id: int | None = Query(default=None, description="The conversation it was undone from, if any"),
    rt: ThreadRuntime = Depends(get_runtime),
):
    """Take back an "always allow". The decision log records it as `undone`;
    the next matching command asks again."""
    async with rt.session() as db:
        rule = await allowlist.delete_rule(db, rt.owner_id, rule_id)
    if rule is None:
        raise HTTPException(status_code=404, detail="Rule not found")
    decision_log.record(
        "undone", thread_id=thread_id, tool=allowlist.BASH_TOOL, source="user", rule=allowlist.rule_label(rule)
    )
