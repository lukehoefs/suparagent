"""GET /api/v1/integrations/custom-mcp/connections/{id}/skills: the skills a server says it ships.

The server's `skills` tool is faked at the call boundary (custom_mcp_skills.call_skills); one test runs
the real client against an httpx MockTransport speaking MCP JSON-RPC."""
import json

import httpx
import pytest

from app import community_mcp as mcp
from app.services import custom_mcp_skills
from tests.routers.test_custom_mcp_api import (  # noqa: F401
    PATH, SECRET, URL, FakeServer, admin, app, auth_settings, client, code_of, factory, login, make, owner,
    pairing_code, ready, server, set_owner, tool,
)

EXECUTOR = {"skills": [
    {"name": "pfnz-rules", "description": "Rules for the\nPFNZ prospect list.", "app": {"name": "Sheets", "slug": "sheets"}},
    {"name": "gmail-triage", "description": "Sort the inbox.", "app": {"slug": "gmail"}},
]}


def skills_tool():
    return mcp._normalize_tool({"name": "skills", "description": "List skills", "inputSchema": {"type": "object", "properties": {}}})


class FakeSkills:
    def __init__(self):
        self.result: dict = {"content": [{"type": "text", "text": json.dumps(EXECUTOR)}], "isError": False}
        self.error: mcp.McpError | None = None
        self.calls: list[tuple[str, str | None, str | None]] = []

    async def call(self, endpoint, token, header):
        self.calls.append((endpoint, token, header))
        if self.error is not None:
            raise self.error
        return self.result


@pytest.fixture
def skills(monkeypatch):
    fake = FakeSkills()
    monkeypatch.setattr(custom_mcp_skills, "call_skills", fake.call)
    return fake


async def test_a_server_with_a_skills_tool_lists_name_app_and_one_line_description(admin, server, skills):
    server.tools = [tool("search"), skills_tool()]
    conn = await ready(admin, auth_mode="header", auth_header_name="X-Api-Key", credential=SECRET)
    found = await admin.get(f"{PATH}/connections/{conn['id']}/skills")
    assert found.status_code == 200, found.text
    assert found.headers["cache-control"] == "no-store"
    assert found.json() == [
        {"name": "pfnz-rules", "app": "Sheets", "description": "Rules for the PFNZ prospect list."},
        {"name": "gmail-triage", "app": "gmail", "description": "Sort the inbox."},
    ]
    assert skills.calls == [(URL, SECRET, "X-Api-Key")]


async def test_a_server_without_a_skills_tool_is_not_called(admin, skills):
    conn = await ready(admin)
    refused = await admin.get(f"{PATH}/connections/{conn['id']}/skills")
    assert refused.status_code == 404 and code_of(refused) == "skills_not_offered"
    assert skills.calls == []


async def test_a_switched_off_or_untested_server_is_not_called(admin, server, skills):
    server.tools = [skills_tool()]
    draft = await make(admin)
    untested = await admin.get(f"{PATH}/connections/{draft['id']}/skills")
    assert untested.status_code == 409 and code_of(untested) == "connection_not_tested"
    conn = await ready(admin, name="Second")
    off = await admin.post(f"{PATH}/connections/{conn['id']}/disable", json={"revision": conn["revision"]})
    assert off.status_code == 200
    refused = await admin.get(f"{PATH}/connections/{conn['id']}/skills")
    assert refused.status_code == 409 and code_of(refused) == "connection_not_enabled"
    assert skills.calls == []


async def test_a_skills_tool_that_needs_arguments_is_not_called(admin, server, skills):
    server.tools = [mcp._normalize_tool({"name": "skills", "inputSchema": {
        "type": "object", "properties": {"app": {"type": "string"}}, "required": ["app"]}})]
    conn = await ready(admin)
    refused = await admin.get(f"{PATH}/connections/{conn['id']}/skills")
    assert refused.status_code == 404 and code_of(refused) == "skills_not_offered"
    assert skills.calls == []


async def test_a_failing_server_reports_its_error_code(admin, server, skills):
    server.tools = [skills_tool()]
    conn = await ready(admin)
    skills.error = mcp.McpError("remote_timeout", "slow", 504)
    failed = await admin.get(f"{PATH}/connections/{conn['id']}/skills")
    assert failed.status_code == 504 and code_of(failed) == "remote_timeout"
    skills.error = None
    skills.result = {"content": [{"type": "text", "text": "not json"}], "isError": False}
    unreadable = await admin.get(f"{PATH}/connections/{conn['id']}/skills")
    assert unreadable.status_code == 502 and code_of(unreadable) == "invalid_response"


async def test_a_skills_list_that_repeats_the_secret_is_refused(admin, server, skills):
    server.tools = [skills_tool()]
    conn = await ready(admin, auth_mode="bearer", credential=SECRET)
    skills.result = {"structuredContent": {"skills": [{"name": "leak", "description": f"token {SECRET}"}]}}
    refused = await admin.get(f"{PATH}/connections/{conn['id']}/skills")
    assert refused.status_code == 502 and code_of(refused) == "unsafe_metadata"
    assert SECRET not in refused.text


async def test_signed_out_callers_cannot_read_skills(app, factory, server, owner, monkeypatch):
    from app.core.config import settings
    monkeypatch.setattr(settings, "LOCAL_EXECUTION_ENABLED", True)
    await set_owner(factory)
    async with client(app) as api:
        refused = await api.get(f"{PATH}/connections/anything/skills")
        assert refused.status_code in (401, 403)


# ---------------------------------------------------------------- parsing

def test_parse_reads_structured_content_and_skips_unreadable_entries():
    result = {"structuredContent": {"skills": [
        {"name": "a", "app": "Gmail"}, "junk", {"name": ""}, {"description": "no name"},
        {"name": "a", "app": "Gmail"}, {"name": "b" * 500, "description": "x" * 1000, "app": {"name": 3, "slug": "hub"}},
    ]}}
    found = custom_mcp_skills.parse(result)
    assert found[0] == {"name": "a", "app": "Gmail", "description": ""}
    assert len(found) == 2
    assert len(found[1]["name"]) == custom_mcp_skills.NAME_MAX and found[1]["name"].endswith("…")
    assert len(found[1]["description"]) == custom_mcp_skills.DESCRIPTION_MAX and found[1]["app"] == "hub"


def test_parse_accepts_a_bare_list_split_over_text_parts_and_caps_the_count():
    text = json.dumps([{"name": f"s{i}"} for i in range(500)])
    half = len(text) // 2
    found = custom_mcp_skills.parse({"content": [{"type": "text", "text": text[:half]}, {"type": "text", "text": text[half:]}]})
    assert len(found) == custom_mcp_skills.MAX_SKILLS and found[0] == {"name": "s0", "app": None, "description": ""}


def test_parse_refuses_errors_oversized_text_and_unrelated_shapes():
    with pytest.raises(mcp.McpError) as error:
        custom_mcp_skills.parse({"content": [{"type": "text", "text": "{}"}], "isError": True})
    assert error.value.code == "remote_error"
    with pytest.raises(mcp.McpError) as error:
        custom_mcp_skills.parse({"content": [{"type": "text", "text": "x" * (custom_mcp_skills.MAX_TEXT_BYTES + 1)}]})
    assert error.value.code == "response_too_large"
    with pytest.raises(mcp.McpError) as error:
        custom_mcp_skills.parse({"structuredContent": {"tools": []}, "content": []})
    assert error.value.code == "invalid_response"


def test_offers_skills_needs_a_tool_named_skills_without_required_arguments():
    assert custom_mcp_skills.offers_skills([tool("search"), skills_tool()])
    assert not custom_mcp_skills.offers_skills([tool("search")])
    assert not custom_mcp_skills.offers_skills(None)
    assert not custom_mcp_skills.offers_skills([{"name": "skills", "inputSchema": {"type": "object", "required": ["x"]}}])


# ---------------------------------------------------------------- the real client against a fake server

async def test_call_skills_speaks_mcp_through_the_shared_client(monkeypatch):
    seen: list[dict] = []

    def handler(request: httpx.Request) -> httpx.Response:
        if request.method == "DELETE":
            return httpx.Response(204)
        message = json.loads(request.content)
        seen.append({"method": message.get("method"), "params": message.get("params"),
                     "auth": request.headers.get("authorization")})
        if message["method"] == "initialize":
            return httpx.Response(200, json={"jsonrpc": "2.0", "id": message["id"], "result": {
                "protocolVersion": "2025-06-18", "serverInfo": {"name": "Executor"}}}, headers={"mcp-session-id": "s1"})
        if message["method"] == "notifications/initialized":
            return httpx.Response(202)
        return httpx.Response(200, json={"jsonrpc": "2.0", "id": message["id"], "result": {
            "content": [{"type": "text", "text": json.dumps(EXECUTOR)}]}})

    class Session(mcp.RemoteMcpSession):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, **kwargs)
            self.client = httpx.AsyncClient(transport=httpx.MockTransport(handler))

    monkeypatch.setattr(custom_mcp_skills.mcp, "RemoteMcpSession", Session)
    found = await custom_mcp_skills.read(URL, "tok", None)
    assert [skill["name"] for skill in found] == ["pfnz-rules", "gmail-triage"]
    assert [item["method"] for item in seen] == ["initialize", "notifications/initialized", "tools/call"]
    assert seen[-1]["params"] == {"name": "skills", "arguments": {}}
    assert seen[-1]["auth"] == "Bearer tok"
