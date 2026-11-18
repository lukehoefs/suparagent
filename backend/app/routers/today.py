"""The Today page (the home, design: Today.html): what is running right now, and the whole
Today brief.

Both routes only read. They are owner and admin only, like /needs-you: neither is in the chat
scope (auth/policy.py lists what is). Both need local access, like /threads, whose rows they read.
"""
from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import exists, select

from app.db.models import Approval, Routine, Thread, Turn, WorkItem
from app.routers.needs_you import get_service
from app.routers.threads import get_runtime
from app.schemas.thread import ApprovalResponse
from app.services.local_access_policy import require_local_access
from app.services.thread_runtime import ThreadRuntime
from app.team import needs_you

router = APIRouter(prefix="/today", tags=["Today"], dependencies=[Depends(require_local_access)])

# At most this many running answers that wait for nothing are listed. Every answer with a call
# waiting is listed whatever the count: those are the ones the person must see. A conversation
# runs one answer at a time.
RUNNING_LIMIT = 50
# The brief lists up to this many of what waits (engines, questions, routines, repeated
# failures), plus every waiting call and every event of today; the card in the chat keeps its
# own six.
BRIEF_ROWS = 100
# Rows the Today page reads from elsewhere or does not show: tasks come from the task board,
# routine results from the routine runs, and the inbox is left to the chat's card.
LEFT_OUT = frozenset({"due", "routine_completed", "gmail_message"})
# Rows never cut by BRIEF_ROWS: every waiting call (GET /today/running lists them too; these are
# the page's fallback), and today's events (at most 30, the calendar read's own cap).
UNCAPPED = frozenset({"approval", "calendar_event"})


class RunningTurn(BaseModel):
    thread_id: int
    turn_id: int
    # chat | job | room | room_member | team_notices
    kind: str
    title: str | None
    agent_id: int | None
    room_id: int | None
    job_id: int | None
    started_at: datetime
    # Who started it: person, routine, outside (a webhook) or peer (another agent); null for
    # turns from before this was recorded.
    origin: str | None
    # The tool calls in this answer that wait for the person, oldest first. Only a running
    # answer's calls can be answered, so these are exactly the ones that can be.
    approvals: list[ApprovalResponse]


@router.get("/running", response_model=list[RunningTurn])
async def running(rt: ThreadRuntime = Depends(get_runtime)):
    """Every conversation with an answer being worked on right now, newest first, each with the
    tool calls in it that wait for the person. Every answer with a waiting call is listed; of the
    rest, the RUNNING_LIMIT newest."""
    waits = exists().where(Approval.turn_id == Turn.id, Approval.status == "pending")
    listed = (select(Turn, Thread)
              .join(Thread, Thread.id == Turn.thread_id)
              .where(Thread.owner_id == rt.owner_id, Turn.status == "running")
              .order_by(Turn.started_at.desc(), Turn.id.desc()))
    async with rt.session() as db:
        waiting_rows = (await db.execute(listed.where(waits))).all()
        other_rows = (await db.execute(listed.where(~waits).limit(RUNNING_LIMIT))).all()
        # A call answered between the two reads may list its answer twice: keep it once.
        by_turn = {turn.id: (turn, thread) for turn, thread in [*waiting_rows, *other_rows]}
        rows = sorted(by_turn.values(), key=lambda row: (row[0].started_at, row[0].id), reverse=True)
        turn_ids = list(by_turn)
        pending = list((await db.execute(
            select(Approval)
            .where(Approval.turn_id.in_(turn_ids), Approval.status == "pending")
            .order_by(Approval.created_at, Approval.id)
        )).scalars()) if turn_ids else []
    waiting: dict[int, list[ApprovalResponse]] = {}
    for approval in pending:
        waiting.setdefault(approval.turn_id, []).append(ApprovalResponse.model_validate(approval))
    return [
        RunningTurn(
            thread_id=thread.id, turn_id=turn.id, kind=thread.kind, title=thread.title,
            agent_id=thread.agent_id, room_id=thread.room_id, job_id=thread.job_id,
            started_at=turn.started_at, origin=turn.origin, approvals=waiting.get(turn.id, []),
        )
        for turn, thread in rows
    ]


@router.get("/brief")
async def brief(refresh: bool = False, service: needs_you.NeedsYou = Depends(get_service)):
    """The Today brief as GET /needs-you reads it (the same rules and no side effects), with the
    rows the Today page shows: every waiting call, every event of today, and up to BRIEF_ROWS of
    the rest of what waits instead of the card's six (`more` counts the rest of what waits that
    is left out). Due tasks, routine completions and inbox messages are left out: the page reads
    the task board and the routine runs itself. Each row names its agent where one is known: the
    agent of its conversation, else of its routine, else of its task (`agent_id`, null when none).
    `refresh` bypasses the short cache of connected apps, as on /needs-you."""
    card = await service.read(refresh=refresh, rows=None)
    items, capped, more = [], 0, 0
    for item in card["items"]:
        if item["kind"] in LEFT_OUT:
            continue
        if item["kind"] in UNCAPPED:
            items.append(item)
        elif capped < BRIEF_ROWS:
            items.append(item)
            capped += 1
        else:
            more += 1
    card["items"], card["more"] = items, more
    owner = service.owner_id
    thread_ids = {i["thread_id"] for i in items if i.get("thread_id")}
    routine_ids = {i["routine_id"] for i in items if i.get("routine_id")}
    task_ids = {i["work_item_id"] for i in items if i.get("work_item_id")}
    async with service.runtime.session() as db:
        threads = dict((await db.execute(select(Thread.id, Thread.agent_id).where(
            Thread.owner_id == owner, Thread.id.in_(thread_ids)))).all()) if thread_ids else {}
        routines = dict((await db.execute(select(Routine.id, Routine.agent_id).where(
            Routine.owner_id == owner, Routine.id.in_(routine_ids)))).all()) if routine_ids else {}
        tasks = dict((await db.execute(select(WorkItem.id, WorkItem.agent_id).where(
            WorkItem.owner_id == owner, WorkItem.id.in_(task_ids)))).all()) if task_ids else {}
    for item in items:
        item["agent_id"] = (threads.get(item.get("thread_id")) or routines.get(item.get("routine_id"))
                            or tasks.get(item.get("work_item_id")))
    return card
