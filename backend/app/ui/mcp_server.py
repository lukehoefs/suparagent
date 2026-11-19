"""A small stdio MCP server giving a turn the `ui` tools: read and change how this app
looks (app/ui/config.py).

It never touches the database. Each call is a request file in the turn's private
mailbox folder; the backend (app/ui/bridge.py) answers it for the owner the turn
belongs to, after checking that a change has a matching, unused approval, and writes
the reply beside it. Same transport as app/memory_mcp_server.py.
"""
import argparse
import json
import os
import sys
import time
from pathlib import Path
from uuid import uuid4

# Kept in step with app/ui/config.py (this process does not import the app).
TOKENS = (
    "bg-app", "bg-surface", "bg-raised", "bg-inset", "bg-hover", "line-strong", "ink", "ink-muted",
    "ink-faint", "accent", "accent-fg", "accent-text", "accent-bg", "focus", "bubble-user", "code-bg",
)
NAV_KEYS = ("today", "agents", "tasks", "results", "routines", "apps", "computers", "settings")


# The live data a page can ask for (frontend/lib/page-data.ts PAGE_RESOURCES; keep in step).
PAGE_DATA = (
    "agents: [{id, name, title, provider, model, pinned}]",
    "running: what agents are doing now [{thread_id, agent_id, kind, title, started_at, waiting_approvals}]",
    "needs_you: what waits for the person [{kind, title, detail, at, thread_id}]",
    "tasks: the task board [{id, title, column, priority, due_date, agent_id, completed_at, execution_state}]",
    "routines: [{id, agent_id, name, paused, next_run_at}]",
    "routine_runs: the latest 100 [{id, routine_id, state, outcome, started_at, finished_at, result, error}]",
    "usage: this month's totals {month, total, by_day[], by_engine[]} with turns, tokens and cost_usd (owner and admins only)",
)


def _schema(properties, required=()):
    return {"type": "object", "properties": properties, "required": list(required), "additionalProperties": False}


_UNDO_NOTE = " Every change is saved as a version the person can undo in Settings, Appearance."

TOOLS = [
    {
        "name": "ui_get",
        "description": (
            "Read how this app (lukethomas) currently looks: colour overrides for light and dark mode, the "
            "sidebar's order, hidden pages and labels, and the custom pages agents made. Pass page_id to also get "
            "that page's HTML. Call this before changing anything."
        ),
        "inputSchema": _schema({"page_id": {"type": "string", "maxLength": 40}}),
        "annotations": {"readOnlyHint": True},
    },
    {
        "name": "ui_history",
        "description": "List the saved versions of the app's look, newest first, with who changed what and when.",
        "inputSchema": _schema({}),
        "annotations": {"readOnlyHint": True},
    },
    {
        "name": "ui_set_theme",
        "description": (
            "Change the app's colours. tokens maps colour names to hex colours like #2563eb, or to null to go back "
            f"to the default. Names you can change: {', '.join(TOKENS)}. accent is buttons and highlights, "
            "accent-fg the text on them, ink the main text, bg-* the backgrounds. Status colours stay fixed. A change "
            "that makes text hard to read (under 4.5:1 contrast) is refused with the reason." + _UNDO_NOTE
        ),
        "inputSchema": _schema({
            "mode": {"type": "string", "enum": ["light", "dark", "both"],
                     "description": "Which theme to change; both for a brand colour."},
            "tokens": {"type": "object", "additionalProperties": {"type": ["string", "null"]}},
        }, ("mode", "tokens")),
    },
    {
        "name": "ui_set_nav",
        "description": (
            f"Rearrange the sidebar. Built-in pages: {', '.join(NAV_KEYS)}; a custom page is page:<id>. order lists "
            "entries in the order to show them (anything not listed follows in its usual place). hidden lists "
            "built-in pages to hide (settings cannot be hidden). labels renames built-in pages, e.g. "
            '{"agents": "Team"}. Each field you give replaces the current one; leave a field out to keep it.'
            + _UNDO_NOTE
        ),
        "inputSchema": _schema({
            "order": {"type": "array", "items": {"type": "string"}, "maxItems": 40},
            "hidden": {"type": "array", "items": {"type": "string", "enum": list(NAV_KEYS)}},
            "labels": {"type": "object", "additionalProperties": {"type": "string", "maxLength": 30}},
        }),
    },
    {
        "name": "ui_save_page",
        "description": (
            "Create or replace a custom page in the app, such as a live dashboard, a report or a small tool. html "
            "is a complete self-contained HTML document with inline CSS and JS; scripts, styles and fonts may load "
            "from cdn.jsdelivr.net, cdnjs.cloudflare.com, unpkg.com and Google Fonts. It runs in a sandboxed frame "
            "with NO network access (no fetch or XHR, images only as data: or blob: URLs, no popups or forms), so "
            "for live app data use the helper the app adds to every page: `await lukethomas.get(name)` returns the "
            "data once; `lukethomas.watch(name, (data, error) => ..., seconds)` calls back now and then every "
            "`seconds` (15 or more) and returns a stop function. Names: " + "; ".join(PAGE_DATA) + ". Data is "
            "read-only and only what the person viewing could see; render it as text (never as HTML). Show a "
            "loading state and an error message. in_nav (default true) puts the page in the sidebar. Saving with "
            "an existing id replaces that page." + _UNDO_NOTE
        ),
        "inputSchema": _schema({
            "id": {"type": "string", "pattern": "^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$",
                   "description": "Short lowercase id, like sales-dashboard."},
            "title": {"type": "string", "maxLength": 40, "description": "The name shown in the sidebar and page header."},
            "html": {"type": "string", "maxLength": 300000},
            "in_nav": {"type": "boolean"},
        }, ("id", "title", "html")),
    },
    {
        "name": "ui_delete_page",
        "description": "Delete a custom page." + _UNDO_NOTE,
        "inputSchema": _schema({"id": {"type": "string", "maxLength": 40}}, ("id",)),
    },
    {
        "name": "ui_undo",
        "description": (
            "Undo a change to the app's look. With no revision_id it undoes the latest change; with a version id "
            "from ui_history it brings that version back; with 0 it goes back to the app's default look. The undo "
            "is itself a new version, so it can be undone too."
        ),
        "inputSchema": _schema({"revision_id": {"type": "integer", "minimum": 0}}),
    },
]


class Server:
    def __init__(self, mailbox):
        self.mailbox = Path(mailbox)

    def call(self, name, arguments):
        if name not in {t["name"] for t in TOOLS} or not isinstance(arguments, dict):
            return {"error": "Unknown tool or invalid arguments."}
        token = uuid4().hex
        path = self.mailbox / f"req-{token}.json"
        temporary = path.with_suffix(".tmp")
        temporary.write_text(json.dumps({"name": name, "arguments": arguments}), encoding="utf-8")
        os.replace(temporary, path)
        response = self.mailbox / f"resp-{token}.json"
        deadline = time.monotonic() + 120
        while time.monotonic() < deadline:
            if response.exists():
                result = json.loads(response.read_text(encoding="utf-8"))
                response.unlink(missing_ok=True)
                return result
            time.sleep(0.05)
        return {"error": "The app did not answer in time."}

    def handle(self, message):
        method, identifier = message.get("method"), message.get("id")
        if identifier is None:
            return None
        if method == "initialize":
            result = {"protocolVersion": "2025-06-18", "capabilities": {"tools": {}},
                      "serverInfo": {"name": "ui", "version": "1"}}
        elif method == "ping":
            result = {}
        elif method == "tools/list":
            result = {"tools": TOOLS}
        elif method == "tools/call":
            params = message.get("params") or {}
            body = self.call(params.get("name"), params.get("arguments") or {})
            text = body.get("text") if isinstance(body.get("text"), str) else json.dumps(body, ensure_ascii=False)
            result = {"content": [{"type": "text", "text": text}], "isError": bool(body.get("error"))}
        else:
            return {"jsonrpc": "2.0", "id": identifier, "error": {"code": -32601, "message": "Unknown method"}}
        return {"jsonrpc": "2.0", "id": identifier, "result": result}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--mailbox", required=True)
    server = Server(parser.parse_args().mailbox)
    for line in sys.stdin:
        try:
            if len(line) > 1_000_000:
                continue
            result = server.handle(json.loads(line))
            if result is not None:
                print(json.dumps(result), flush=True)
        except (ValueError, OSError, TypeError):
            continue


if __name__ == "__main__":
    main()
