"""Approval modes: how much a conversation may do before it asks.

A mode is a name the person picks; the Claude CLI's own permission mode does
the enforcing, so this app never re-implements what the CLI already decides.

    ask            every call the CLI would ask about waits for Allow or Deny
    accept_edits   file edits inside the workspace go through; the rest still asks
    approve_for_me the engine's native safety reviewer handles eligible requests
    plan           read-only: the CLI plans and edits nothing
    full_access    the agent does not wait for a person before its tool calls

Full access never uses an engine's own "skip permissions" switch (Claude's
bypassPermissions, Codex's `never` policy, Cursor's --force). The engine still
asks this app about every call it would ask a person about (Claude runs in
acceptEdits, so only edits inside the workspace go through natively), and the
app's approval gate (thread_runtime.ThreadApprovalGate.open) records each call
and allows it at once. The one exception is what approval_scopes.held_for()
holds: a command on the safety floor, a command that cannot be read, an input
that carries a credential, an edit asking for a whole folder (grant_root). Those
still wait for a person on a card, as does removing an agent from a team. So no
run skips permissions: full access only answers them automatically.

`mode=None` means "not chosen" and behaves exactly as before modes existed (ask).
"""

DEFAULT_MODE = "ask"
FULL_ACCESS = "full_access"
MODES = ("ask", "accept_edits", "approve_for_me", "plan", FULL_ACCESS)
NATIVE_REVIEW_ENGINES = frozenset({"claude", "codex", "cursor"})
# Tools full access never answers on its own: removing an agent is always the person's card
# (app/team/policy.py), whatever the mode.
FULL_ACCESS_ALWAYS_ASKED = frozenset({"mcp__team__propose_bot_deletion"})

# The CLI's --permission-mode value for each mode. Full access is acceptEdits, never
# bypassPermissions: everything but a workspace edit still reaches this app's gate.
_CLI_MODE = {
    "ask": "default",
    "accept_edits": "acceptEdits",
    "approve_for_me": "auto",
    "plan": "plan",
    FULL_ACCESS: "acceptEdits",
}


class UnknownApprovalMode(ValueError):
    pass


def validate_mode(mode: str | None) -> str:
    """The mode, or the default for None. Raises UnknownApprovalMode."""
    if mode is None:
        return DEFAULT_MODE
    if mode not in MODES:
        raise UnknownApprovalMode(f"approval mode must be one of: {', '.join(MODES)}")
    return mode


def cli_permission_mode(mode: str | None) -> str:
    """The value for the CLI's `--permission-mode`."""
    return _CLI_MODE[validate_mode(mode)]


def modes_for_engine(engine: str | None) -> tuple[str, ...]:
    """Modes this engine can enforce natively; unsupported modes run as Ask."""
    return tuple(
        mode for mode in MODES
        if mode != "approve_for_me" or engine in NATIVE_REVIEW_ENGINES
    )
