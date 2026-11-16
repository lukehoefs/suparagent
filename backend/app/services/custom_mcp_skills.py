"""The skills an owner-added MCP server says it ships, read for display in the agent editor.

Some servers (Executor, for one) offer a tool named `skills` that lists the instructions their
apps carry: `{"skills": [{"name", "description", "app": {"name", "slug"}}]}`. The owner opens a
server in the Tools tab and sees that list; nothing here grants, loads or runs a skill.

The call goes through the same client as testing and tool discovery (community_mcp.RemoteMcpSession:
public https only, pinned address, no redirects, 1 MB response cap) with its own time limit, and only
when the last successful test saw a `skills` tool that takes no required arguments.
"""

import asyncio
import json

from pydantic import BaseModel

from app import community_mcp as mcp

TOOL = "skills"
TIMEOUT_SECONDS = 20
MAX_TEXT_BYTES = 256_000
MAX_ENTRIES_READ = 1_000
MAX_SKILLS = 200
NAME_MAX = 120
APP_MAX = 80
DESCRIPTION_MAX = 300


class CustomMcpSkillOut(BaseModel):
    name: str
    app: str | None
    description: str


def offers_skills(tools_snapshot: list[dict] | None) -> bool:
    """Whether the tested tool list has a `skills` tool that can be called with `{}`."""
    for tool in tools_snapshot or []:
        if isinstance(tool, dict) and tool.get("name") == TOOL:
            schema = tool.get("inputSchema")
            required = schema.get("required") if isinstance(schema, dict) else None
            return not required
    return False


def _line(value: object, limit: int) -> str | None:
    """One line of plain text, at most `limit` characters, or None when empty."""
    if not isinstance(value, str):
        return None
    text = " ".join(value.split())
    if not text:
        return None
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


def _app(value: object) -> str | None:
    if isinstance(value, dict):
        return _line(value.get("name"), APP_MAX) or _line(value.get("slug"), APP_MAX)
    return _line(value, APP_MAX)


def _entries(payload: object) -> list | None:
    if isinstance(payload, dict):
        payload = payload.get("skills")
    return payload if isinstance(payload, list) else None


def _from_text(result: dict) -> list | None:
    texts = [item["text"] for item in result.get("content") or []
             if isinstance(item, dict) and item.get("type") == "text" and isinstance(item.get("text"), str)]
    if sum(len(text.encode("utf-8")) for text in texts) > MAX_TEXT_BYTES:
        raise mcp.McpError("response_too_large", "The server's skills list is too large to show.", 502)
    # The whole text first (one JSON document split over several parts), then each part on its own.
    for candidate in ["".join(texts), *texts]:
        try:
            found = _entries(json.loads(candidate))
        except (ValueError, RecursionError):
            continue
        if found is not None:
            return found
    return None


def parse(result: dict) -> list[dict]:
    """[{name, app, description}] from a `skills` tool result, read defensively. Unreadable entries are
    skipped; a result with no list at all is an error."""
    if result.get("isError") is True:
        raise mcp.McpError("remote_error", "The server could not list its skills.", 502)
    entries = _entries(result.get("structuredContent"))
    if entries is None:
        entries = _from_text(result)
    if entries is None:
        raise mcp.McpError("invalid_response", "The server's skills list could not be read.", 502)
    skills: list[dict] = []
    seen: set[tuple[str, str | None]] = set()
    for raw in entries[:MAX_ENTRIES_READ]:
        if not isinstance(raw, dict):
            continue
        name = _line(raw.get("name"), NAME_MAX)
        if name is None:
            continue
        app = _app(raw.get("app"))
        if (name, app) in seen:
            continue
        seen.add((name, app))
        skills.append({"name": name, "app": app, "description": _line(raw.get("description"), DESCRIPTION_MAX) or ""})
        if len(skills) >= MAX_SKILLS:
            break
    return skills


async def call_skills(endpoint: str, token: str | None, header: str | None) -> dict:
    """Call the server's `skills` tool with no arguments; the raw (already bounded) tool result."""
    session = mcp.RemoteMcpSession(endpoint, token, header=header)
    try:
        async with asyncio.timeout(TIMEOUT_SECONDS):
            return await session.call_tool(TOOL, {})
    except mcp.McpError:
        raise
    except TimeoutError:
        raise mcp.McpError("remote_timeout", "The server took too long to list its skills.", 504) from None
    except Exception:
        raise mcp.McpError("remote_unavailable", "The remote MCP server could not be reached.", 502) from None
    finally:
        await session.close()


async def read(endpoint: str, token: str | None, header: str | None) -> list[dict]:
    skills = parse(await call_skills(endpoint, token, header))
    return mcp.reject_credential_in_metadata(skills, token)
