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
    never allows `git push`. The key is the command text for Bash and exec (with the folder it runs
    in, when the call names one), and the exact input (canonical JSON) for any other command tool;
  - a tool an engine reports by its category rather than its name (an ACP agent's `acp:<kind>`) is
    tied to the exact input too, never to the category;
  - a call made through custom_call (community_mcp_bridge.py) is tied to the tool it names
    (`ref:<alias>`), never to every brokered tool;
  - any other tool is allowed whatever its input (key null). The gate applies such an allow to a
    file tool only for edits inside the conversation's folder (`file_paths`, `inside_folder`).

Never covered, so their cards offer "Allow once" only: connected apps (mcp__composio__, only ever
allowed on their own card), team tools (mcp__team__), the screen and browser tools (they already have
a turn-wide "Allow this turn"), a cloud computer's input tools (`REMOTE_INPUT`), a call whose input
does not say which tool runs (Codex's `mcp:<server>`, ACP's `acp:other`), an edit that asks for write
access to a whole folder (`grant_root`), and a call that is held for its own card (`held_for`).

The approval gate (thread_runtime.py) looks for a rule only after every automatic decision (plan
mode, grants, routines), only for a call that would otherwise ask, and only in a turn a person is
there for (never a room, a team job, a routine or a turn started from outside). A rule past its end
never matches, a rule of another conversation never matches, and the safety floor always wins: a call
that `held_for` names is asked about on its own card whatever rule matches.
"""

import json
import re
import shlex
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path

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
# The key is part of an index (ix_permission_rule_lookup); PostgreSQL's btree refuses an entry over
# about 2.7 KB, so a longer exact input is allowed one call at a time.
MAX_KEY_BYTES = 2000
MAX_LABEL_CHARS = 200
BROKER_CALL_TOOL = "mcp__community__custom_call"
_NEVER = ("mcp__composio__", "mcp__team__", "mcp__memory__", "mcp__community__custom_search")
# Reported by category, with an input that does not say which tool runs: Codex sends every call to
# one of its own MCP servers as `mcp:<server>` ({server, message}); an ACP agent sends any MCP or
# unknown tool as `acp:other` (its title, which names the tool, is not part of the input).
_CATEGORY_ONCE = ("mcp:",)
_TOOLS_ONCE = frozenset({"acp:other"})
# A cloud computer's tools that click, type, write or open (thread_runtime.py ThreadApprovalGate._about).
REMOTE_INPUT = "remote_input"
# A cloud computer tool that only looks: its screen, its pointer, a file, or a pause.
_REMOTE_READ_NAME = re.compile(r"(?:^|[_\-.])(?:screenshot|cursor_position|read_file|wait)$", re.IGNORECASE)
# Tools that change files, and where their input names the files.
FILE_TOOLS = frozenset({"Write", "Edit", "MultiEdit", "NotebookEdit", "apply_patch", "acp:edit", "acp:delete", "acp:move"})
_PATH_FIELDS = ("file_path", "notebook_path", "path")
# Where a command tool's input carries the command, and its arguments.
_COMMAND_FIELDS = ("command", "cmd", "script", "command_line", "commandLine")
_ARGS_FIELDS = ("args", "argv")
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


def remote_read_name(name: object) -> bool:
    """Whether a cloud computer tool's own name says it only looks (a screenshot, the pointer's
    position, reading a file, waiting)."""
    return isinstance(name, str) and bool(_REMOTE_READ_NAME.search(name))


def _words(value) -> str | None:
    """A command or its arguments as one string: a string as it is, a list of strings joined as a
    shell would read them, anything else None."""
    if isinstance(value, str):
        return value
    if isinstance(value, list) and all(isinstance(item, str) for item in value):
        return shlex.join(value)
    return None


def is_command_call(tool: object, kind: str | None = None) -> bool:
    return tool in COMMAND_TOOLS or tool == "acp:execute" or kind == "command"


def command_text(tool: object, tool_input: object, fields: tuple[str, ...] = _COMMAND_FIELDS) -> str | None:
    """The whole command a call runs, as one string (the command and its arguments), or None when
    its input carries no command that can be read as one. A brokered call's command is read from the
    arguments it passes on."""
    if not isinstance(tool_input, dict):
        return None
    source = tool_input
    if tool == BROKER_CALL_TOOL and isinstance(tool_input.get("arguments"), dict):
        source = tool_input["arguments"]
    field = next((name for name in fields if name in source), None)
    if field is None:
        return None
    text = _words(source[field])
    if text is None:
        return None
    for name in _ARGS_FIELDS:
        if name in source and source[name] not in (None, [], ""):
            more = _words(source[name])
            if more is None:
                return None
            text = f"{text} {more}"
    return text


def file_paths(tool: object, tool_input: object) -> list[str] | None:
    """The files a file tool's call changes, or None for a call that is not a file tool's. An empty
    list when its input names none that can be read."""
    if tool not in FILE_TOOLS or not isinstance(tool_input, dict):
        return None
    paths: list[str] = []
    for name in _PATH_FIELDS:
        if isinstance(tool_input.get(name), str):
            paths.append(tool_input[name])
    for name in ("changes", "edits"):
        for change in tool_input.get(name) or [] if isinstance(tool_input.get(name), list) else []:
            if isinstance(change, dict):
                for field in ("path", "move_path", "file_path"):
                    if isinstance(change.get(field), str):
                        paths.append(change[field])
    for location in tool_input.get("locations") or [] if isinstance(tool_input.get("locations"), list) else []:
        if isinstance(location, str):
            paths.append(location)
        elif isinstance(location, dict) and isinstance(location.get("path"), str):
            paths.append(location["path"])
    for name in ("destination", "new_path", "target"):
        if isinstance(tool_input.get(name), str):
            paths.append(tool_input[name])
    return paths


def inside_folder(path: str, folder: str | Path | None) -> bool:
    """Whether a path (relative ones read from the folder) is inside the folder, as Accept edits
    reads it (codex_adapter.py, acp_adapter.py)."""
    if folder is None or not isinstance(path, str) or not path:
        return False
    try:
        root = Path(folder)
        candidate = Path(path)
        if not candidate.is_absolute():
            candidate = root / candidate
        candidate.resolve().relative_to(root.resolve())
        return True
    except (ValueError, OSError):
        return False


def edits_outside(tool: object, tool_input: object, folder: str | Path | None) -> bool:
    """A file tool's call that changes anything outside the conversation's folder, asks for write
    access to a folder, or does not say which files it changes. False for any other tool."""
    paths = file_paths(tool, tool_input)
    if paths is None:
        return False
    if isinstance(tool_input, dict) and tool_input.get("grant_root"):
        return True
    return not paths or not all(inside_folder(path, folder) for path in paths)


def rule_key(tool: object, tool_input: object, kind: str | None = None) -> Key | None:
    """What a scoped allow of this call would be tied to, or None when this call can only be
    allowed once. Read from the stored tool, input and kind alone, so the card, the answer and
    the gate always agree."""
    if not isinstance(tool, str) or not isinstance(tool_input, dict):
        return None
    if tool.startswith(_NEVER) or tool in SCREEN_INPUT or tool in SCREEN_READ:
        return None
    if kind == REMOTE_INPUT or tool.startswith(_CATEGORY_ONCE) or tool in _TOOLS_ONCE:
        return None
    if tool_input.get("grant_root"):
        return None  # write access to a whole folder, for the rest of the engine's session
    if tool in COMMAND_TOOLS:
        command = tool_input.get("command")
        if not isinstance(command, str) or not command.strip():
            return None
        cwd = tool_input.get("cwd")
        if cwd is None:
            return Key(tool, command.strip())
        if not isinstance(cwd, str):
            return None
        # The same text in another folder is another command (`git clean -fdx` in another repository).
        return Key(tool, canonical({"command": command.strip(), "cwd": cwd}))
    if kind == "command" or tool.startswith("acp:"):
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


def held_for(tool: object, tool_input: object, kind: str | None = None) -> str | None:
    """Why this call must be answered on its own card, whatever scoped allow matches, or None:
    the safety-floor rule a shell command breaks (`unreadable` for one that cannot be read to the
    end, or a command call whose command cannot be read as one string), `grant_root` for an edit
    that asks for write access to a whole folder, or `credential` for an input that carries a
    secret. A command is read whole: a list is joined as a shell would read it, and its arguments
    are read with it."""
    if not isinstance(tool_input, dict):
        return None
    command_call = is_command_call(tool, kind)
    # Any other tool's `command` is read too, in case it is one.
    text = command_text(tool, tool_input, _COMMAND_FIELDS if command_call else ("command",))
    if text is None and command_call:
        return "unreadable"
    if text is not None and text.strip():
        reading = safety_floor.floor_reading(text)
        if not reading.clear:
            return reading.verdict.rule if reading.verdict else "unreadable"
    if tool_input.get("grant_root"):
        return "grant_root"
    for name, text in _strings(tool_input):
        if (name and _SECRET_FIELD.search(name) and text.strip()) or decision_log.contains_credential(text):
            return "credential"
    return None


def needs_own_card(tool: object, tool_input: object, kind: str | None = None) -> str | None:
    """Why "Allow all" must leave this call for its own card, or None: anything `held_for`
    names, a connected app (only ever allowed on its own card), a team tool (its card is the only
    confirmation for a change such as removing an agent, which cannot be undone), or a screen tool
    (its allow covers the rest of the turn, which is more than once)."""
    held = held_for(tool, tool_input, kind)
    if held is not None:
        return held
    if isinstance(tool, str) and tool.startswith("mcp__composio__"):
        return "connected_app"
    if isinstance(tool, str) and tool.startswith("mcp__team__"):
        return "team"
    if tool in SCREEN_INPUT:
        return "screen"
    return None


def validate(tool: object, tool_input: object, kind: str | None = None) -> Key:
    """The key a scoped allow of this call is saved with. Raises ScopeError, with words a
    person reads, when none can be."""
    key = rule_key(tool, tool_input, kind)
    held = held_for(tool, tool_input, kind)
    if held == "grant_root":
        raise ScopeError("this edit asks for write access to a whole folder, so it is answered on its own card")
    if key is None:
        raise ScopeError("this tool is only ever allowed one call at a time")
    if held == "credential":
        raise ScopeError("this call carries a credential, so it is answered on its own card")
    if held is not None:
        raise ScopeError("this command is on the safety floor and is always asked about")
    if key.key is not None and len(key.key.encode("utf-8")) > MAX_KEY_BYTES:
        raise ScopeError("this call is too long to save")
    return key


def scopes_for(tool: object, tool_input: object, kind: str | None = None, *, scoped: bool = True) -> list[str]:
    """The answers a card may offer for this call: always `once`, and `hour` and `thread` when
    a scoped allow can be saved for it. `scoped` False (a shared conversation, or a turn nobody is
    there for: `allows_in`) offers `once` only."""
    if not scoped:
        return [ONCE]
    try:
        validate(tool, tool_input, kind)
    except ScopeError:
        return [ONCE]
    return list(SCOPES)


def shared_thread(thread) -> bool:
    """A conversation that is not one person's own chat: a room member's, a team job's, a room's
    or a notice's. Its calls are allowed one at a time: an allow there would keep allowing calls in
    later turns driven by other agents, posts or webhooks."""
    return thread is None or thread.kind != "chat" or thread.job_id is not None or thread.room_id is not None


def allows_in(thread, origin: str | None) -> bool:
    """Whether a turn of this origin in this conversation may use, and offer, "Allow for 1 hour"
    and "Always in this chat": a person's own chat, in a turn a person started (never a routine,
    a webhook, a workflow, the team's own notices or a restricted device)."""
    return not shared_thread(thread) and origin in (None, "person")


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
    rule, _created = await save_rule(db, owner_id, thread_id, scope, tool, tool_input, kind, label, now=now)
    return rule


async def save_rule(
    db: AsyncSession, owner_id: str, thread_id: int, scope: str, tool: str, tool_input: dict,
    kind: str | None = None, label: str | None = None, *, now: datetime | None = None,
) -> tuple[PermissionRule, bool]:
    """`add_rule`, saying also whether the rule is new (False: an existing one was extended)."""
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
        return existing, False
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
    return rule, True


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
