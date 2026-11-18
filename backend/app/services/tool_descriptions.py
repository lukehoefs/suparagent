"""What an approval card says about a tool: one plain sentence on what it does, and how much it
can change.

    risk  read_only    it only reads: changes nothing and sends nothing
          changes      it can create or change things
          destructive  it can delete things, or send something to someone
          None         not known; the card shows no tag

For a tool from an MCP server the sentence is the first sentence of the server's own description,
and the risk comes from its annotations (`readOnlyHint`, `destructiveHint`). Both come from the
server and are untrusted: they only choose the words on the card and never decide anything (every
call still asks, whatever its risk). For a built-in tool both come from the map below. A tool this
module does not know gets (None, None).
"""

import re

from app.computers.policy import BROWSER_INPUT, BROWSER_READ, COMPUTER_TOOL_PREFIX, NATIVE_INPUT, NATIVE_READ
from app.services import decision_log

READ_ONLY, CHANGES, DESTRUCTIVE = "read_only", "changes", "destructive"
RISKS = (READ_ONLY, CHANGES, DESTRUCTIVE)
MAX_SUMMARY_CHARS = 200

# The built-in sentences. The web app shows its own translation of each (keyed by tool name in
# frontend/lib/approval-card.ts); keep the two in step.
_SHELL = "Runs a shell command in the agent's folder. It can change or delete files."
_READ = "Reads a file. Changes nothing and sends nothing."
_FIND = "Finds files or searches inside them. Changes nothing and sends nothing."
_WRITE = "Creates or changes files in the agent's folder."
_WEB = "Reads a web page or searches the web. Changes nothing."
_COMPUTER_SHELL = "Runs a shell command on the agent's computer. It can change or delete files there."
_COMPUTER_READ = "Reads files on the agent's computer. Changes nothing."
_COMPUTER_WRITE = "Writes a file on the agent's computer."
_SCREEN_READ = "Looks at the agent's screen. Changes nothing."
_SCREEN_INPUT = "Clicks, types or scrolls on the agent's computer."
_BROWSER_READ = "Reads a page in the agent's browser. Changes nothing."
_BROWSER_INPUT = "Opens pages, clicks and types in the agent's browser."
_NATIVE_READ = "Looks at the screen and windows of this Mac. Changes nothing."
_NATIVE_INPUT = "Clicks, types or presses keys on this Mac."
_DELEGATE = "Asks another agent to do part of the work."
_CREATE_AGENT = "Creates a new agent."
_ROOM_POST = "Posts a message in a room."

_BUILT_IN: dict[str, tuple[str, str]] = {
    "Bash": (_SHELL, DESTRUCTIVE),
    "Read": (_READ, READ_ONLY),
    "NotebookRead": (_READ, READ_ONLY),
    "Glob": (_FIND, READ_ONLY),
    "Grep": (_FIND, READ_ONLY),
    "LS": (_FIND, READ_ONLY),
    "Write": (_WRITE, CHANGES),
    "Edit": (_WRITE, CHANGES),
    "MultiEdit": (_WRITE, CHANGES),
    "NotebookEdit": (_WRITE, CHANGES),
    "apply_patch": (_WRITE, CHANGES),
    "WebFetch": (_WEB, READ_ONLY),
    "WebSearch": (_WEB, READ_ONLY),
    COMPUTER_TOOL_PREFIX + "exec": (_COMPUTER_SHELL, DESTRUCTIVE),
    COMPUTER_TOOL_PREFIX + "read_file": (_COMPUTER_READ, READ_ONLY),
    COMPUTER_TOOL_PREFIX + "list_files": (_COMPUTER_READ, READ_ONLY),
    COMPUTER_TOOL_PREFIX + "write_file": (_COMPUTER_WRITE, CHANGES),
    COMPUTER_TOOL_PREFIX + "screenshot": (_SCREEN_READ, READ_ONLY),
    COMPUTER_TOOL_PREFIX + "wait": (_SCREEN_READ, READ_ONLY),
    **{COMPUTER_TOOL_PREFIX + name: (_SCREEN_INPUT, CHANGES)
       for name in ("click", "double_click", "move", "drag", "type", "key", "scroll")},
    **{tool: (_BROWSER_READ, READ_ONLY) for tool in BROWSER_READ},
    **{tool: (_BROWSER_INPUT, CHANGES) for tool in BROWSER_INPUT},
    **{tool: (_NATIVE_READ, READ_ONLY) for tool in NATIVE_READ},
    **{tool: (_NATIVE_INPUT, CHANGES) for tool in NATIVE_INPUT},
    "mcp__team__ask_agent": (_DELEGATE, CHANGES),
    "mcp__team__delegate": (_DELEGATE, CHANGES),
    "mcp__team__create_agent": (_CREATE_AGENT, CHANGES),
    "mcp__team__say_in_room": (_ROOM_POST, DESTRUCTIVE),
}

# The kinds an ACP engine reports (acp_adapter.py), for a call that is not a plain shell command.
_ACP: dict[str, tuple[str, str]] = {
    "read": (_READ, READ_ONLY),
    "search": (_FIND, READ_ONLY),
    "fetch": (_WEB, READ_ONLY),
    "edit": (_WRITE, CHANGES),
    "move": (_WRITE, CHANGES),
    "delete": ("Deletes files in the agent's folder.", DESTRUCTIVE),
    "execute": (_SHELL, DESTRUCTIVE),
}

# Words in a connected-app tool's name that mean it deletes something or sends something to someone.
_SENDS_OR_DELETES = re.compile(
    r"(?:^|_)(?:delete|remove|destroy|drop|trash|purge|erase|wipe|send|post|reply|forward|publish|"
    r"comment|invite|share|merge)(?:_|$)"
)
_MARKUP = re.compile(r"[`*]+|^[#>\s]+")
_SENTENCE = re.compile(r"^(.+?[.!?])(?:\s|$)")


def first_sentence(text: object) -> str | None:
    """The first sentence of a description, as plain text on one line, cut to a readable length;
    None when there is nothing to say. Anything that looks like a secret is removed."""
    if not isinstance(text, str):
        return None
    lines = [_MARKUP.sub("", line) for line in text.splitlines()]
    flat = "".join(char for char in " ".join(" ".join(lines).split()) if char.isprintable())
    if not flat:
        return None
    found = _SENTENCE.match(flat)
    sentence = found.group(1) if found else flat
    if len(sentence) > MAX_SUMMARY_CHARS:
        sentence = sentence[: MAX_SUMMARY_CHARS - 1].rsplit(" ", 1)[0].rstrip(",;:") + "…"
    elif sentence[-1] not in ".!?":
        sentence += "."
    sentence = decision_log.redact(sentence)
    return sentence[:1].upper() + sentence[1:]


def risk_from_annotations(annotations: object) -> str | None:
    """An MCP tool's risk from its annotations, read as the MCP spec defines them: `readOnlyHint`
    true means it only reads; otherwise `destructiveHint` (true unless the server says false) says
    whether its changes can destroy. No hints at all is not known."""
    if not isinstance(annotations, dict):
        return None
    read_only, destructive = annotations.get("readOnlyHint"), annotations.get("destructiveHint")
    if read_only is True:
        return READ_ONLY
    if destructive is True:
        return DESTRUCTIVE
    if destructive is False:
        return CHANGES
    if read_only is False:
        return DESTRUCTIVE  # the spec's default when a tool says it writes and nothing more
    return None


def mcp_tool(description: object, annotations: object) -> tuple[str | None, str | None]:
    """(sentence, risk) for a tool from an MCP server."""
    return first_sentence(description), risk_from_annotations(annotations)


def connected_app_tool(name: str) -> tuple[str | None, str | None]:
    """(sentence, risk) for a connected-app tool (mcp__composio__<name>)."""
    from app import composio_tools

    found = composio_tools.BY_NAME.get(name)
    if found is None:
        return None, None
    if found.kind == "read":
        risk = READ_ONLY
    else:
        risk = DESTRUCTIVE if _SENDS_OR_DELETES.search(found.name) else CHANGES
    return first_sentence(found.description), risk


def built_in(tool: str) -> tuple[str | None, str | None]:
    """(sentence, risk) for a tool this app provides itself, or (None, None)."""
    if tool in _BUILT_IN:
        return _BUILT_IN[tool]
    if tool.startswith("acp:"):
        return _ACP.get(tool.removeprefix("acp:"), (None, None))
    if tool.startswith("mcp__composio__"):
        return connected_app_tool(tool.removeprefix("mcp__composio__"))
    return None, None
