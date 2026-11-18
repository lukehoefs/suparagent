// Rules for the command palette (design: CommandPalette.html), kept free of React so node tests can
// load them: the pages it jumps to and who sees them, the groups and their order, how a search
// ranks rows, what waits for the person, and the G-then-letter go-to keys.

import { toolDisplayName } from "./approval-card.ts";
import type { BriefRow, WaitingItem } from "./today.ts";

// The groups, in the order the palette lists them before anything is typed.
export type PaletteGroup = "waiting" | "recent" | "agents" | "goto" | "actions";
export const PALETTE_GROUPS: readonly PaletteGroup[] = ["waiting", "recent", "agents", "goto", "actions"];

export type PaletteEntry = {
  id: string;
  group: PaletteGroup;
  label: string;
  // The muted line after the label (an agent's role, which agent a chat is with).
  detail?: string;
  // More words a search matches on; never shown.
  keywords?: readonly string[];
  // false: found by searching only (the many settings rows), never in the opening list.
  browse?: boolean;
};

// How many rows each group shows: before typing (the design's two or three, so all five groups,
// Actions included, stay in view), and for a search.
const BROWSE_LIMITS: Record<PaletteGroup, number> = { waiting: 3, recent: 2, agents: 2, goto: 3, actions: 3 };
const SEARCH_LIMITS: Record<PaletteGroup, number> = { waiting: 8, recent: 10, agents: 10, goto: 12, actions: 8 };

export type PalettePageId = "today" | "agents" | "tasks" | "results" | "routines" | "apps" | "computers" | "settings" | "workflows" | "clients" | "mcp-servers" | "docs";
export type PalettePage = {
  id: PalettePageId;
  href: string;
  // Owner and admin only, like the sidebar entry and the page's own endpoints.
  adminOnly: boolean;
  // The letter after G that jumps here from anywhere the palette is mounted (design: G T, G K).
  sequence?: string;
  // Listed before anything is typed: the pages with a G shortcut (G T, G K). The others are found
  // by searching, so the opening list stays short. The third "Go to" row is Agent permissions
  // (design: CommandPalette.html), a settings page the palette lists itself.
  listed?: true;
};

// The "Go to" pages, in the sidebar's order (design: Main.html), then the two the sidebar keeps in
// its footer menu.
export const PALETTE_PAGES: readonly PalettePage[] = [
  { id: "today", href: "/today/", adminOnly: true, sequence: "t", listed: true },
  { id: "agents", href: "/agents/", adminOnly: false },
  { id: "tasks", href: "/tasks/", adminOnly: true, sequence: "k", listed: true },
  { id: "results", href: "/results/", adminOnly: true },
  { id: "routines", href: "/routines/", adminOnly: true },
  { id: "apps", href: "/apps/", adminOnly: true },
  { id: "computers", href: "/computers/", adminOnly: true },
  // Ctrl/Cmd+, opens it from any page (lib/settings-shortcut.ts), and a search finds it.
  { id: "settings", href: "/settings/", adminOnly: false },
  { id: "workflows", href: "/chat/?view=workflows", adminOnly: true },
  { id: "clients", href: "/clients/", adminOnly: true },
  // They left the Settings list (MCP servers live on Apps; Documentation is linked from General's
  // Getting started card), so a search still finds them here.
  { id: "mcp-servers", href: "/apps/#custom-mcp-heading", adminOnly: true },
  { id: "docs", href: "/docs/", adminOnly: true },
];

// The pages this person may open. `browse`: listed before typing (the pages with a G shortcut, or
// every page when there are only a few, as for a member).
export function palettePages(admin: boolean): (PalettePage & { browse: boolean })[] {
  const pages = PALETTE_PAGES.filter((page) => admin || !page.adminOnly);
  const few = pages.length <= BROWSE_LIMITS.goto;
  return pages.map((page) => ({ ...page, browse: few || page.listed === true }));
}

// Lower case with accents dropped, so "resume" finds "Résumé".
export function normalize(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase();
}

const WORD_EDGE = /[\s_.:/·,()[\]'"-]/;

// Lower is better: the start of the field, then the start of a word, then anywhere. null: absent.
function fieldScore(field: string, token: string, base: number): number | null {
  const at = field.indexOf(token);
  if (at < 0) return null;
  if (at === 0) return base;
  return WORD_EDGE.test(field[at - 1]) ? base + 1 : base + 2;
}

/**
 * How well a row matches a search, lower is better; null when it does not. Every word typed must
 * appear in the label, the detail or a keyword. A word in the label counts more than one in the
 * other fields, and a label that is exactly the search comes first.
 */
export function scoreEntry(entry: PaletteEntry, query: string): number | null {
  const whole = normalize(query).trim().replace(/\s+/g, " ");
  if (!whole) return 0;
  const label = normalize(entry.label);
  const rest = [entry.detail ?? "", ...(entry.keywords ?? [])].map(normalize);
  let total = label === whole ? -10 : 0;
  for (const token of whole.split(" ")) {
    let best = fieldScore(label, token, 0);
    for (const field of rest) {
      const score = fieldScore(field, token, 3);
      if (score !== null && (best === null || score < best)) best = score;
    }
    if (best === null) return null;
    total += best;
  }
  return total;
}

/**
 * The rows to list, group by group. Before typing: the browsable rows of each group in the order
 * given, a few per group, groups in PALETTE_GROUPS order. For a search: the matching rows, best
 * first within a group, and the group holding the best match first (ties keep the usual order).
 */
export function arrangePalette<T extends PaletteEntry>(entries: readonly T[], query: string): T[] {
  if (!normalize(query).trim()) {
    return PALETTE_GROUPS.flatMap((group) =>
      entries.filter((entry) => entry.group === group && entry.browse !== false).slice(0, BROWSE_LIMITS[group]),
    );
  }
  const scored = entries.flatMap((entry, index) => {
    const score = scoreEntry(entry, query);
    return score === null ? [] : [{ entry, index, score }];
  });
  return PALETTE_GROUPS.map((group, order) => {
    const rows = scored
      .filter((row) => row.entry.group === group)
      .sort((a, b) => a.score - b.score || a.index - b.index)
      .slice(0, SEARCH_LIMITS[group]);
    return { order, rows, best: rows.length > 0 ? rows[0].score : Number.POSITIVE_INFINITY };
  })
    .filter((group) => group.rows.length > 0)
    .sort((a, b) => a.best - b.best || a.order - b.order)
    .flatMap((group) => group.rows.map((row) => row.entry));
}

const activity = (value: string) => Date.parse(value) || 0;

// Conversations for "Recent": archived ones left out, the most recently active first.
export function recentThreads<T extends { archived_at: string | null; updated_at: string }>(threads: readonly T[] | null): T[] {
  return (threads ?? []).filter((thread) => thread.archived_at === null).sort((a, b) => activity(b.updated_at) - activity(a.updated_at));
}

/**
 * The archived conversations a search may find (Recent leaves them out): those archived in the
 * host's list or in the palette's own read with archived ones (`fetched`), each once, the most
 * recently active first. The host's list is the newer: a conversation it shows unarchived is not
 * listed again as archived.
 */
export function archivedThreads<T extends { id: number; archived_at: string | null; updated_at: string }>(
  threads: readonly T[] | null,
  fetched: readonly T[] | null,
): T[] {
  const unarchived = new Set((threads ?? []).filter((thread) => thread.archived_at === null).map((thread) => thread.id));
  const found = new Map<number, T>();
  for (const thread of [...(threads ?? []), ...(fetched ?? [])]) {
    if (thread.archived_at !== null && !unarchived.has(thread.id) && !found.has(thread.id)) found.set(thread.id, thread);
  }
  return [...found.values()].sort((a, b) => activity(b.updated_at) - activity(a.updated_at));
}

export type WaitingEntry = {
  key: string;
  // What waits: an approval, a question, or what stops an agent (signed_out, routine, …).
  kind: string;
  // The row's one word, a message key. Approving is never done from the palette: a call's row says
  // "Review" and opens the conversation, where the approval card says what the tool does and
  // offers its choices. A question says "Answer"; the rest say what Today's button says.
  labelKey: string;
  // What waits (the call's summary, the question, "Claude Code is signed out").
  line: string;
  // The conversation's title, or the row's own detail, when there is one.
  context: string | null;
  // The tool a call waits on, when known: the row then reads "Atlas wants to use searxng_web_search".
  tool: string | null;
  // Who asks: the agent of the conversation, routine or task, as Today shows it.
  agentId: number | null;
  href: string;
};

/**
 * "Waiting for you": what Today lists under that title (lib/today.ts waitingItems), in its order,
 * each with the in-app page that moves it on. Rows with nowhere to go in the app are left out here
 * (Today still lists them, and "See all" leads there: waitingBrowse). `rows` are the brief's rows,
 * which name the tool of a call that only the brief knows of.
 */
export function waitingEntries(items: readonly WaitingItem[] | null | undefined, rows?: readonly BriefRow[] | null): WaitingEntry[] {
  const tools = new Map((rows ?? []).flatMap((row) => (row.kind === "approval" && row.tool ? [[row.key, row.tool] as const] : [])));
  const out: WaitingEntry[] = [];
  for (const item of items ?? []) {
    const href = item.href;
    if (!href || !href.startsWith("/")) continue;
    if (item.type === "approval") {
      const tool = item.call ? item.call.tool : tools.get(item.key);
      out.push({
        key: item.key, kind: "approval", labelKey: "palette.review", line: item.summary, context: item.title,
        tool: tool ? toolDisplayName(tool, item.call ? item.call.summary : item.summary) : null,
        agentId: item.agentId, href,
      });
    } else {
      out.push({
        key: item.key, kind: item.row.kind, labelKey: item.type === "question" ? "palette.answer" : item.actionKey,
        line: item.row.title, context: item.row.detail, tool: null, agentId: item.agentId, href,
      });
    }
  }
  return out;
}

/**
 * Before typing, the Waiting group lists at most BROWSE_LIMITS.waiting rows (the design's two or
 * three). When more wait than that, or some cannot be opened from here, its last row is "See all"
 * with the count, which opens Today, so the group never seems to disagree with the sidebar's band.
 * `listed`: how many of the `entries` show before typing (every one is still found by searching).
 */
export function waitingBrowse(entries: number, total: number): { listed: number; seeAll: boolean } {
  const limit = BROWSE_LIMITS.waiting;
  const seeAll = total > limit || total > entries;
  return { listed: seeAll ? Math.min(entries, limit - 1) : entries, seeAll };
}

// --- keys -----------------------------------------------------------------------------------

export function isApplePlatform(platform: string): boolean {
  return /Mac|iPhone|iPad|iPod/i.test(platform);
}

type KeyTarget = { tagName?: string; isContentEditable?: boolean; closest?: (selector: string) => unknown } | null;

// The go-to keys never act while the person types, or inside a dialog, menu or list with keys of its own.
export function keysAllowedAt(target: KeyTarget): boolean {
  if (!target) return true;
  if (target.isContentEditable) return false;
  const tag = (target.tagName ?? "").toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return false;
  return !target.closest?.('[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], [role="application"]');
}

export type KeyPress = {
  key: string;
  code?: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  repeat?: boolean;
  isComposing?: boolean;
};

// The plain letter pressed (no modifier, not held down), lower case; the physical key's letter
// when the layout types something else (Cyrillic, say). null for anything else.
export function pressedLetter(event: KeyPress): string | null {
  if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || event.repeat || event.isComposing) return null;
  if (/^[a-z]$/i.test(event.key)) return event.key.toLowerCase();
  const physical = /^Key([A-Z])$/.exec(event.code ?? "");
  return physical ? physical[1].toLowerCase() : null;
}

// Ctrl+K (Cmd+K on a Mac) opens and closes the palette. The letter typed decides; the physical K
// key counts only when the layout types no Latin letter there (Cyrillic, Greek), so on Colemak,
// say, Ctrl+E (the physical K) keeps its own meaning.
export function isPaletteShortcut(event: KeyPress): boolean {
  if (!(event.metaKey || event.ctrlKey) || event.altKey) return false;
  const key = event.key.toLowerCase();
  return key === "k" || (!/^[a-z]$/.test(key) && event.code === "KeyK");
}

// How long after G the second letter still counts.
export const SEQUENCE_MS = 1500;

/**
 * One step of the go-to keys: G arms them, and a target letter pressed within SEQUENCE_MS fires
 * that target. Anything else disarms them. `pending` is when G was pressed, or null.
 */
export function nextSequence(pending: number | null, letter: string | null, now: number, targets: ReadonlySet<string>): { pending: number | null; fire: string | null } {
  const armed = pending !== null && now - pending >= 0 && now - pending <= SEQUENCE_MS;
  if (armed && letter !== null && targets.has(letter)) return { pending: null, fire: letter };
  if (letter === "g") return { pending: now, fire: null };
  return { pending: null, fire: null };
}

/**
 * G then C starts a new chat (the key caps on the "New chat" row). A C alone does nothing: a
 * single-letter shortcut fires on a stray key or a speech command (WCAG 2.1.4), and leaving the
 * open conversation is too much for that. The caller checks the focus as for the go-to keys.
 */
export const NEW_CHAT_KEY = "c";
export function isNewChatKey(pending: number | null, letter: string | null, now: number): boolean {
  const armed = pending !== null && now - pending >= 0 && now - pending <= SEQUENCE_MS;
  return letter === NEW_CHAT_KEY && armed;
}

// --- leaving the page -----------------------------------------------------------------------

/**
 * True when something on the page would ask before it unloads: a page with unsaved work keeps a
 * beforeunload guard that cancels the event (AppShell's leave guard, the permissions matrix). A
 * cancelable probe goes to those listeners only; nothing unloads and the browser asks nothing.
 */
export function wouldAskBeforeLeaving(target: EventTarget): boolean {
  const probe = new Event("beforeunload", { cancelable: true });
  target.dispatchEvent(probe);
  return probe.defaultPrevented;
}
