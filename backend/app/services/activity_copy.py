"""Agent-first wording for the activity feed: the titles of the notifications
routines and task reminders write ("Prosper finished Production digest").

Pure text, no database. The feed shows these titles as they are and the
Telegram copy starts with them; the kind of a notification, not its title,
is what the apps act on, so the wording can change freely."""

# What a routine's notification reports, and the words that follow
# "<Agent>'s <routine>" (or "<routine>" when the agent is gone).
_ROUTINE_TAILS = {
    "failed": "failed",
    "incomplete": "has incomplete coverage",
    "interrupted": "was interrupted",
    "missed": "missed a run",
    "missed_many": "missed runs",
    "paused": "was paused",
}
ROUTINE_EVENTS = ("finished", "needs_approval", *_ROUTINE_TAILS)


def _clean(text: str | None) -> str | None:
    text = (text or "").strip()
    return text or None


def routine_title(event: str, routine_name: str, agent_name: str | None) -> str:
    """The feed title for a routine event. `agent_name` is None when the
    routine's agent no longer exists; the sentence then starts with the
    routine."""
    if event not in ROUTINE_EVENTS:
        raise ValueError(f"unknown routine event: {event}")
    routine = _clean(routine_name) or "A routine"
    agent = _clean(agent_name)
    if event == "finished":
        return f"{agent} finished {routine}" if agent else f"{routine} finished"
    if event == "needs_approval":
        return f"{agent} needs your approval on {routine}" if agent else f"{routine} needs your approval"
    tail = _ROUTINE_TAILS[event]
    return f"{agent}'s {routine} {tail}" if agent else f"{routine} {tail}"


def task_due_title(task_title: str, agent_name: str | None) -> str:
    """The feed title for a task's deadline reminder: agent-first when the
    task is assigned to an agent."""
    task = _clean(task_title) or "A task"
    agent = _clean(agent_name)
    return f"{agent} has a task due: {task}" if agent else f"{task} is due"
