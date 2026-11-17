"""Let conversations started before this release follow their agent's effort.

A conversation used to get a copy of its agent's reasoning effort in
`thread.provider_state["effort"]` when it was created. That key now means the
conversation's own choice, which wins over the agent's, so those copies would
keep every older conversation on the effort its agent had back then. Where the
copy still equals the agent's current effort, on the agent's own engine and
model (the only case in which the agent's effort applies at all), it is
removed, so the conversation follows the agent again: the effort its turns use
does not change now, and later edits of the agent reach it.

Data only. A value that differs from the agent's (a choice made for the
conversation), any other key, and provider_state that is not a JSON object are
left exactly as they are. Running it again changes nothing more.

Revision ID: b5e2d8c4a913
Revises: f3c9a2d7b614
"""
import json

from alembic import context, op
import sqlalchemy as sa

revision = "b5e2d8c4a913"
down_revision = "f3c9a2d7b614"
branch_labels = None
depends_on = None

_thread = sa.table(
    "thread",
    sa.column("id", sa.BigInteger),
    sa.column("provider_state", sa.JSON(none_as_null=True)),
)


def _as_object(raw):
    """The stored provider_state as a dict, or None (missing, malformed, not an object)."""
    if isinstance(raw, (bytes, bytearray)):
        raw = raw.decode("utf-8", errors="replace")
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except ValueError:
            return None
    return raw if isinstance(raw, dict) else None


def upgrade():
    if context.is_offline_mode():
        # It reads each conversation's state; there is nothing to write as SQL ahead of time.
        return
    bind = op.get_bind()
    rows = bind.execute(sa.text(
        "SELECT thread.id, thread.provider, thread.model, thread.provider_state, "
        "agent.provider, agent.model, agent.effort "
        "FROM thread JOIN agent ON agent.id = thread.agent_id "
        "WHERE thread.provider_state IS NOT NULL AND agent.effort IS NOT NULL"
    )).fetchall()
    for thread_id, provider, model, raw, agent_provider, agent_model, agent_effort in rows:
        state = _as_object(raw)
        if state is None or "effort" not in state or state["effort"] != agent_effort:
            continue
        if provider != agent_provider or (model is not None and model != agent_model):
            continue
        kept = {key: value for key, value in state.items() if key != "effort"}
        bind.execute(_thread.update().where(_thread.c.id == thread_id).values(provider_state=kept))


def downgrade():
    # Which conversations had a copy cannot be told apart afterwards, and a
    # conversation that follows its agent runs at the same effort either way.
    pass
