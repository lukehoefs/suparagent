from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.schemas.computer import ComputerSummary
from app.schemas.remote_computer import RemoteComputerBrief

ApprovalMode = Literal["ask", "accept_edits", "approve_for_me", "plan"]

# Standing instructions are capped in bytes, not characters, so the limit means
# the same thing in every language.
INSTRUCTIONS_MAX_BYTES = 24_000


def _one_line(value: str, what: str) -> str:
    value = value.strip()
    if not value:
        raise ValueError(f"{what} must not be blank")
    if "\n" in value or "\r" in value:
        raise ValueError(f"{what} must fit on one line")
    return value


def _instructions_fit(value: str) -> str:
    if len(value.encode("utf-8")) > INSTRUCTIONS_MAX_BYTES:
        raise ValueError(f"instructions must be at most {INSTRUCTIONS_MAX_BYTES} bytes")
    return value


# Sampling an engine may send (GET /api/v1/engines `generation_params`). Null is
# the engine's own default. Ranges are the widest the OpenAI-style APIs take.
TEMPERATURE_MAX = 2.0
MAX_OUTPUT_TOKENS_MAX = 200_000


def _not_a_switch(value):
    # JSON true/false would otherwise pass as 1/0.
    if isinstance(value, bool):
        raise ValueError("must be a number")
    return value


def _optional_line(value: str | None) -> str | None:
    """A title: one line, or null/blank for none."""
    if value is None or not value.strip():
        return None
    return _one_line(value, "title")


# Guidance on how an agent talks (`conversational_style`), in characters.
CONVERSATIONAL_STYLE_MAX_CHARS = 500


def _optional_text(value: str | None) -> str | None:
    """Free text without the surrounding blanks, or null when there is none."""
    if value is None or not value.strip():
        return None
    return value.strip()


class AgentCreateRequest(BaseModel):
    make_lead: bool = False
    name: str = Field(min_length=1, max_length=80)
    # A short role line and a longer description, for lists and pickers.
    title: str | None = Field(default=None, max_length=200)
    description: str | None = Field(default=None, max_length=4000)
    instructions: str = ""
    # An engine id from GET /api/v1/engines; an unknown one is a 422, and the
    # model is checked against it (422 `unknown_model`).
    provider: str = Field(default="claude", min_length=1, max_length=64)
    model: str | None = Field(default=None, max_length=200)
    # Checked against the model's efforts when the engine lists them (422 `unsupported_effort`).
    effort: str | None = Field(default=None, max_length=64)
    # Sampling, for an engine and model that send it (422 `unsupported_setting`
    # otherwise); null is the engine's default.
    temperature: float | None = Field(default=None, ge=0, le=TEMPERATURE_MAX)
    top_p: float | None = Field(default=None, gt=0, le=1)
    max_output_tokens: int | None = Field(default=None, ge=1, le=MAX_OUTPUT_TOKENS_MAX)
    # Omitted: the agent gets its own folder under the default workspace root.
    # Otherwise an absolute path (or `~/...`) to an existing folder.
    workspace_path: str | None = Field(default=None, max_length=1000)
    approval_mode: ApprovalMode = "ask"
    pinned: bool = False
    memory_enabled: bool = True
    # Before each turn, add relevant notes and earlier conversations to the
    # person's message (docs/MEMORY.md). Has no effect while memory is off.
    recall_enabled: bool = True
    # Quiet background memory upkeep: a model call that files facts noticed in
    # conversations (docs/MEMORY.md). Has no effect while memory is off.
    memory_upkeep: bool = True
    # A model writes the summary when a long conversation is folded (docs/MEMORY.md).
    compaction_summary: bool = True
    # The helper model may write this agent's background texts when its own engine cannot.
    use_helper: bool = True
    # How it works with the person in its chat: Task (false, the default) works quietly and
    # reports back; Conversational (true) talks through the plan and asks before major tool calls.
    conversational_mode: bool = False
    # Optional guidance on how it talks, added to its instructions in both modes.
    conversational_style: str | None = Field(default=None, max_length=CONVERSATIONAL_STYLE_MAX_CHARS)
    # Optional: another engine (and its model; null for its default) a turn
    # moves to when this agent's engine refuses it for a usage or rate limit
    # before starting on it (docs/ENGINES.md). It must differ from `provider`.
    fallback_provider: str | None = Field(default=None, min_length=1, max_length=64)
    fallback_model: str | None = Field(default=None, max_length=200)
    # A named Claude account id; null is the default account.
    claude_account: str | None = Field(default=None, max_length=64)
    # Optional first contents of the agent's notes (MEMORY.md).
    starter_notes: str | None = Field(default=None, max_length=256 * 1024)

    @field_validator("name")
    @classmethod
    def _name_one_line(cls, value: str) -> str:
        return _one_line(value, "name")

    @field_validator("title")
    @classmethod
    def _title_one_line(cls, value: str | None) -> str | None:
        return _optional_line(value)

    @field_validator("conversational_style")
    @classmethod
    def _style_text(cls, value: str | None) -> str | None:
        return _optional_text(value)

    @field_validator("instructions")
    @classmethod
    def _instructions_size(cls, value: str) -> str:
        return _instructions_fit(value)

    @field_validator("temperature", "top_p", "max_output_tokens", mode="before")
    @classmethod
    def _sampling_numbers(cls, value):
        return _not_a_switch(value)


class AgentUpdateRequest(BaseModel):
    """Change any of these; send at least one. `title`, `description`, `model`, `effort`,
    `temperature`, `top_p`, `max_output_tokens`, `workspace_path` and `conversational_style`
    accept an explicit null to go back to the default. Every field defaults to None, meaning
    "not sent", so a partial update never resets another field."""

    make_lead: bool | None = None
    name: str | None = Field(default=None, min_length=1, max_length=80)
    title: str | None = Field(default=None, max_length=200)
    description: str | None = Field(default=None, max_length=4000)
    instructions: str | None = None
    # Another engine. Its conversations keep the engine they started on; a
    # change without `model` goes back to the new engine's default model.
    provider: str | None = Field(default=None, min_length=1, max_length=64)
    model: str | None = Field(default=None, max_length=200)
    effort: str | None = Field(default=None, max_length=64)
    # Like `effort`, reset to null by an engine change unless sent with it.
    temperature: float | None = Field(default=None, ge=0, le=TEMPERATURE_MAX)
    top_p: float | None = Field(default=None, gt=0, le=1)
    max_output_tokens: int | None = Field(default=None, ge=1, le=MAX_OUTPUT_TOKENS_MAX)
    workspace_path: str | None = Field(default=None, max_length=1000)
    approval_mode: ApprovalMode | None = None
    pinned: bool | None = None
    memory_enabled: bool | None = None
    recall_enabled: bool | None = None
    memory_upkeep: bool | None = None
    compaction_summary: bool | None = None
    use_helper: bool | None = None
    # Task (false) or Conversational (true); None (not sent) leaves it as it is.
    conversational_mode: bool | None = None
    # Guidance on how it talks; an explicit null or blank text removes it.
    conversational_style: str | None = Field(default=None, max_length=CONVERSATIONAL_STYLE_MAX_CHARS)
    # Connected apps this agent may read, {app: "read"}; {} or null turns them all off.
    connector_scopes: dict[str, str] | None = None
    # Exact Composio account IDs the agent may use, keyed by app. Empty denies all accounts.
    connector_account_scopes: dict[str, list[str]] | None = None
    # An explicit null removes the fallback engine (and its model).
    fallback_provider: str | None = Field(default=None, min_length=1, max_length=64)
    fallback_model: str | None = Field(default=None, max_length=200)
    # A named Claude account id; null is the default account.
    claude_account: str | None = Field(default=None, max_length=64)
    archived: bool | None = None

    @field_validator("name")
    @classmethod
    def _name_one_line(cls, value: str | None) -> str | None:
        return None if value is None else _one_line(value, "name")

    @field_validator("title")
    @classmethod
    def _title_one_line(cls, value: str | None) -> str | None:
        return _optional_line(value)

    @field_validator("conversational_style")
    @classmethod
    def _style_text(cls, value: str | None) -> str | None:
        return _optional_text(value)

    @field_validator("instructions")
    @classmethod
    def _instructions_size(cls, value: str | None) -> str | None:
        return None if value is None else _instructions_fit(value)

    @field_validator("temperature", "top_p", "max_output_tokens", mode="before")
    @classmethod
    def _sampling_numbers(cls, value):
        return _not_a_switch(value)

    @model_validator(mode="after")
    def _something_to_change(self):
        if not self.model_fields_set:
            raise ValueError("send at least one field to change")
        for field in ("name", "instructions", "provider", "approval_mode", "pinned", "memory_enabled", "recall_enabled", "memory_upkeep", "compaction_summary", "use_helper", "conversational_mode", "archived"):
            if field in self.model_fields_set and getattr(self, field) is None:
                raise ValueError(f"{field} cannot be null")
        return self


class AgentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    title: str | None
    description: str | None
    instructions: str
    provider: str
    model: str | None
    effort: str | None = None
    temperature: float | None = None
    top_p: float | None = None
    max_output_tokens: int | None = None
    # Null: a thread started from this agent gets its own folder, named by the
    # agent's id, under the default workspace root.
    workspace_path: str | None
    approval_mode: ApprovalMode
    pinned: bool
    # The sidebar group the agent is stacked in (/agent-groups), or null.
    group_id: int | None = None
    memory_enabled: bool
    recall_enabled: bool = True
    memory_upkeep: bool = True
    compaction_summary: bool = True
    use_helper: bool = True
    # False: Task (works quietly, reports back). True: Conversational.
    conversational_mode: bool = False
    conversational_style: str | None = None
    fallback_provider: str | None = None
    fallback_model: str | None = None
    claude_account: str | None = None
    connector_scopes: dict | None = None
    connector_account_scopes: dict[str, list[str]] = Field(default_factory=dict)
    archived_at: datetime | None
    created_at: datetime
    updated_at: datetime
    # The agent's own computer (docs/COMPUTERS.md), or null: its turns then
    # run on this machine. Manage it under /agents/{id}/computer.
    team_id: int | None = None
    delegation_enabled: bool = True
    created_by_agent_id: int | None = None
    instructions_reviewed_at: datetime | None = None
    computer_id: int | None = None
    computer: ComputerSummary | None = None
    # The agent's cloud computer (a desktop behind its gateway; /remote-computers), or null.
    remote_computer: RemoteComputerBrief | None = None


class AgentMemoryResponse(BaseModel):
    """The agent's notes and how much of them loads into a turn."""

    model_config = ConfigDict(from_attributes=True)

    path: str
    text: str
    # Send back as `expected_hash` so a save never overwrites a change the
    # agent made in the meantime.
    hash: str
    lines: int
    bytes: int
    loaded_lines: int
    loaded_bytes: int
    truncated: bool
    max_lines: int
    max_bytes: int
    enabled: bool
    # Entries whose `until` day has passed (not loaded, still in the file).
    expired: int = 0
    expired_lines: int = 0
    # Set on a save: how many things that looked like secrets were replaced.
    redacted: int = 0


class AgentMemoryWriteRequest(BaseModel):
    text: str
    expected_hash: str | None = Field(default=None, max_length=64)


class AgentExportResponse(BaseModel):
    file_name: str
    # The portable file itself, to be saved as JSON.
    document: dict
    # Parts in which something that looked like a secret was replaced.
    redacted: list[str]
    # Topic notes left out because the file would be too large (their names).
    skipped: list[str] = []


class AgentImportRequest(BaseModel):
    document: dict
    # False leaves the file's notes out even when it carries some.
    include_notes: bool = True
    # False leaves the file's skills out. Imported skills always start off.
    include_skills: bool = True


class AgentMigrationProfilePreview(BaseModel):
    key: str
    name: str
    title: str | None
    # A normalized native agent package; send it to the existing import API.
    document: dict
    skipped: list[str]
    redacted: list[str]


class AgentMigrationPreviewResponse(BaseModel):
    format: Literal["suparagent.agent-migration"]
    version: Literal[1]
    source: Literal["grok", "hermes"]
    profiles: list[AgentMigrationProfilePreview]
    skipped: list[str]


class OpenBotDatabaseProfilePreview(BaseModel):
    key: str
    name: str
    title: str
    instructions: str
    document: dict


class OpenBotDatabasePreviewResponse(BaseModel):
    schema_version: int
    profiles: list[OpenBotDatabaseProfilePreview]


# --- topic notes, the journal and proposed notes (docs/MEMORY.md) ------------------------


class TopicInfoResponse(BaseModel):
    name: str
    title: str | None
    aliases: list[str]
    bytes: int
    modified_at: datetime


class TopicListResponse(BaseModel):
    topics: list[TopicInfoResponse]
    max_topics: int
    max_bytes: int
    folder: str


class TopicDocResponse(BaseModel):
    name: str
    path: str
    text: str
    # Send back as `expected_hash`; a note not created yet has the hash of "".
    hash: str
    bytes: int
    exists: bool
    redacted: int = 0


class TopicWriteRequest(BaseModel):
    text: str
    expected_hash: str | None = Field(default=None, max_length=64)


class MemoryJournalRow(BaseModel):
    id: str
    at: datetime
    path: str
    # person | proposal | undo
    actor: str
    # For upkeep rows, the step: capture | tidy | organize
    via: str | None = None
    # created | edited | deleted
    kind: str
    before_hash: str | None
    after_hash: str | None
    diff: str
    added: int
    removed: int
    can_undo: bool
    reason: str | None = None


class MemoryProposalResponse(BaseModel):
    id: str
    at: datetime
    # The person's own words the proposal quotes.
    text: str
    # The line Accept appends.
    line: str
    target: str
    thread_id: int | None
    thread_title: str | None
    turn_id: int | None


class MemoryProposalAcceptRequest(BaseModel):
    # The line to save instead of the proposed one (edited by the person).
    line: str | None = Field(default=None, max_length=2000)
    # A topic file name (travel.md) instead of MEMORY.md.
    target: str | None = Field(default=None, max_length=80)
