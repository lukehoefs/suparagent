from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

RemoteComputerState = Literal["online", "offline", "needs_key", "disabled"]


class RemoteComputerCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=100)
    mcp_connection_id: str = Field(min_length=1, max_length=36)
    agent_id: int | None = None


class RemoteComputerUpdate(BaseModel):
    """Only the fields sent change. `agent_id: null` unlinks the agent."""

    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=100)
    agent_id: int | None = None


class RemoteComputerOut(BaseModel):
    id: int
    name: str
    mcp_connection_id: str
    connection_name: str
    agent_id: int | None
    agent_name: str | None
    # scheme and host of the connection's endpoint; never typed in on its own
    base_url: str
    state: RemoteComputerState
    human_control: bool
    control_started_at: datetime | None
    # true when the desktop answers and its key is saved: the live picture and the viewer can open
    live_view: bool
    last_checked_at: datetime | None
    # timeout | unreachable | unsafe_address | bad_status, from the last status check; null when it answered
    last_error: str | None


class RemoteComputerBrief(BaseModel):
    """What an agent's JSON says about its cloud computer."""

    id: int
    name: str
    state: RemoteComputerState
    human_control: bool


class ViewerTicketRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mode: Literal["view", "control"]


class ViewerTicketOut(BaseModel):
    ticket: str
    # The WebSocket to open, from the API's origin, ticket included: /api/v1/remote-computers/{id}/viewer?ticket=...
    path: str
