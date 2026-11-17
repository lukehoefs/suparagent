"""Delete an agent and everything that goes with it, the same way for the
person's delete button and for an approved lead proposal."""
from app.services import agent_memory, agent_skills, agent_store as store, image_gen, onboarding


async def remove_agent(rt, agent_id: int) -> None:
    """Raises agent_store.AgentNotFound. Conversations stay, unlinked; notes, skills, the
    picture and the agent's computer go; the project folder never does."""
    async with rt.session() as db:
        await store.delete_agent(db, agent_id)
    async with rt.session() as db:
        await onboarding.reopen_after_last_agent_deleted(db, rt.owner_id)
    rt.capture.drop_agent(agent_id)
    agent_memory.remove_memory(agent_id)
    agent_skills.remove_all(agent_id)
    # A later agent can be given the same id (SQLite reuses the highest one): it must not show this picture.
    try:
        image_gen.remove_avatar(agent_id)
    except OSError:
        pass
    # If Docker is not answering, the computer's removal finishes later.
    try:
        await rt.computers.mark_agent_deleted(agent_id)
    except Exception:  # noqa: BLE001
        pass
