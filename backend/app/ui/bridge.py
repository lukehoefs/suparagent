"""One turn's mailbox for the `ui` tools (app/ui/mcp_server.py): reads and changes the
app's look (app/ui/config.py) for the owner the turn belongs to.

Reads (ui_get, ui_history) are allowed automatically (tool_policy.py). A change only
runs when the approval gate recorded an allowed, unused approval for exactly this call
(a person's Allow, or Full access), the same check as the team tools
(app/team/bridge.consume_allowed_approval). Every change is saved as a new version, so
the person can undo it in Settings, Appearance.
"""
import asyncio
import json
import os
import shutil
import sys
import tempfile
from pathlib import Path
from types import SimpleNamespace

from app.core.logging import get_logger
from app.db.transactions import begin_write
from app.team.bridge import consume_allowed_approval
from app.ui import config as ui

logger = get_logger(__name__)

SERVER = "ui"
TOOL_PREFIX = f"mcp__{SERVER}__"
READ_TOOLS = frozenset({"ui_get", "ui_history"})
WRITE_TOOLS = frozenset({"ui_set_theme", "ui_set_nav", "ui_save_page", "ui_delete_page", "ui_undo"})
TOOLS = READ_TOOLS | WRITE_TOOLS
MAX_REQUEST = 400_000
TOOL_NOTE = (
    "You can change how this app (lukethomas) looks with the ui_* tools: its colours (ui_set_theme), the "
    "sidebar (ui_set_nav) and custom pages such as dashboards (ui_save_page). Read the current look with ui_get "
    "first. Every change is saved as a version the person can undo; tell them what you changed. To change the "
    "app's own screens or behaviour beyond this, propose a code change instead."
)


class UiBridge:
    def __init__(self, runtime, run):
        self.runtime, self.run = runtime, run
        self.folder = Path(tempfile.mkdtemp(prefix=f"suparagent-ui-{run.turn_id}-"))
        self.task: asyncio.Task | None = None
        self.calls: set[asyncio.Task] = set()

    @property
    def launch(self):
        if getattr(sys, "frozen", False):
            return SimpleNamespace(command=sys.executable, args=["--ui-mcp", "--mailbox", str(self.folder)], env={})
        root = str(Path(__file__).resolve().parents[2])
        return SimpleNamespace(
            command=sys.executable, args=["-m", "app.ui.mcp_server", "--mailbox", str(self.folder)],
            env={"PYTHONPATH": root},
        )

    def start(self) -> None:
        self.task = asyncio.create_task(self.poll())

    async def close(self) -> None:
        if self.task:
            self.task.cancel()
            await asyncio.gather(self.task, return_exceptions=True)
        for task in self.calls:
            task.cancel()
        await asyncio.gather(*self.calls, return_exceptions=True)
        shutil.rmtree(self.folder, ignore_errors=True)

    async def poll(self) -> None:
        while not self.run.ctx.aborted:
            for path in self.folder.glob("req-*.json"):
                claimed = path.with_suffix(".working")
                try:
                    path.rename(claimed)
                except FileNotFoundError:
                    continue
                task = asyncio.create_task(self.handle(claimed))
                self.calls.add(task)
                task.add_done_callback(self.calls.discard)
            await asyncio.sleep(0.05)

    async def handle(self, path: Path) -> None:
        try:
            if path.stat().st_size > MAX_REQUEST:
                result = {"error": "The request is too large."}
            else:
                request = json.loads(path.read_text(encoding="utf-8"))
                name, args = request["name"], request["arguments"]
                if not isinstance(name, str) or not isinstance(args, dict) or name not in TOOLS:
                    raise ValueError("invalid")
                result = await self.execute(name, args)
        except Exception:  # noqa: BLE001
            logger.exception("a ui call failed", turn_id=self.run.turn_id)
            result = {"error": "The change could not be completed."}
        response = self.folder / path.name.replace("req-", "resp-").replace(".working", ".json")
        tmp = response.with_suffix(".tmp")
        tmp.write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")
        os.replace(tmp, response)
        path.unlink(missing_ok=True)

    async def _actor(self, db) -> str:
        from app.db.models import Agent

        agent = await db.get(Agent, self.run.agent_id) if self.run.agent_id is not None else None
        return agent.name if agent is not None and agent.name else "An agent"

    async def execute(self, name: str, args: dict) -> dict:
        rt, run = self.runtime, self.run
        if name in READ_TOOLS:
            async with rt.session() as db:
                if name == "ui_get":
                    config, version = await ui.current(db, rt.owner_id)
                    out = {"version": version, "config": ui.public(config),
                           "editable_colours": list(ui.THEME_TOKENS), "default_colours": ui.THEME_DEFAULTS,
                           "sidebar_pages": list(ui.NAV_KEYS)}
                    page_id = args.get("page_id")
                    if page_id:
                        page = next((p for p in config["pages"] if p["id"] == page_id), None)
                        out["page"] = page if page else f"There is no page {page_id}."
                    return {"text": json.dumps(out, ensure_ascii=False)}
                rows = await ui.history(db, rt.owner_id)
                if not rows:
                    return {"text": "The app still has its default look: nothing has been changed yet."}
                return {"text": "\n".join(
                    f"- version {r.id} · {r.created_at:%Y-%m-%d %H:%M} · {r.actor}: {r.summary}" for r in rows
                )}
        async with rt.session() as db:
            allowed = await consume_allowed_approval(db, run.turn_id, run.owner_token, TOOL_PREFIX + name, args)
        if not allowed:
            return {"error": "This change has no matching, unused approval.", "code": "not_approved"}
        async with rt.session() as db:
            await begin_write(db)
            try:
                actor = await self._actor(db)
                if name == "ui_undo":
                    raw = args.get("revision_id")
                    row = await ui.restore(db, rt.owner_id, raw if isinstance(raw, int) else None,
                                           source="agent", actor=actor, agent_id=run.agent_id)
                else:
                    config, _ = await ui.current(db, rt.owner_id)
                    if name == "ui_set_theme":
                        new, summary = ui.set_theme(config, args.get("mode"), args.get("tokens"))
                    elif name == "ui_set_nav":
                        new, summary = ui.set_nav(config, order=args.get("order"), hidden=args.get("hidden"),
                                                  labels=args.get("labels"))
                    elif name == "ui_save_page":
                        new, summary = ui.save_page(config, args.get("id"), args.get("title"), args.get("html"),
                                                    args.get("in_nav", True))
                    else:
                        new, summary = ui.delete_page(config, args.get("id"))
                    row = await ui.save(db, rt.owner_id, new, summary=summary, source="agent", actor=actor,
                                        agent_id=run.agent_id)
            except ui.UiConfigError as exc:
                await db.rollback()
                return {"error": str(exc), "code": "not_allowed"}
            await db.commit()
        return {"text": (
            f"Saved as version {row.id}: {row.summary}. The app shows it on the next page load. "
            "The person can undo it in Settings, Appearance, or ask you to (ui_undo)."
        )}
