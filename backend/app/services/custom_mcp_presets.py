"""Owner-level MCP servers registered from the environment (`CUSTOM_MCP_PRESETS`).

A self-hosted operator can connect a server without signing in: at startup each preset is
added, tested, switched on and granted through the same routes an owner uses
(routers/custom_mcp.py), so its secret lives only in the encrypted credential store and its
tools reach agents as ordinary exact grants. The secret itself is never in the preset JSON:
the preset names another environment variable (`credential_env`) that holds it.

A preset also says how its tools are decided (tool_policy.py, thread_runtime.py):
- `auto_allow_tools` run without a card (never in plan mode or an unattended routine);
- `deny_tools` are refused, never granted, and cannot be granted by hand;
- every other tool asks a person on a card, also in Full access.
"""

import json
import logging
import os
from dataclasses import dataclass

from app.core.config import settings

logger = logging.getLogger("dots.custom_mcp_presets")

PREFIX = "mcp__community__"
BROKER_CALL = "custom_call"
_AUTH_MODES = ("none", "bearer", "header")


@dataclass(frozen=True)
class Preset:
    name: str
    endpoint: str
    auth_mode: str = "none"
    auth_header_name: str | None = None
    credential_env: str | None = None
    auto_allow_tools: frozenset[str] = frozenset()
    deny_tools: frozenset[str] = frozenset()
    grant_tools: tuple[str, ...] = ()
    shared: bool = True

    def decision(self, tool_name: str) -> str:
        """`deny`, `allow` or `ask` for one of this server's tools."""
        if tool_name in self.deny_tools:
            return "deny"
        if tool_name in self.auto_allow_tools:
            return "allow"
        return "ask"


# Connection id -> preset, for connections this process registered (or found) at startup.
_registered: dict[str, Preset] = {}


def _names(value) -> list[str]:
    if value is None:
        return []
    if not isinstance(value, list) or not all(isinstance(item, str) and item for item in value):
        raise ValueError("tool lists must be lists of names")
    return value


def parse(raw: str | None) -> list[Preset]:
    """The presets in `raw`; an empty or malformed value turns the feature off."""
    if not raw or not raw.strip():
        return []
    try:
        items = json.loads(raw)
        if not isinstance(items, list):
            raise ValueError("CUSTOM_MCP_PRESETS must be a JSON list")
        presets = []
        for item in items:
            if not isinstance(item, dict) or not isinstance(item.get("name"), str) or not isinstance(item.get("endpoint"), str):
                raise ValueError("each preset needs a name and an endpoint")
            auth_mode = item.get("auth_mode", "none")
            if auth_mode not in _AUTH_MODES:
                raise ValueError("auth_mode must be none, bearer or header")
            credential_env = item.get("credential_env")
            if auth_mode != "none" and not (isinstance(credential_env, str) and credential_env):
                raise ValueError("a preset with a secret needs credential_env")
            deny = frozenset(_names(item.get("deny_tools")))
            presets.append(Preset(
                name=item["name"], endpoint=item["endpoint"], auth_mode=auth_mode,
                auth_header_name=item.get("auth_header_name"), credential_env=credential_env,
                auto_allow_tools=frozenset(_names(item.get("auto_allow_tools"))) - deny,
                deny_tools=deny,
                grant_tools=tuple(name for name in _names(item.get("grant_tools")) if name not in deny),
                shared=bool(item.get("shared", True)),
            ))
        return presets
    except (ValueError, TypeError) as exc:
        # Never echo the value: it is configuration, but keep logs free of it anyway.
        logger.warning("CUSTOM_MCP_PRESETS ignored: %s", exc)
        return []


def preset_for(connection_id: str | None) -> Preset | None:
    return _registered.get(connection_id) if connection_id else None


def denied_names(connection_id: str, names) -> list[str]:
    """The names a preset forbids granting on this connection."""
    preset = preset_for(connection_id)
    return sorted(name for name in names if preset is not None and name in preset.deny_tools)


def decision_for(run, tool: str, arguments) -> str | None:
    """`deny`, `allow` or `ask` when this call reaches a preset's server, else None."""
    if not _registered or not isinstance(tool, str) or not tool.startswith(PREFIX):
        return None
    bridge = getattr(getattr(run, "ctx", None), "community_bridge", None)
    aliases = getattr(bridge, "aliases", None)
    if not isinstance(aliases, dict):
        return None
    alias = tool.removeprefix(PREFIX)
    if alias == BROKER_CALL:
        ref = arguments.get("ref") if isinstance(arguments, dict) else None
        alias = ref if isinstance(ref, str) else ""
    item = aliases.get(alias)
    if not isinstance(item, dict) or item.get("kind") != "custom":
        return None
    preset = preset_for(item.get("connection_id"))
    if preset is None:
        return None
    return preset.decision(str(item.get("remote_name") or ""))


def always_asked(run, tool: str, arguments) -> bool:
    """A preset tool that is neither auto-allowed nor denied: Full access still shows its card."""
    return decision_for(run, tool, arguments) == "ask"


# ---------------------------------------------------------------- startup registration

def _code(exc: BaseException) -> str:
    detail = getattr(exc, "detail", None)
    if isinstance(detail, dict) and detail.get("error_code"):
        return str(detail["error_code"])
    return getattr(exc, "code", None) or type(exc).__name__


async def sync(factory) -> None:
    """Register every preset. A failure is logged (never with its secret) and never stops startup."""
    if settings.TENANT_SCHEMAS_ENABLED:
        return
    for preset in parse(settings.CUSTOM_MCP_PRESETS):
        try:
            await _sync_one(factory, preset)
        except Exception as exc:  # noqa: BLE001 - one preset never stops startup
            logger.warning("custom MCP preset %r not registered: %s", preset.name, _code(exc))


async def _sync_one(factory, preset: Preset) -> None:
    from fastapi import Response
    from pydantic import SecretStr
    from sqlalchemy import select

    from app.db.models import Agent, CustomMcpConnection
    from app.routers import custom_mcp as routes
    from app.schemas.custom_mcp import (
        CustomMcpCreate, CustomMcpGrantRequest, CustomMcpGrantSelection, CustomMcpRevision, CustomMcpSharing,
        CustomMcpUpdate,
    )

    secret = os.environ.get(preset.credential_env or "", "") if preset.auth_mode != "none" else ""
    if preset.auth_mode != "none" and not secret:
        logger.warning("custom MCP preset %r not registered: %s is not set", preset.name, preset.credential_env)
        return
    credential = SecretStr(secret) if secret else None

    async def current(connection_id: str) -> CustomMcpConnection:
        async with factory() as db:
            return (await db.execute(select(CustomMcpConnection).where(
                CustomMcpConnection.id == connection_id))).scalar_one()

    async def route(fn, *args):
        # A fresh session per step, as each request would have.
        async with factory() as db:
            return await fn(*args, Response(), db)

    async with factory() as db:
        row = await db.scalar(select(CustomMcpConnection).where(
            CustomMcpConnection.owner_id == routes.LOCAL_OWNER_ID,
            CustomMcpConnection.owner_person_id.is_(None),
            CustomMcpConnection.name == preset.name,
            CustomMcpConnection.endpoint == preset.endpoint,
        ).order_by(CustomMcpConnection.created_at).limit(1))
        saved = await routes._credential(db, row.id) if row is not None and secret else None
    if row is None:
        out = await route(routes.create_connection, CustomMcpCreate(
            name=preset.name, endpoint=preset.endpoint, auth_mode=preset.auth_mode,
            auth_header_name=preset.auth_header_name, credential=credential))
        connection_id = out.id
    else:
        connection_id = row.id
        header = preset.auth_header_name if preset.auth_mode == "header" else None
        if (row.auth_mode, row.auth_header_name) != (preset.auth_mode, header) or (secret and saved != secret):
            # A new secret or auth method: the route clears the old test and grants, as it does for an owner.
            await route(routes.update_connection, connection_id, CustomMcpUpdate(
                revision=row.revision, auth_mode=preset.auth_mode,
                auth_header_name=preset.auth_header_name, credential=credential))
    # Rules apply as soon as the connection exists, before any grant.
    _registered[connection_id] = preset
    out = await route(routes.test_connection, connection_id, CustomMcpRevision(revision=(await current(connection_id)).revision))
    if not out.enabled:
        out = await route(routes.enable_connection, connection_id, CustomMcpRevision(revision=out.revision))
    if out.shared != preset.shared:
        out = await route(routes.set_sharing, connection_id, CustomMcpSharing(revision=out.revision, shared=preset.shared))
    row = await current(connection_id)
    digests = {tool["name"]: tool["schema_digest"] for tool in row.tools_snapshot or []}
    wanted = [name for name in preset.grant_tools if name in digests]
    if not wanted:
        return
    async with factory() as db:
        agents = (await db.scalars(select(Agent.id).where(
            Agent.owner_id == routes.LOCAL_OWNER_ID, Agent.archived_at.is_(None)).order_by(Agent.id))).all()
    for agent_id in agents:
        have = (await route(routes.list_grants, connection_id, agent_id))["tool_names"]
        # Additive: keep what the owner granted by hand, minus anything the preset forbids.
        names = sorted({*(n for n in have if n in digests and n not in preset.deny_tools), *wanted})
        if names == sorted(have):
            continue
        await route(routes.set_grants, connection_id, agent_id, CustomMcpGrantRequest(
            revision=(await current(connection_id)).revision,
            tools=[CustomMcpGrantSelection(name=n, schema_digest=digests[n]) for n in names]))
    logger.info("custom MCP preset %r registered for %d agent(s)", preset.name, len(agents))
