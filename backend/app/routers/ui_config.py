"""The app's agent-editable look (app/ui/config.py): read by every signed-in screen,
changed by agents through their `ui` tools (app/ui/bridge.py) and undone here.

Reading the config and a custom page needs the chat scope (auth/policy.py), because
the sidebar and theme show for everyone; history, undo and reset are admin-only.

Errors carry `{"detail": {"error_code": "...", "message": "..."}}`.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.db.transactions import begin_write
from app.routers.threads import get_runtime
from app.services.local_access_policy import require_local_access
from app.ui import config as ui

router = APIRouter(prefix="/ui-config", tags=["UI config"], dependencies=[Depends(require_local_access)])


def _error(status_code: int, code: str, message: str) -> HTTPException:
    return HTTPException(status_code=status_code, detail={"error_code": code, "message": message})


class RestoreRequest(BaseModel):
    # A version id from /history; 0 means the default look; null undoes the latest change.
    revision_id: int | None = None


@router.get("")
async def read_config(rt=Depends(get_runtime)):
    """The current look without page HTML: theme overrides, sidebar and the pages list."""
    async with rt.session() as db:
        config, version = await ui.current(db, rt.owner_id)
    return {"version": version, "config": ui.public(config)}


@router.get("/pages/{page_id}")
async def read_page(page_id: str, rt=Depends(get_runtime)):
    async with rt.session() as db:
        config, _ = await ui.current(db, rt.owner_id)
    page = next((p for p in config["pages"] if p["id"] == page_id), None)
    if page is None:
        raise _error(404, "page_not_found", "There is no such page. It may have been deleted or undone.")
    return page


@router.get("/history")
async def read_history(rt=Depends(get_runtime)):
    async with rt.session() as db:
        rows = await ui.history(db, rt.owner_id, limit=ui.KEEP)
    return {"revisions": [ui.revision_out(r) for r in rows]}


@router.post("/restore")
async def restore(payload: RestoreRequest, rt=Depends(get_runtime)):
    async with rt.session() as db:
        await begin_write(db)
        try:
            row = await ui.restore(db, rt.owner_id, payload.revision_id, source="person", actor="you")
        except ui.UiConfigError as exc:
            await db.rollback()
            raise _error(409, "cannot_restore", str(exc)) from exc
        await db.commit()
        config, version = ui.normalize(row.config), row.id
    return {"version": version, "config": ui.public(config)}
