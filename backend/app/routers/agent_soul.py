"""An agent's SOUL.md: read it, and save the person's part. The tools block is managed by the app."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.routers.agents import _agent_or_404, get_runtime
from app.services import agent_soul
from app.services.local_access_policy import require_local_access
from app.services.thread_runtime import ThreadRuntime

router = APIRouter(
    prefix="/agents/{agent_id}/soul",
    tags=["Agent soul"],
    dependencies=[Depends(require_local_access)],
)


class SoulResponse(BaseModel):
    text: str
    mine: str
    managed: str
    path: str


class SoulWrite(BaseModel):
    mine: str = Field(default="", max_length=agent_soul.MAX_USER_BYTES)


def _response(agent_id: int) -> SoulResponse:
    text = agent_soul.read_soul(agent_id)
    mine, managed = agent_soul.split(text)
    return SoulResponse(text=text, mine=mine, managed=managed, path=str(agent_soul.soul_path(agent_id)))


@router.get("", response_model=SoulResponse)
async def read_soul(agent_id: int, rt: ThreadRuntime = Depends(get_runtime), db: AsyncSession = Depends(get_db)):
    agent = await _agent_or_404(rt, agent_id)
    if not agent_soul.read_soul(agent_id).strip():
        await agent_soul.refresh_quietly(db, agent_id)
    if not agent_soul.read_soul(agent_id).strip():
        agent_soul.soul_path(agent_id).parent.mkdir(parents=True, exist_ok=True)
        agent_soul.agent_memory.write_atomic(agent_soul.soul_path(agent_id), agent_soul.default_soul(getattr(agent, "name", None)))
    return _response(agent_id)


@router.put("", response_model=SoulResponse)
async def write_soul(
    agent_id: int, payload: SoulWrite, rt: ThreadRuntime = Depends(get_runtime), db: AsyncSession = Depends(get_db),
):
    await _agent_or_404(rt, agent_id)
    try:
        await agent_soul.save_user_part(db, agent_id, payload.mine)
    except ValueError:
        raise HTTPException(status_code=413, detail={"error_code": "soul_too_large", "message": "SOUL.md is too long."})
    return _response(agent_id)
