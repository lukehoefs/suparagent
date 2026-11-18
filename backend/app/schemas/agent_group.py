from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, StrictBool, StrictInt

# A group holds the agents of one owner; this only bounds a request.
MAX_GROUP_AGENTS = 100


class AgentGroupCreateRequest(BaseModel):
    """A new group. The agents listed move into it (out of any group they were in)."""

    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=80)
    pinned: StrictBool = True
    agent_ids: list[StrictInt] = Field(default_factory=list, max_length=MAX_GROUP_AGENTS)


class AgentGroupUpdateRequest(BaseModel):
    """Rename, pin or unpin, or move a group. Fields left out keep their value."""

    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=80)
    pinned: StrictBool | None = None
    position: StrictInt | None = Field(default=None, ge=0, le=1_000_000)


class AgentGroupMembersRequest(BaseModel):
    """Exactly the group's members after the call: the agents listed move in (out of any other
    group), and the members not listed leave it. An empty list empties the group but keeps it."""

    model_config = ConfigDict(extra="forbid")

    agent_ids: list[StrictInt] = Field(max_length=MAX_GROUP_AGENTS)


class AgentGroupResponse(BaseModel):
    id: int
    name: str
    pinned: bool
    position: int
    created_at: datetime
    # The group's live (not archived) agents, by name.
    agent_ids: list[int]
