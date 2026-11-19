# Agents changing the app's look

Agents can change how lukethomas looks, without touching its code. Each change is saved as a version, and the owner can undo it in **Settings, Appearance**.

## What an agent can do

| Tool | What it does | Asks first? |
|---|---|---|
| `ui_get` | Reads the current look, and one page's HTML when asked | No (read only) |
| `ui_history` | Lists the saved versions | No (read only) |
| `ui_set_theme` | Sets colours for light, dark or both modes | Yes in Ask mode; Full access allows it |
| `ui_set_nav` | Reorders, renames or hides sidebar pages | Same |
| `ui_save_page` | Adds or replaces a custom page, such as a dashboard | Same |
| `ui_delete_page` | Deletes a custom page | Same |
| `ui_undo` | Undoes the last change, goes back to a version, or resets to the default look (`0`) | Same |

Plan mode never changes anything. The tools are mounted on every agent turn that runs on Claude. They do not run on Codex or ACP engines yet.

## Limits

- **Colours:** only the surface, text and accent tokens, and only as hex. A change that takes text under 4.5:1 contrast is refused, and the agent is told why. The status colours (success, warning, danger, running) stay fixed, so approval cards and errors always look the same.
- **Sidebar:** Settings can never be hidden, because Settings is where changes are undone.
- **Custom pages:** a page is self-contained HTML of up to 300,000 characters, with at most 20 pages. It runs in a sandboxed frame with an opaque origin (`sandbox="allow-scripts allow-modals"`, without `allow-same-origin`). A page cannot use the app's sign-in, call its API, read its storage or navigate it. It can run its own scripts.
- **Live data on pages:** the app puts a small helper at the start of every page.
  - `await lukethomas.get(name)` returns data once.
  - `lukethomas.watch(name, (data, error) => …, seconds)` repeats the request at most every 15 seconds and returns a stop function.
  - The sources are `agents`, `running`, `needs_you`, `tasks`, `routines`, `routine_runs` and `usage`. Each is read-only and trimmed to plain fields. Each request uses the viewer's own session, so a viewer only gets what they can already see.
  - A page may make at most 60 requests a minute.
  - Because a page now holds real data, a Content-Security-Policy placed before everything else on the page keeps it off the network: no fetch, XHR or WebSocket, no form posts, and images only from `data:` and `blob:`. The frame has no `allow-popups`, so it cannot open a tab that carries data out. Scripts, styles and fonts may still load from jsDelivr, cdnjs, unpkg and Google Fonts.
  - The list of sources is in `frontend/lib/page-data.ts` (`PAGE_RESOURCES`) and is repeated in the agent's tool description (`backend/app/ui/mcp_server.py`, `PAGE_DATA`). A test keeps the two the same.
- **History:** the newest 100 versions per owner are kept. Undo and reset are new versions too, so they can also be undone.

## Where it lives

- Backend rules: `backend/app/ui/config.py`
- Agent tools: `backend/app/ui/mcp_server.py` (tool list) and `backend/app/ui/bridge.py` (runs a call after its approval)
- API: `backend/app/routers/ui_config.py`
  - `GET /ui-config` and `GET /ui-config/pages/{id}` need the chat scope.
  - `GET /ui-config/history` and `POST /ui-config/restore` are admin only.
- Table: `ui_revision` (migration `f8c1a3e5b702`)
- Frontend:
  - `lib/ui-config.ts` builds the theme CSS and the sidebar order.
  - `components/CustomPage.tsx` (served at `/custom/?id=…`) shows a custom page.
  - `components/settings/AppearanceSettings.tsx` is the history and undo page.

## Not covered here

Changing the app's own screens or behaviour means changing its code. That goes through a branch, CI, staging and a release (docs/RELEASING.md), and agents should propose it instead.
