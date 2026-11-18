"""The app's agent-editable look: theme colours, the sidebar, and agent-made pages.

One JSON document per owner, saved as a new `ui_revision` row on every change, so
every change can be undone (restore writes a new row with an older document).

    {
      "theme": {"light": {"accent": "#2563eb"}, "dark": {...}},
      "nav": {"order": ["agents", "page:sales"], "hidden": ["routines"], "labels": {"agents": "Team"}},
      "pages": [{"id": "sales", "title": "Sales", "in_nav": true, "html": "<!doctype html>..."}]
    }

What an agent can change is deliberately narrow, so a change can never lock the
person out or hide a warning:

- Colours: only the surface, text and accent tokens in THEME_TOKENS, only as hex, and
  a change that makes text unreadable (under 4.5:1, the same bar as
  frontend/scripts/check-contrast.mjs) is refused. The status colours (success,
  warning, danger, running) that approval cards and errors use are not editable.
- Sidebar: reorder, rename and hide the built-in pages, except Settings, which always
  stays visible (it is where every change is undone).
- Pages: HTML the frontend shows only inside a sandboxed iframe with an opaque origin
  (frontend/app/custom/), so a page cannot read the app's cookies, call its API or
  navigate the app. It can run its own scripts and load public resources.
"""
from __future__ import annotations

import copy
import re

from sqlalchemy import delete, select

from app.db.models import UiRevision

KEEP = 100
MAX_PAGES = 20
MAX_PAGE_HTML = 300_000
MAX_TITLE = 40
MAX_LABEL = 30
MAX_SUMMARY = 200

NAV_KEYS = ("today", "agents", "tasks", "results", "routines", "apps", "computers", "settings")
ALWAYS_SHOWN = frozenset({"settings"})
MODES = ("light", "dark")

# The tokens an agent may set, with the app's own values (frontend/app/globals.css) for the
# contrast check. Keep in step with globals.css.
THEME_DEFAULTS = {
    "light": {
        "bg-app": "#f1f1f1", "bg-surface": "#ffffff", "bg-raised": "#ffffff", "bg-inset": "#f1f1f1",
        "bg-hover": "#e2e2e2", "line-strong": "#d4d4d4", "ink": "#111111", "ink-muted": "#474747",
        "ink-faint": "#5e5e5e", "accent": "#4f46e5", "accent-fg": "#ffffff", "accent-text": "#4338ca",
        "accent-bg": "#eef2ff", "focus": "#4f46e5", "bubble-user": "#f1f1f1", "code-bg": "#f1f1f1",
    },
    "dark": {
        "bg-app": "#1b1b1b", "bg-surface": "#262626", "bg-raised": "#1b1b1b", "bg-inset": "#303030",
        "bg-hover": "#303030", "line-strong": "#525252", "ink": "#ffffff", "ink-muted": "#ababab",
        "ink-faint": "#9e9e9e", "accent": "#4f46e5", "accent-fg": "#ffffff", "accent-text": "#a5b4fc",
        "accent-bg": "#1e1b4b", "focus": "#a5b4fc", "bubble-user": "#303030", "code-bg": "#303030",
    },
}
THEME_TOKENS = tuple(THEME_DEFAULTS["light"])

# (text token, background token): each pair must stay readable after a change.
CONTRAST_PAIRS = (
    ("ink", "bg-surface"), ("ink", "bg-app"), ("ink", "bg-raised"), ("ink", "bg-inset"),
    ("ink", "bubble-user"), ("ink", "code-bg"),
    ("ink-muted", "bg-surface"), ("ink-muted", "bg-app"),
    ("accent-fg", "accent"), ("accent-text", "bg-surface"), ("accent-text", "accent-bg"),
)
MIN_CONTRAST = 4.5

_HEX = re.compile(r"^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")
_PAGE_ID = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$")


class UiConfigError(ValueError):
    """A change that is not allowed; the message is shown to the agent or person as is."""


def empty() -> dict:
    return {"theme": {"light": {}, "dark": {}}, "nav": {"order": [], "hidden": [], "labels": {}}, "pages": []}


# -- colours ---------------------------------------------------------------------------


def _rgb(value: str) -> tuple[float, float, float]:
    value = value.lstrip("#")
    if len(value) == 3:
        value = "".join(c * 2 for c in value)
    return tuple(int(value[i:i + 2], 16) / 255 for i in (0, 2, 4))  # type: ignore[return-value]


def _luminance(value: str) -> float:
    def channel(c: float) -> float:
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = (channel(c) for c in _rgb(value))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(a: str, b: str) -> float:
    la, lb = sorted((_luminance(a), _luminance(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


def _check_theme(theme: dict) -> None:
    for mode in MODES:
        values = {**THEME_DEFAULTS[mode], **theme.get(mode, {})}
        for text, background in CONTRAST_PAIRS:
            ratio = contrast(values[text], values[background])
            if ratio < MIN_CONTRAST:
                raise UiConfigError(
                    f"In {mode} mode, {text} ({values[text]}) on {background} ({values[background]}) has a "
                    f"contrast of {ratio:.1f}:1; text must stay at {MIN_CONTRAST}:1 or more to be readable. "
                    "Pick a darker or lighter colour, or change both together."
                )


# -- validation ------------------------------------------------------------------------


def _text(value, limit: int, what: str) -> str:
    if not isinstance(value, str):
        raise UiConfigError(f"{what} must be text.")
    value = " ".join(value.split())
    if not value:
        raise UiConfigError(f"{what} cannot be empty.")
    if len(value) > limit:
        raise UiConfigError(f"{what} is longer than {limit} characters.")
    return value


def normalize(config) -> dict:
    """A complete, checked config. Raises UiConfigError with a plain reason."""
    if not isinstance(config, dict):
        raise UiConfigError("The UI config must be an object.")
    out = empty()
    theme = config.get("theme") or {}
    if not isinstance(theme, dict) or set(theme) - set(MODES):
        raise UiConfigError("theme has a light and a dark part only.")
    for mode in MODES:
        values = theme.get(mode) or {}
        if not isinstance(values, dict):
            raise UiConfigError(f"theme.{mode} must map token names to colours.")
        for token, colour in values.items():
            if token not in THEME_TOKENS:
                raise UiConfigError(
                    f"{token!r} is not a colour you can change. You can change: {', '.join(THEME_TOKENS)}. "
                    "Status colours (success, warning, danger, running) stay fixed so warnings always look like warnings."
                )
            if not isinstance(colour, str) or not _HEX.match(colour):
                raise UiConfigError(f"{token} must be a hex colour like #2563eb.")
            out["theme"][mode][token] = colour.lower()
    _check_theme(out["theme"])

    pages_in = config.get("pages") or []
    if not isinstance(pages_in, list):
        raise UiConfigError("pages must be a list.")
    if len(pages_in) > MAX_PAGES:
        raise UiConfigError(f"There can be at most {MAX_PAGES} custom pages; delete one first.")
    seen = set()
    for page in pages_in:
        if not isinstance(page, dict):
            raise UiConfigError("Each page must be an object.")
        page_id = page.get("id")
        if not isinstance(page_id, str) or not _PAGE_ID.match(page_id):
            raise UiConfigError("A page id is 1 to 40 lowercase letters, digits and dashes, like sales-dashboard.")
        if page_id in seen:
            raise UiConfigError(f"Two pages have the id {page_id}.")
        seen.add(page_id)
        html = page.get("html")
        if not isinstance(html, str) or not html.strip():
            raise UiConfigError(f"Page {page_id} has no HTML.")
        if len(html) > MAX_PAGE_HTML:
            raise UiConfigError(f"Page {page_id} is larger than {MAX_PAGE_HTML:,} characters.")
        out["pages"].append({
            "id": page_id,
            "title": _text(page.get("title"), MAX_TITLE, f"Page {page_id}'s title"),
            "in_nav": bool(page.get("in_nav", True)),
            "html": html,
        })

    nav = config.get("nav") or {}
    if not isinstance(nav, dict) or set(nav) - {"order", "hidden", "labels"}:
        raise UiConfigError("nav has order, hidden and labels only.")
    known = set(NAV_KEYS) | {f"page:{p}" for p in seen}
    order = nav.get("order") or []
    if not isinstance(order, list) or any(not isinstance(k, str) for k in order):
        raise UiConfigError("nav.order is a list of page keys.")
    unknown = [k for k in order if k not in known]
    if unknown:
        raise UiConfigError(
            f"Unknown sidebar entries: {', '.join(unknown)}. Built-in pages are {', '.join(NAV_KEYS)}; "
            "a custom page is page:<id>."
        )
    out["nav"]["order"] = list(dict.fromkeys(order))
    hidden = nav.get("hidden") or []
    if not isinstance(hidden, list) or any(k not in NAV_KEYS for k in hidden):
        raise UiConfigError(f"nav.hidden lists built-in pages only: {', '.join(NAV_KEYS)}. "
                            "To take a custom page out of the sidebar, set its in_nav to false.")
    if ALWAYS_SHOWN & set(hidden):
        raise UiConfigError("Settings always stays in the sidebar: it is where changes are undone.")
    out["nav"]["hidden"] = sorted(set(hidden), key=NAV_KEYS.index)
    labels = nav.get("labels") or {}
    if not isinstance(labels, dict) or any(k not in NAV_KEYS for k in labels):
        raise UiConfigError(f"nav.labels renames built-in pages only: {', '.join(NAV_KEYS)}.")
    out["nav"]["labels"] = {k: _text(v, MAX_LABEL, f"The label for {k}") for k, v in labels.items()}
    return out


def public(config: dict) -> dict:
    """What every signed-in screen reads: the config without page HTML (fetched per page)."""
    out = copy.deepcopy(config)
    out["pages"] = [{k: v for k, v in p.items() if k != "html"} for p in config.get("pages", [])]
    return out


# -- changes an agent asks for ---------------------------------------------------------


def set_theme(config: dict, mode: str, tokens: dict) -> tuple[dict, str]:
    if mode not in (*MODES, "both"):
        raise UiConfigError("mode is light, dark or both.")
    if not isinstance(tokens, dict) or not tokens:
        raise UiConfigError("tokens maps one or more colour names to hex colours (or null to go back to the default).")
    new = copy.deepcopy(config)
    for target in (MODES if mode == "both" else (mode,)):
        for token, colour in tokens.items():
            if colour is None:
                new["theme"][target].pop(token, None)
            else:
                new["theme"][target][token] = colour
    changed = ", ".join(f"{t} {'reset' if c is None else c}" for t, c in tokens.items())
    return new, f"Colours ({mode}): {changed}"


def set_nav(config: dict, *, order=None, hidden=None, labels=None) -> tuple[dict, str]:
    new = copy.deepcopy(config)
    parts = []
    if order is not None:
        new["nav"]["order"] = order
        parts.append("order")
    if hidden is not None:
        new["nav"]["hidden"] = hidden
        parts.append("hidden pages")
    if labels is not None:
        new["nav"]["labels"] = labels
        parts.append("labels")
    if not parts:
        raise UiConfigError("Give at least one of order, hidden or labels.")
    return new, "Sidebar: " + ", ".join(parts)


def save_page(config: dict, page_id, title, html, in_nav=True) -> tuple[dict, str]:
    new = copy.deepcopy(config)
    page = {"id": page_id, "title": title, "html": html, "in_nav": in_nav}
    for i, existing in enumerate(new["pages"]):
        if existing["id"] == page_id:
            new["pages"][i] = page
            return new, f"Page updated: {title}"
    new["pages"].append(page)
    return new, f"Page added: {title}"


def delete_page(config: dict, page_id) -> tuple[dict, str]:
    new = copy.deepcopy(config)
    page = next((p for p in new["pages"] if p["id"] == page_id), None)
    if page is None:
        raise UiConfigError(f"There is no page {page_id}.")
    new["pages"].remove(page)
    new["nav"]["order"] = [k for k in new["nav"]["order"] if k != f"page:{page_id}"]
    return new, f"Page deleted: {page['title']}"


# -- storage ---------------------------------------------------------------------------


async def latest(db, owner_id: str) -> UiRevision | None:
    return await db.scalar(
        select(UiRevision).where(UiRevision.owner_id == owner_id).order_by(UiRevision.id.desc()).limit(1)
    )


async def current(db, owner_id: str) -> tuple[dict, int | None]:
    row = await latest(db, owner_id)
    return (normalize(row.config) if row else empty()), (row.id if row else None)


async def save(db, owner_id: str, config: dict, *, summary: str, source: str, actor: str,
               agent_id: int | None = None, restored_from: int | None = None) -> UiRevision:
    """Checks and saves a new version (the caller commits). Raises UiConfigError."""
    row = UiRevision(
        owner_id=owner_id, config=normalize(config), summary=summary[:MAX_SUMMARY], source=source,
        actor=actor[:80], agent_id=agent_id, restored_from=restored_from,
    )
    db.add(row)
    await db.flush()
    keep = list((await db.execute(
        select(UiRevision.id).where(UiRevision.owner_id == owner_id).order_by(UiRevision.id.desc()).limit(KEEP)
    )).scalars())
    if len(keep) == KEEP:
        await db.execute(delete(UiRevision).where(UiRevision.owner_id == owner_id, UiRevision.id < keep[-1]))
    return row


async def history(db, owner_id: str, limit: int = 30) -> list[UiRevision]:
    return list((await db.execute(
        select(UiRevision).where(UiRevision.owner_id == owner_id).order_by(UiRevision.id.desc()).limit(limit)
    )).scalars())


async def restore(db, owner_id: str, revision_id: int | None, *, source: str, actor: str,
                  agent_id: int | None = None) -> UiRevision:
    """Brings back an earlier version as a new one. With no id: the version before the latest
    (undo the last change); with 0: the app's default look."""
    if revision_id == 0:
        return await save(db, owner_id, empty(), summary="Back to the default look", source=source,
                          actor=actor, agent_id=agent_id)
    if revision_id is None:
        rows = await history(db, owner_id, limit=2)
        if not rows:
            raise UiConfigError("Nothing has been changed yet, so there is nothing to undo.")
        if len(rows) == 1:
            return await save(db, owner_id, empty(), summary=f"Undid: {rows[0].summary}", source=source,
                              actor=actor, agent_id=agent_id, restored_from=0)
        target, summary = rows[1], f"Undid: {rows[0].summary}"
    else:
        target = await db.scalar(
            select(UiRevision).where(UiRevision.owner_id == owner_id, UiRevision.id == revision_id)
        )
        if target is None:
            raise UiConfigError(f"There is no saved version {revision_id}.")
        summary = f"Went back to version {target.id}: {target.summary}"
    return await save(db, owner_id, target.config, summary=summary, source=source, actor=actor,
                      agent_id=agent_id, restored_from=target.id)


def revision_out(row: UiRevision) -> dict:
    return {
        "id": row.id, "summary": row.summary, "source": row.source, "actor": row.actor,
        "agent_id": row.agent_id, "restored_from": row.restored_from,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "pages": len((row.config or {}).get("pages", [])),
    }
