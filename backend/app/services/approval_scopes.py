"""Allows a person gives on one card for one conversation: "Allow for 1 hour" and "Always in this chat".

    once    this call only (the default answer; nothing is saved)
    hour    this tool, in this conversation, for the next 60 minutes
    thread  this tool, in this conversation, from now on

Stored in `permission_rule` (bucket `thread_tool`), one row per conversation, tool and key:
`thread_id` is the conversation, `connector` the tool's full name, `tool` the key the rule is tied
to, `expires_at` the end of an hour-long allow (null for `thread`), `label` what the card called the
tool, and `decision` is always `allow`.

The key keeps a rule narrow:

  - a shell or command tool (Bash, a computer's exec, a call the engine reports as a command, an MCP
    tool named like a shell) is tied to that exact command, never to the tool: allowing `git status`
    never allows `git push`. The key is the command text for Bash and exec, and the exact input
    (canonical JSON) for any other command tool;
  - a call made through custom_call (community_mcp_bridge.py) is tied to the tool it names
    (`ref:<alias>`), never to every brokered tool;
  - any other tool is allowed whatever its input (key null).

Never covered, so their cards offer "Allow once" only: connected apps (mcp__composio__, only ever
allowed on their own card), team tools (mcp__team__), the screen and browser tools (they already have
a turn-wide "Allow this turn"), and a call that is held for its own card (`held_for`).

The approval gate (thread_runtime.py) looks for a rule only after every automatic decision (plan
mode, grants, routines) and only for a call that would otherwise ask. A rule past its end never
matches, a rule of another conversation never matches, and the safety floor always wins: a call
that `held_for` names is asked about on its own card whatever rule matches.
"""

import json
import re
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.computers.policy import SCREEN_INPUT, SCREEN_READ
from app.db.models import Thread
from app.db.models.permission_rule import PermissionRule
from app.db.transactions import begin_write
from app.services import decision_log, safety_floor
from app.services.approval_allowlist import COMMAND_TOOLS

BUCKET = "thread_tool"
ONCE, HOUR, THREAD = "once", "hour", "thread"
SCOPES = (ONCE, HOUR, THREAD)
HOUR_LENGTH = timedelta(minutes=60)
MAX_RULES_PER_THREAD = 100
# An exact input up to what a card can show in full (local_approval_broker.py).
MAX_KEY_CHARS = 50_000
MAX_LABEL_CHARS = 200
BROKER_CALL_TOOL = "mcp__community__custom_call"
_NEVER = ("mcp__composio__", "mcp__team__", "mcp__memory__", "mcp__community__custom_search")
# A remote tool's own name that says it runs commands; such a tool is tied to the exact input.
_SHELL_NAME = re.compile(
    r"(?:^|[_\-.])(?:exec|execute|shell|bash|sh|zsh|pwsh|powershell|cmd|command|commands|terminal|"
    r"run_command|run_shell|script)(?:[_\-.]|$)",
    re.IGNORECASE,
)
# Argument names whose string value is a credential, whatever it looks like.
_SECRET_FIELD = re.compile(r"(?i)(?:api[_-]?key|token|secret|passw(?:or)?d|credential|private[_-]?key)")
_MAX_DEPTH = 8


class ScopeError(ValueError):
    """Why a scoped allow could not be saved; the call was then allowed this once only."""


@dataclass(frozen=True)
class Key:
    tool: str
    # The exact command or input the rule is tied to, `ref:<alias>` for a brokered call, or None
    # for the tool whatever its input.
    key: str | None


def utcnow() -> datetime:
    return datetime.now(UTC)


def canonical(value) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, default=str)


def shell_like_name(name: object) -> bool:
    """Whether a remote MCP tool's own name says it runs commands."""
    return isinstance(name, str) and bool(_SHELL_NAME.search(name))


def rule_key(tool: object, tool_input: object, kind: str | None = None) -> Key | None:
    """What a scoped allow of this call would be tied to, or None when this call can only be
    allowed once. Read from the stored tool, input and kind alone, so the card, the answer and
    the gate always agree."""
    if not isinstance(tool, str) or not isinstance(tool_input, dict):
        return None
    if tool.startswith(_NEVER) or tool in SCREEN_INPUT or tool in SCREEN_READ:
        return None
    if tool in COMMAND_TOOLS:
        command = tool_input.get("command")
        if not isinstance(command, str) or not command.strip():
            return None
        return Key(tool, command.strip())
    if kind == "command":
        return Key(tool, canonical(tool_input))
    if tool == BROKER_CALL_TOOL:
        ref = tool_input.get("ref")
        if not isinstance(ref, str) or not ref:
            return None
        return Key(tool, "ref:" + ref)
    return Key(tool, None)


def _strings(value, depth: int = 0):
    """(field name, text) for every string in an input, nested ones included."""
    if depth > _MAX_DEPTH:
        return
    if isinstance(value, dict):
        for name, item in value.items():
            if isinstance(item, str):
                yield str(name), item
            else:
                yield from _strings(item, depth + 1)
    elif isinstance(value, list):
        for item in value[:500]:
            if isinstance(item, str):
                yield "", item
            else:
                yield from _strings(item, depth + 1)


def held_for(tool: object, tool_input: object) -> str | None:
    """Why this call must be answered on its own card, whatever scoped allow matches, or None:
    the safety-floor rule a shell command breaks (`unreadable` for one that cannot be read to the
    end), or `credential` for an input that carries a secret."""
    if not isinstance(tool_input, dict):
        return None
    command = tool_input.get("command")
    if isinstance(command, str) and command.strip():
        reading = safety_floor.floor_reading(command)
        if not reading.clear:
            return reading.verdict.rule if reading.verdict else "unreadable"
    for name, text in _strings(tool_input):
        if (name and _SECRET_FIELD.search(name) and text.strip()) or decision_log.contains_credential(text):
            return "credential"
    return None


def needs_own_card(tool: object, tool_input: object) -> str | None:
    """Why "Allow all" must leave this call for its own card, or None: anything `held_for`
    names, a connected app (only ever allowed on its own card), or a screen tool (its allow
    covers the rest of the turn, which is more than once)."""
    held = held_for(tool, tool_input)
    if held is not None:
        return held
    if isinstance(tool, str) and tool.startswith("mcp__composio__"):
        return "connected_app"
    if tool in SCREEN_INPUT:
        return "screen"
    return None


def validate(tool: object, tool_input: object, kind: str | None = None) -> Key:
    """The key a scoped allow of this call is saved with. Raises ScopeError, with words a
    person reads, when none can be."""
    key = rule_key(tool, tool_input, kind)
    if key is None:
        raise ScopeError("this tool is only ever allowed one call at a time")
    held = held_for(tool, tool_input)
    if held == "credential":
        raise ScopeError("this call carries a credential, so it is answered on its own card")
    if held is not None:
        raise ScopeError("this command is on the safety floor and is always asked about")
    if key.key is not None and len(key.key) > MAX_KEY_CHARS:
        raise ScopeError("this call is too long to save")
    return key


def scopes_for(tool: object, tool_input: object, kind: str | None = None) -> list[str]:
    """The answers a card may offer for this call: always `once`, and `hour` and `thread` when
    a scoped allow can be saved for it."""
    try:
        validate(tool, tool_input, kind)
    except ScopeError:
        return [ONCE]
    return list(SCOPES)


def _live(now: datetime):
    return or_(PermissionRule.expires_at.is_(None), PermissionRule.expires_at > now)


async def matching_rule(
    db: AsyncSession, owner_id: str, thread_id: int, tool: str, tool_input: dict, kind: str | None = None,
    *, now: datetime | None = None,
) -> PermissionRule | None:
    """The live scoped allow for this call in this conversation, if any. The caller still checks
    `held_for` first: a held call is never allowed by a rule."""
    key = rule_key(tool, tool_input, kind)
    if key is None:
        return None
    exact = PermissionRule.tool.is_(None) if key.key is None else PermissionRule.tool == key.key
    return (await db.execute(
        select(PermissionRule)
        .where(
            PermissionRule.user_id == owner_id,
            PermissionRule.bucket == BUCKET,
            PermissionRule.thread_id == thread_id,
            PermissionRule.connector == key.tool,
            exact,
            _live(now or utcnow()),
        )
        .order_by(PermissionRule.id)
        .limit(1)
    )).scalars().first()


async def add_rule(
    db: AsyncSession, owner_id: str, thread_id: int, scope: str, tool: str, tool_input: dict,
    kind: str | None = None, label: str | None = None, *, now: datetime | None = None,
) -> PermissionRule:
    """Save "allow this tool in this conversation" for an hour or from now on. Saving the same
    rule again extends it: an hour from now, or for good. Raises ScopeError, saving nothing."""
    if scope not in (HOUR, THREAD):
        raise ScopeError("only an hour or this conversation can be saved")
    key = validate(tool, tool_input, kind)
    now = now or utcnow()
    ends = None if scope == THREAD else now + HOUR_LENGTH
    await begin_write(db)
    # Rules past their end are never read again; clear this owner's while writing anyway.
    await db.execute(delete(PermissionRule).where(
        PermissionRule.user_id == owner_id, PermissionRule.bucket == BUCKET,
        PermissionRule.expires_at.is_not(None), PermissionRule.expires_at <= now,
    ))
    exact = PermissionRule.tool.is_(None) if key.key is None else PermissionRule.tool == key.key
    existing = (await db.execute(select(PermissionRule).where(
        PermissionRule.user_id == owner_id, PermissionRule.bucket == BUCKET,
        PermissionRule.thread_id == thread_id, PermissionRule.connector == key.tool, exact,
    ).order_by(PermissionRule.id))).scalars().first()
    if existing is not None:
        if existing.expires_at is not None and (ends is None or ends > existing.expires_at):
            existing.expires_at = ends
        if label:
            existing.label = label[:MAX_LABEL_CHARS]
        await db.commit()
        await db.refresh(existing)
        return existing
    count = (await db.execute(select(func.count()).select_from(PermissionRule).where(
        PermissionRule.user_id == owner_id, PermissionRule.bucket == BUCKET, PermissionRule.thread_id == thread_id,
    ))).scalar_one()
    if count >= MAX_RULES_PER_THREAD:
        await db.rollback()
        raise ScopeError(f"at most {MAX_RULES_PER_THREAD} tools can be allowed in one conversation")
    rule = PermissionRule(
        user_id=owner_id, bucket=BUCKET, connector=key.tool, tool=key.key, decision="allow",
        thread_id=thread_id, expires_at=ends, label=(label or tool)[:MAX_LABEL_CHARS],
    )
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return rule


async def list_rules(
    db: AsyncSession, owner_id: str, *, thread_ids: set[int] | None = None, now: datetime | None = None,
) -> list[PermissionRule]:
    """The live scoped allows, oldest first, optionally only those of some conversations. A rule
    whose conversation is gone, or whose hour is up, is not listed."""
    query = (
        select(PermissionRule)
        .join(Thread, Thread.id == PermissionRule.thread_id)
        .where(PermissionRule.user_id == owner_id, PermissionRule.bucket == BUCKET, _live(now or utcnow()))
        .order_by(PermissionRule.id)
    )
    if thread_ids is not None:
        if not thread_ids:
            return []
        query = query.where(PermissionRule.thread_id.in_(thread_ids))
    return list((await db.execute(query)).scalars())


async def delete_rule(db: AsyncSession, owner_id: str, rule_id: int) -> PermissionRule | None:
    """Take back one scoped allow. Returns what was deleted, or None if there was none."""
    await begin_write(db)
    rule = (await db.execute(select(PermissionRule).where(
        PermissionRule.id == rule_id, PermissionRule.user_id == owner_id, PermissionRule.bucket == BUCKET,
    ))).scalar_one_or_none()
    if rule is None:
        await db.rollback()
        return None
    await db.execute(delete(PermissionRule).where(PermissionRule.id == rule.id))
    await db.commit()
    return rule


async def delete_for_thread(db: AsyncSession, thread_id: int) -> None:
    """Part of deleting a conversation (thread_store.delete_thread): its allows go with it."""
    await db.execute(delete(PermissionRule).where(
        PermissionRule.bucket == BUCKET, PermissionRule.thread_id == thread_id,
    ))


def scope_of(rule: PermissionRule) -> str:
    """`hour` or `thread` for a scoped allow; `always` for a saved command rule."""
    if rule.bucket != BUCKET:
        return "always"
    return THREAD if rule.expires_at is None else HOUR


def rule_label(rule: PermissionRule) -> str:
    """How the decision log names a scoped allow: `thread: Bash: git status`."""
    what = rule.label or rule.connector or "a tool"
    if rule.tool and not rule.tool.startswith("ref:"):
        what = f"{what}: {rule.tool}"
    return f"{scope_of(rule)}: {what}"
