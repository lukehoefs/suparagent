"""Activity feed titles are agent-first sentences, and still read when the agent is gone."""
import pytest

from app.services import activity_copy


@pytest.mark.parametrize("event,expected", [
    ("finished", "Prosper finished Production digest"),
    ("needs_approval", "Prosper needs your approval on Production digest"),
    ("failed", "Prosper's Production digest failed"),
    ("incomplete", "Prosper's Production digest has incomplete coverage"),
    ("interrupted", "Prosper's Production digest was interrupted"),
    ("missed", "Prosper's Production digest missed a run"),
    ("missed_many", "Prosper's Production digest missed runs"),
    ("paused", "Prosper's Production digest was paused"),
])
def test_routine_titles_start_with_the_agent(event, expected):
    assert activity_copy.routine_title(event, "Production digest", "Prosper") == expected


@pytest.mark.parametrize("event,expected", [
    ("finished", "Production digest finished"),
    ("needs_approval", "Production digest needs your approval"),
    ("failed", "Production digest failed"),
    ("missed", "Production digest missed a run"),
])
def test_routine_titles_start_with_the_routine_when_the_agent_is_gone(event, expected):
    assert activity_copy.routine_title(event, "Production digest", None) == expected
    assert activity_copy.routine_title(event, " Production digest ", "  ") == expected


def test_every_routine_event_has_wording_and_unknown_events_are_refused():
    for event in activity_copy.ROUTINE_EVENTS:
        title = activity_copy.routine_title(event, "Digest", "Atlas")
        assert title.startswith("Atlas") and "Digest" in title and "[" not in title
    with pytest.raises(ValueError):
        activity_copy.routine_title("exploded", "Digest", "Atlas")


def test_task_due_titles():
    assert activity_copy.task_due_title("Q4 fleet list refresh", "Prosper") == "Prosper has a task due: Q4 fleet list refresh"
    assert activity_copy.task_due_title("Q4 fleet list refresh", None) == "Q4 fleet list refresh is due"
    assert activity_copy.task_due_title("  ", None) == "A task is due"
