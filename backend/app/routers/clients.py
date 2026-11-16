"""Clients: who gets a branded portal (portal.lthops.tech), and which agents work for them.

The list is small and owner-edited, so it lives in one JSON file in the workspace folder.
The "client view" in the app frames the preview address of the portal, signed in as a
client-role preview account, so the owner sees exactly what that client sees.
"""

from __future__ import annotations

import json
import re
import uuid
from urllib.parse import urlsplit

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator

from app.services import agent_memory, local_claude_runner
from app.services.local_access_policy import require_local_access

router = APIRouter(prefix="/clients", tags=["Clients"], dependencies=[Depends(require_local_access)])

PORTAL_ORIGIN = "https://portal.lthops.tech"
PREVIEW_ORIGIN = "https://preview.lthops.tech"
MAX_CLIENTS = 200


class Client(BaseModel):
    id: str = Field(default_factory=lambda: uuid.uuid4().hex[:12], max_length=40)
    name: str = Field(min_length=1, max_length=120)
    # The portal path of the client's workspace, e.g. "/w/acme" (no origin).
    portal_path: str = Field(default="/", max_length=300)
    contact: str = Field(default="", max_length=200)
    notes: str = Field(default="", max_length=4000)
    agent_ids: list[int] = Field(default_factory=list, max_length=100)
    color: str = Field(default="#4f46e5", max_length=9)

    @field_validator("portal_path")
    @classmethod
    def _path(cls, value: str) -> str:
        value = (value or "/").strip()
        if value.startswith(("http://", "https://")):
            parts = urlsplit(value)
            if f"{parts.scheme}://{parts.netloc}" not in (PORTAL_ORIGIN, PREVIEW_ORIGIN):
                raise ValueError("Use a portal.lthops.tech address.")
            value = parts.path or "/"
            if parts.query:
                value += "?" + parts.query
        if not value.startswith("/") or value.startswith("//") or "\\" in value:
            raise ValueError("The portal path must start with a single /.")
        return value

    @field_validator("color")
    @classmethod
    def _color(cls, value: str) -> str:
        return value if re.fullmatch(r"#[0-9a-fA-F]{6}", value or "") else "#4f46e5"


class ClientList(BaseModel):
    clients: list[Client] = Field(default_factory=list, max_length=MAX_CLIENTS)


class ClientsResponse(ClientList):
    portal_origin: str = PORTAL_ORIGIN
    preview_origin: str = PREVIEW_ORIGIN


def _path():
    return local_claude_runner.workspace_dir() / "clients.json"


def read_clients() -> list[Client]:
    try:
        data = json.loads(_path().read_text(encoding="utf-8"))
    except (FileNotFoundError, ValueError):
        return []
    out: list[Client] = []
    for item in data.get("clients", []) if isinstance(data, dict) else []:
        try:
            out.append(Client.model_validate(item))
        except ValueError:
            continue
    return out


def write_clients(clients: list[Client]) -> None:
    path = _path()
    path.parent.mkdir(parents=True, exist_ok=True)
    agent_memory.write_atomic(path, json.dumps({"clients": [c.model_dump() for c in clients]}, indent=2))


@router.get("", response_model=ClientsResponse)
async def list_clients() -> ClientsResponse:
    return ClientsResponse(clients=read_clients())


@router.put("", response_model=ClientsResponse)
async def save_clients(payload: ClientList) -> ClientsResponse:
    ids = [c.id for c in payload.clients]
    if len(ids) != len(set(ids)):
        raise HTTPException(status_code=422, detail={"error_code": "duplicate_client", "message": "Two clients share an id."})
    write_clients(payload.clients)
    return ClientsResponse(clients=read_clients())
