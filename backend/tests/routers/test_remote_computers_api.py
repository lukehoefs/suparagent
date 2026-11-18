"""/api/v1/remote-computers: linking a gateway's custom MCP connection to an agent, its status,
screen, take control and hand back, and single-use viewer tickets.

The gateway is faked at the network boundary: `/healthz` through an httpx mock transport, the
screenshot tool through a fake MCP session. The SSRF rules of the shared MCP client are covered
by its own tests."""
import base64
import json
from uuid import uuid4

import httpx
import pytest
from sqlalchemy import delete, select

from app import community_mcp as mcp
from app.db.models import Agent, CustomMcpConnection, RemoteComputer, UserCredential
from app.routers import custom_mcp
from app.services import remote_computers as service
from tests.auth.test_auth_api import (  # noqa: F401
    app, auth_settings, client, factory, login, set_owner,
)
from tests.routers.test_custom_mcp_api import (  # noqa: F401
    SECRET, admin, owner, ready, server, tool,
)

PATH = "/api/v1/remote-computers"
MCP_PATH = "/api/v1/integrations/custom-mcp"
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32


class Gateway:
    """The gateway's /healthz, and every request the backend made to it."""

    def __init__(self):
        self.status = 200
        self.error: Exception | None = None
        self.requests: list[httpx.Request] = []

    def handler(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        if self.error is not None:
            raise self.error
        return httpx.Response(self.status, text="ok")


@pytest.fixture
def gateway(monkeypatch):
    fake = Gateway()
    service.forget()
    monkeypatch.setattr(service, "_health_client", lambda: httpx.AsyncClient(transport=httpx.MockTransport(fake.handler)))
    yield fake
    service.forget()


class Screen:
    """Stands in for the MCP session the screenshot is taken through."""

    def __init__(self):
        self.tools = [tool("computer_screenshot")]
        self.images = [("image/png", PNG)]
        self.error: mcp.McpError | None = None
        self.calls: list[tuple[str, str, str]] = []
        self.listed = 0

    def session(self, endpoint, token):
        screen = self

        class Session:
            async def list_tools(self):
                screen.listed += 1
                return list(screen.tools)

            async def call_tool_images(self, name, arguments):
                screen.calls.append((endpoint, token, name))
                if screen.error is not None:
                    raise screen.error
                return list(screen.images)

            async def close(self):
                pass

        return Session()


@pytest.fixture
def screen(monkeypatch, server):
    fake = Screen()
    server.tools = [tool("computer_screenshot"), tool("computer_click_mouse")]
    monkeypatch.setattr(service, "_session", fake.session)
    return fake


@pytest.fixture
async def connection(admin, server, gateway):
    """A tested, enabled bearer connection to a gateway, with its key saved."""
    server.tools = [tool("computer_screenshot"), tool("computer_click_mouse")]
    return await ready(admin, name="Atlas gateway", auth_mode="bearer", credential=SECRET)


async def new_agent(factory, owner, name="Atlas") -> int:
    async with factory() as db:
        agent = Agent(owner_id=owner, name=name + " " + uuid4().hex[:6], instructions="help", provider="claude",
                      approval_mode="ask")
        db.add(agent)
        await db.commit()
        return agent.id


async def link(admin, connection, **body) -> dict:
    created = await admin.post(PATH, json={"name": "Atlas desktop", "mcp_connection_id": connection["id"], **body})
    assert created.status_code == 201, created.text
    return created.json()


def code_of(response) -> str:
    return response.json()["detail"]["error_code"]


# ---------------------------------------------------------------- CRUD

async def test_linking_a_gateway_derives_its_address_and_never_shows_the_key(admin, connection, gateway):
    computer = await link(admin, connection)
    assert computer["base_url"] == "https://tools.example.com"
    assert computer["mcp_connection_id"] == connection["id"] and computer["connection_name"] == "Atlas gateway"
    assert computer["state"] == "online" and computer["live_view"] is True
    assert computer["human_control"] is False and computer["control_started_at"] is None
    assert computer["agent_id"] is None and computer["agent_name"] is None
    assert computer["last_error"] is None and computer["last_checked_at"]
    [probe] = gateway.requests
    assert str(probe.url) == "https://tools.example.com/healthz"
    assert "authorization" not in probe.headers  # the health check never carries the key
    listed = await admin.get(PATH)
    assert listed.status_code == 200 and [c["id"] for c in listed.json()] == [computer["id"]]
    assert SECRET not in listed.text and SECRET not in json.dumps(computer)
    assert listed.headers["cache-control"] == "no-store"


async def test_an_address_cannot_be_given_by_the_client(admin, connection):
    refused = await admin.post(PATH, json={"name": "X", "mcp_connection_id": connection["id"],
                                           "base_url": "https://169.254.169.254"})
    assert refused.status_code == 422
    assert (await admin.get(PATH)).json() == []


async def test_rename_link_and_unlink_an_agent(admin, connection, factory, owner):
    computer = await link(admin, connection)
    agent_id = await new_agent(factory, owner)
    renamed = await admin.patch(f"{PATH}/{computer['id']}", json={"name": "  Atlas   desk  "})
    assert renamed.status_code == 200 and renamed.json()["name"] == "Atlas desk"
    linked = await admin.patch(f"{PATH}/{computer['id']}", json={"agent_id": agent_id})
    assert linked.status_code == 200
    assert linked.json()["agent_id"] == agent_id and linked.json()["agent_name"].startswith("Atlas ")
    assert linked.json()["name"] == "Atlas desk"  # fields not sent stay
    unlinked = await admin.patch(f"{PATH}/{computer['id']}", json={"agent_id": None})
    assert unlinked.status_code == 200 and unlinked.json()["agent_id"] is None and unlinked.json()["agent_name"] is None


async def test_removing_the_link_keeps_the_connection_and_its_key(admin, connection, factory, owner):
    computer = await link(admin, connection)
    removed = await admin.delete(f"{PATH}/{computer['id']}")
    assert removed.status_code == 204
    assert (await admin.get(PATH)).json() == []
    [kept] = (await admin.get(f"{MCP_PATH}/connections")).json()
    assert kept["id"] == connection["id"] and kept["credential_configured"] is True and kept["enabled"] is True
    assert (await admin.delete(f"{PATH}/{computer['id']}")).status_code == 404


async def test_deleting_the_connection_removes_its_link(admin, connection, factory):
    computer = await link(admin, connection)
    assert (await admin.delete(f"{MCP_PATH}/connections/{connection['id']}")).status_code == 204
    async with factory() as db:
        assert await db.get(RemoteComputer, computer["id"]) is None


async def test_unknown_connection_agent_and_computer_are_not_found(admin, connection):
    missing = await admin.post(PATH, json={"name": "X", "mcp_connection_id": str(uuid4())})
    assert missing.status_code == 404 and code_of(missing) == "connection_not_found"
    no_agent = await admin.post(PATH, json={"name": "X", "mcp_connection_id": connection["id"], "agent_id": 999_999_999})
    assert no_agent.status_code == 404 and code_of(no_agent) == "agent_not_found"
    for method, suffix in (("patch", ""), ("post", "/check"), ("get", "/screenshot"), ("post", "/take-control"),
                           ("post", "/hand-back")):
        kwargs = {"json": {"name": "Y"}} if method == "patch" else {}
        response = await getattr(admin, method)(f"{PATH}/999999999{suffix}", **kwargs)
        assert response.status_code == 404 and code_of(response) == "remote_computer_not_found", suffix


async def test_only_a_bearer_connection_can_be_a_computer(admin, server):
    other = await ready(admin, name="Open server")  # auth_mode none
    refused = await admin.post(PATH, json={"name": "X", "mcp_connection_id": other["id"]})
    assert refused.status_code == 422 and code_of(refused) == "bearer_required"


async def test_blank_or_control_character_names_are_refused(admin, connection):
    for name in ("   ", "bad\x07name"):
        refused = await admin.post(PATH, json={"name": name, "mcp_connection_id": connection["id"]})
        assert refused.status_code == 422, name
    computer = await link(admin, connection)
    assert (await admin.patch(f"{PATH}/{computer['id']}", json={"name": None})).status_code == 422


# ---------------------------------------------------------------- conflicts

async def test_one_connection_is_one_computer(admin, connection):
    await link(admin, connection)
    again = await admin.post(PATH, json={"name": "Twice", "mcp_connection_id": connection["id"]})
    assert again.status_code == 409 and code_of(again) == "connection_already_linked"


async def test_one_agent_has_at_most_one_computer(admin, server, connection, factory, owner):
    agent_id = await new_agent(factory, owner)
    first = await link(admin, connection, agent_id=agent_id)
    assert first["agent_id"] == agent_id
    second_connection = await ready(admin, name="Second gateway", auth_mode="bearer", credential=SECRET,
                                    endpoint="https://second.example.com/mcp")
    taken = await admin.post(PATH, json={"name": "B", "mcp_connection_id": second_connection["id"], "agent_id": agent_id})
    assert taken.status_code == 409 and code_of(taken) == "agent_already_linked"
    second = await link(admin, second_connection)
    assert second["base_url"] == "https://second.example.com"
    moved = await admin.patch(f"{PATH}/{second['id']}", json={"agent_id": agent_id})
    assert moved.status_code == 409 and code_of(moved) == "agent_already_linked"
    same = await admin.patch(f"{PATH}/{first['id']}", json={"agent_id": agent_id})
    assert same.status_code == 200  # linking the same agent again is no conflict


async def test_an_archived_agent_cannot_be_linked(admin, connection, factory, owner):
    from datetime import UTC, datetime
    agent_id = await new_agent(factory, owner)
    async with factory() as db:
        (await db.get(Agent, agent_id)).archived_at = datetime.now(UTC)
        await db.commit()
    refused = await admin.post(PATH, json={"name": "X", "mcp_connection_id": connection["id"], "agent_id": agent_id})
    assert refused.status_code == 404 and code_of(refused) == "agent_not_found"


# ---------------------------------------------------------------- status

async def test_a_gateway_that_does_not_answer_200_is_offline(admin, connection, gateway):
    gateway.status = 503
    computer = await link(admin, connection)
    assert computer["state"] == "offline" and computer["live_view"] is False
    assert computer["last_error"] == "bad_status"


@pytest.mark.parametrize("error, code", [
    (httpx.ConnectTimeout("slow"), "timeout"),
    (httpx.ConnectError("refused"), "unreachable"),
    (mcp.McpError("unsafe_endpoint", "private address", 502), "unsafe_address"),
])
async def test_why_a_gateway_is_offline(admin, connection, gateway, error, code):
    gateway.error = error
    computer = await link(admin, connection)
    assert computer["state"] == "offline" and computer["last_error"] == code


async def test_the_status_is_cached_and_a_check_asks_again(admin, connection, gateway):
    computer = await link(admin, connection)
    await admin.get(PATH)
    await admin.get(PATH)
    assert len(gateway.requests) == 1
    gateway.status = 502
    assert (await admin.get(PATH)).json()[0]["state"] == "online"  # still the cached answer
    checked = await admin.post(f"{PATH}/{computer['id']}/check")
    assert checked.status_code == 200 and checked.json()["state"] == "offline"
    assert len(gateway.requests) == 2
    gateway.status = 200
    assert (await admin.post(f"{PATH}/{computer['id']}/check")).json()["state"] == "online"


async def test_a_switched_off_connection_is_disabled_and_not_asked(admin, connection, gateway):
    computer = await link(admin, connection)
    current = (await admin.get(f"{MCP_PATH}/connections")).json()[0]
    off = await admin.post(f"{MCP_PATH}/connections/{connection['id']}/disable", json={"revision": current["revision"]})
    assert off.status_code == 200
    before = len(gateway.requests)
    checked = (await admin.post(f"{PATH}/{computer['id']}/check")).json()
    assert checked["state"] == "disabled" and checked["live_view"] is False
    assert len(gateway.requests) == before


async def test_a_missing_key_needs_a_key(admin, connection, gateway, factory, owner):
    computer = await link(admin, connection)
    async with factory() as db:
        await db.execute(delete(UserCredential).where(UserCredential.user_id == owner))
        await db.commit()
    checked = (await admin.post(f"{PATH}/{computer['id']}/check")).json()
    assert checked["state"] == "needs_key" and checked["live_view"] is False


# ---------------------------------------------------------------- screenshot

async def test_the_screenshot_comes_from_the_gateways_tool_with_the_saved_key(admin, connection, screen):
    computer = await link(admin, connection)
    shot = await admin.get(f"{PATH}/{computer['id']}/screenshot", params={"t": "1"})
    assert shot.status_code == 200 and shot.content == PNG
    assert shot.headers["content-type"] == "image/png" and shot.headers["cache-control"] == "no-store"
    assert screen.calls == [("https://tools.example.com/mcp", SECRET, "computer_screenshot")]
    again = await admin.get(f"{PATH}/{computer['id']}/screenshot", params={"t": "2"})
    assert again.content == PNG and len(screen.calls) == 1  # a picture under two seconds old is reused


async def test_a_screenshot_tool_missing_from_the_saved_list_is_looked_up_live(admin, connection, screen, factory):
    computer = await link(admin, connection)
    async with factory() as db:
        row = await db.get(CustomMcpConnection, connection["id"])
        row.tools_snapshot = [tool("computer_click_mouse")]
        await db.commit()
    screen.tools = [tool("take_screenshot")]
    shot = await admin.get(f"{PATH}/{computer['id']}/screenshot")
    assert shot.status_code == 200 and screen.listed == 1 and screen.calls[0][2] == "take_screenshot"


@pytest.mark.parametrize("setup, status, code", [
    ("offline", 409, "computer_offline"),
    ("needs_key", 409, "computer_needs_key"),
    ("disabled", 409, "computer_disabled"),
    ("rejected", 502, "key_rejected"),
    ("no_image", 502, "screenshot_failed"),
    ("not_an_image", 502, "screenshot_failed"),
    ("tool_error", 502, "screenshot_failed"),
    ("no_tool", 502, "screenshot_not_offered"),
])
async def test_screenshot_errors(admin, connection, screen, gateway, factory, owner, setup, status, code):
    computer = await link(admin, connection)
    service.forget()
    if setup == "offline":
        gateway.status = 500
    elif setup == "needs_key":
        async with factory() as db:
            await db.execute(delete(UserCredential).where(UserCredential.user_id == owner))
            await db.commit()
    elif setup == "disabled":
        async with factory() as db:
            (await db.get(CustomMcpConnection, connection["id"])).enabled = False
            await db.commit()
    elif setup == "rejected":
        screen.error = mcp.McpError("authentication_failed", "rejected", 502)
    elif setup == "no_image":
        screen.images = []
    elif setup == "not_an_image":
        screen.images = [("image/png", b"<html>not a picture</html>")]
    elif setup == "tool_error":
        screen.error = mcp.McpError("tool_error", "failed", 502)
    elif setup == "no_tool":
        async with factory() as db:
            (await db.get(CustomMcpConnection, connection["id"])).tools_snapshot = [tool("computer_click_mouse")]
            await db.commit()
        screen.tools = [tool("computer_click_mouse")]
    refused = await admin.get(f"{PATH}/{computer['id']}/screenshot")
    assert refused.status_code == status and code_of(refused) == code
    assert SECRET not in refused.text


async def test_the_image_tool_result_is_decoded_from_the_mcp_answer():
    session = mcp.RemoteMcpSession("https://tools.example.com/mcp", SECRET)
    answers = [
        {"content": [{"type": "text", "text": "here"}, {"type": "image", "mimeType": "image/png",
                                                         "data": base64.b64encode(PNG).decode()}]},
        {"content": [{"type": "image", "mimeType": "image/png", "data": "not base64!"}]},
        {"isError": True, "content": []},
    ]

    async def rpc(method, params=None):
        assert method == "tools/call" and params == {"name": "computer_screenshot", "arguments": {}}
        return answers.pop(0)

    session._rpc = rpc
    try:
        assert await session.call_tool_images("computer_screenshot", {}) == [("image/png", PNG)]
        with pytest.raises(mcp.McpError):
            await session.call_tool_images("computer_screenshot", {})
        with pytest.raises(mcp.McpError) as failed:
            await session.call_tool_images("computer_screenshot", {})
        assert failed.value.code == "tool_error"
    finally:
        await session.client.aclose()


def test_the_screenshot_tool_is_found_by_name():
    named = lambda *names: [{"name": n, "inputSchema": {"type": "object"}} for n in names]  # noqa: E731
    assert service.screenshot_tool(named("computer_click_mouse", "computer_screenshot")) == "computer_screenshot"
    assert service.screenshot_tool(named("desktop_screenshot_now")) == "desktop_screenshot_now"
    assert service.screenshot_tool([{"name": "region_screenshot", "inputSchema": {"required": ["x"]}}]) is None
    assert service.screenshot_tool(named("computer_click_mouse")) is None
    assert service.screenshot_tool(None) is None


def test_the_base_url_is_the_endpoints_scheme_and_host_only():
    assert service.base_url("https://gateway-atlas.up.railway.app/mcp") == "https://gateway-atlas.up.railway.app"
    for unsafe in ("http://gw.example.com/mcp", "https://10.0.0.5/mcp", "https://localhost/mcp",
                   "https://gw.example.com:8443/mcp"):
        with pytest.raises(mcp.McpError):
            service.base_url(unsafe)


# ---------------------------------------------------------------- control

async def test_take_control_and_hand_back(admin, connection):
    computer = await link(admin, connection)
    taken = await admin.post(f"{PATH}/{computer['id']}/take-control")
    assert taken.status_code == 200
    assert taken.json()["human_control"] is True and taken.json()["control_started_at"]
    again = await admin.post(f"{PATH}/{computer['id']}/take-control")
    assert again.json()["control_started_at"] == taken.json()["control_started_at"]  # taking it twice keeps the start
    back = await admin.post(f"{PATH}/{computer['id']}/hand-back")
    assert back.status_code == 200 and back.json()["human_control"] is False and back.json()["control_started_at"] is None
    assert (await admin.post(f"{PATH}/{computer['id']}/hand-back")).json()["human_control"] is False


async def test_the_agent_is_told_who_has_control(admin, connection, factory):
    computer = await link(admin, connection)
    async with factory() as db:
        assert await service.control_refusal(db, connection["id"]) is None
    await admin.post(f"{PATH}/{computer['id']}/take-control")
    async with factory() as db:
        message = await service.control_refusal(db, connection["id"])
    assert message is not None and '"Atlas desktop"' in message and "has taken control" in message
    assert "carry on without the computer" in message
    await admin.post(f"{PATH}/{computer['id']}/hand-back")
    async with factory() as db:
        assert await service.control_refusal(db, connection["id"]) is None


# ---------------------------------------------------------------- viewer tickets

async def test_a_control_ticket_needs_control_taken_first(admin, connection):
    computer = await link(admin, connection)
    refused = await admin.post(f"{PATH}/{computer['id']}/viewer-ticket", json={"mode": "control"})
    assert refused.status_code == 409 and code_of(refused) == "control_not_taken"
    await admin.post(f"{PATH}/{computer['id']}/take-control")
    issued = await admin.post(f"{PATH}/{computer['id']}/viewer-ticket", json={"mode": "control"})
    assert issued.status_code == 200, issued.text


async def test_a_ticket_is_single_use_and_bound_to_its_computer(admin, connection):
    computer = await link(admin, connection)
    issued = await admin.post(f"{PATH}/{computer['id']}/viewer-ticket", json={"mode": "view"})
    assert issued.status_code == 200
    body = issued.json()
    assert body["path"] == f"/api/v1/remote-computers/{computer['id']}/viewer?ticket={body['ticket']}"
    assert len(body["ticket"]) == 64 and SECRET not in issued.text
    [(_token, ticket)] = [(t, v) for t, v in service.viewers.tickets.items() if t == body["ticket"]]
    identity = ticket.identity
    assert service.viewers.consume(body["ticket"], service.viewer_key(computer["id"] + 1), identity) is None
    issued = (await admin.post(f"{PATH}/{computer['id']}/viewer-ticket", json={"mode": "view"})).json()
    first = service.viewers.consume(issued["ticket"], service.viewer_key(computer["id"]), identity)
    assert first is not None and first.mode == "view"
    assert service.viewers.consume(issued["ticket"], service.viewer_key(computer["id"]), identity) is None


async def test_no_ticket_while_the_desktop_cannot_be_reached(admin, connection, gateway):
    computer = await link(admin, connection)
    gateway.status = 500
    service.forget()
    refused = await admin.post(f"{PATH}/{computer['id']}/viewer-ticket", json={"mode": "view"})
    assert refused.status_code == 409 and code_of(refused) == "computer_offline"
    assert (await admin.post(f"{PATH}/{computer['id']}/viewer-ticket", json={"mode": "drive"})).status_code == 422


# ---------------------------------------------------------------- who may see it

async def test_a_paired_chat_device_cannot_reach_remote_computers(app, factory, admin, connection):
    from tests.auth.test_auth_api import pairing_code
    session = (await admin.get("/api/v1/auth/session")).json()
    code = await pairing_code(admin, admin.headers["X-CSRF-Token"], scope="chat")
    async with client(app) as device:
        paired = await device.post("/api/v1/auth/pair", json={"code": code, "label": "Phone"})
        assert paired.status_code in (200, 201), paired.text
        device.headers["Authorization"] = f"Bearer {paired.json()['token']}"
        assert (await device.get(PATH)).status_code == 403
    assert session
