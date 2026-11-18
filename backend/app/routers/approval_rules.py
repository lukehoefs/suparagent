"""Saved "always allow" rules for Bash commands, and the allows given for one
conversation ("Allow for 1 hour", "Always in this chat"), managed by the person.

Local access only. A rule only skips the question for a call that matches it;
see services/approval_allowlist.py and services/approval_scopes.py for exactly
what matches. Conversation allows are made from an approval card, never here;
they are listed (scope `hour` or `thread`) and can be deleted like any rule."""

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select

from app.db.models import Thread
from app.routers.threads import get_runtime
from app.schemas.approvals import ApprovalRuleCreate, ApprovalRuleResponse
from app.services import agent_store, approval_scopes, local_claude_runner
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
    if rule.bucket == approval_scopes.BUCKET:
        # Tied to one exact call (a command, or a command tool's exact input), or to the tool.
        command = rule.tool if rule.tool and not rule.tool.startswith("ref:") else None
        return ApprovalRuleResponse(
            id=rule.id, match="exact" if command else None, command=command, workspace=None,
            created_at=rule.created_at, scope=approval_scopes.scope_of(rule), tool=rule.connector,
            label=rule.label, thread_id=rule.thread_id, expires_at=rule.expires_at,
        )
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
    thread_id: int | None = Query(default=None, ge=1),
    rt: ThreadRuntime = Depends(get_runtime),
):
    """Every saved rule and every live conversation allow (scope `hour` or
    `thread`; one whose hour is up or whose conversation is gone is not
    listed). With `workspace`, only the saved rules that apply in that folder:
    those tied to it and those with no folder. With `agent_id`, only the saved
    rules that apply to that agent: those tied to a folder its conversations
    work in, and those with no folder. With `thread_id`, only what applies in
    that conversation: the saved rules for its folder (or for `workspace`, when
    given) and its own conversation allows."""
    async with rt.session() as db:
        rules = await allowlist.list_rules(db, rt.owner_id)
        folders = await _agent_folders(db, rt.owner_id, agent_id) if agent_id is not None else None
        thread = None
        if thread_id is not None:
            thread = await db.get(Thread, thread_id)
            if thread is None or thread.owner_id != rt.owner_id:
                raise HTTPException(status_code=404, detail="Conversation not found")
        scoped = []
        if thread is not None or (workspace is None and agent_id is None):
            scoped = await approval_scopes.list_rules(
                db, rt.owner_id, thread_ids={thread.id} if thread is not None else None
            )
    if thread is not None and workspace is None:
        # Spelled as the runtime matches it (services/thread_runtime.py); no folder matches none.
        workspace = str(Path(thread.workspace_path)) if thread.workspace_path else ""
    if workspace is not None:
        rules = [r for r in rules if allowlist.applies_in(r, workspace)]
    if folders is not None:
        rules = [r for r in rules if allowlist.split_scope(r.connector or "")[1] in folders | {None}]
    return [_public(r) for r in rules + scoped]


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
    """Take back an "always allow" or a conversation allow. The decision log
    records it as `undone`; the next matching call asks again."""
    async with rt.session() as db:
        rule = await allowlist.delete_rule(db, rt.owner_id, rule_id)
        scoped = None if rule is not None else await approval_scopes.delete_rule(db, rt.owner_id, rule_id)
    if scoped is not None:
        decision_log.record(
            "undone", thread_id=thread_id or scoped.thread_id, tool=scoped.connector, source="user",
            rule=approval_scopes.rule_label(scoped), scope=approval_scopes.scope_of(scoped),
        )
        return
    if rule is None:
        raise HTTPException(status_code=404, detail="Rule not found")
    decision_log.record(
        "undone", thread_id=thread_id, tool=allowlist.BASH_TOOL, source="user", rule=allowlist.rule_label(rule)
    )
