"""What an approval card says about a tool: the sentence and the risk tag, from an MCP server's
description and annotations or from the app's own words for its built-in tools."""

import pytest

from app import community_mcp
from app.services import tool_descriptions as about


@pytest.mark.parametrize("text,expected", [
    ("Take a **screenshot** of the desktop. Returns a PNG image.", "Take a screenshot of the desktop."),
    ("click the mouse at x, y", "Click the mouse at x, y."),
    ("# Search\n\nSearches the `web`.\nArgs: query", "Search Searches the web."),
    ("Is it raining?  Ask the weather service.", "Is it raining?"),
    ("", None),
    ("   \n  ", None),
    (None, None),
    (42, None),
])
def test_the_first_sentence_of_a_description(text, expected):
    assert about.first_sentence(text) == expected


def test_a_long_description_is_cut_at_a_word():
    sentence = about.first_sentence("word " * 100)
    assert len(sentence) <= about.MAX_SUMMARY_CHARS and sentence.endswith("…") and " wor…" not in sentence


def test_a_secret_in_a_description_is_not_repeated():
    sentence = about.first_sentence("Calls the API with token=abcdef0123456789abcdef0123 set.")
    assert "abcdef0123456789" not in sentence


@pytest.mark.parametrize("annotations,risk", [
    ({"readOnlyHint": True}, "read_only"),
    ({"readOnlyHint": True, "destructiveHint": True}, "read_only"),  # a read-only tool changes nothing to destroy
    ({"destructiveHint": True}, "destructive"),
    ({"readOnlyHint": False, "destructiveHint": False}, "changes"),
    ({"destructiveHint": False}, "changes"),
    ({"readOnlyHint": False}, "destructive"),  # the MCP spec's default for a writing tool
    ({"idempotentHint": True}, None),
    ({}, None),
    (None, None),
    ({"readOnlyHint": "yes"}, None),
])
def test_risk_from_mcp_annotations(annotations, risk):
    assert about.risk_from_annotations(annotations) == risk


@pytest.mark.parametrize("tool,risk", [
    ("Bash", "destructive"),
    ("Read", "read_only"),
    ("Grep", "read_only"),
    ("Write", "changes"),
    ("Edit", "changes"),
    ("apply_patch", "changes"),
    ("WebFetch", "read_only"),
    ("mcp__computer__exec", "destructive"),
    ("mcp__computer__screenshot", "read_only"),
    ("mcp__computer__click", "changes"),
    ("mcp__computer__write_file", "changes"),
    ("mcp__team__say_in_room", "destructive"),
    ("acp:delete", "destructive"),
    ("acp:read", "read_only"),
    ("mcp__composio__github_list_issues", "read_only"),
    ("mcp__composio__github_create_issue", "changes"),
    ("mcp__composio__gmail_send_email", "destructive"),
    ("mcp__composio__github_comment_on_issue", "destructive"),
])
def test_built_in_tools_have_a_sentence_and_a_risk(tool, risk):
    sentence, found = about.built_in(tool)
    assert found == risk
    assert sentence and sentence.endswith(".") and "[" not in sentence


@pytest.mark.parametrize("tool", ["SomethingNew", "mcp__composio__not_a_tool", "acp:think", "mcp:server"])
def test_an_unknown_tool_says_nothing(tool):
    assert about.built_in(tool) == (None, None)


def test_mcp_annotation_hints_are_kept_outside_the_schema_digest():
    raw = {"name": "screenshot", "description": "Take a screenshot.",
           "inputSchema": {"type": "object", "properties": {}}}
    plain = community_mcp._normalize_tool(raw)
    hinted = community_mcp._normalize_tool({**raw, "annotations": {
        "readOnlyHint": True, "destructiveHint": "no", "title": "Screenshot", "openWorldHint": False}})
    assert "annotations" not in plain
    assert hinted["annotations"] == {"readOnlyHint": True, "openWorldHint": False}
    assert hinted["schema_digest"] == plain["schema_digest"]  # a grant stays valid when hints change
    assert community_mcp.annotations_for([hinted], "screenshot", plain["schema_digest"]) == hinted["annotations"]
    assert community_mcp.annotations_for([hinted], "screenshot", "other") == {}
    assert community_mcp.annotations_for(None, "screenshot", plain["schema_digest"]) == {}
