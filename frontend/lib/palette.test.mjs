import assert from "node:assert/strict";
import { test } from "node:test";
import {
  arrangePalette,
  isApplePlatform,
  isNewChatKey,
  isPaletteShortcut,
  keysAllowedAt,
  nextSequence,
  normalize,
  PALETTE_PAGES,
  palettePages,
  pressedLetter,
  recentThreads,
  scoreEntry,
  SEQUENCE_MS,
  waitingEntries,
  wouldAskBeforeLeaving,
} from "./palette.ts";

const entry = (id, group, label, extra = {}) => ({ id, group, label, ...extra });
const ids = (rows) => rows.map((row) => row.id);

test("the pages are the design's list, and members see only the ones open to them", () => {
  assert.deepEqual(PALETTE_PAGES.map((page) => page.id), ["today", "agents", "tasks", "results", "routines", "apps", "computers", "settings", "workflows", "clients", "mcp-servers", "docs"]);
  assert.deepEqual(Object.fromEntries(PALETTE_PAGES.map((page) => [page.id, page.href])), {
    today: "/today/",
    agents: "/agents/",
    tasks: "/tasks/",
    results: "/results/",
    routines: "/routines/",
    apps: "/apps/",
    computers: "/computers/",
    settings: "/settings/",
    workflows: "/chat/?view=workflows",
    clients: "/clients/",
    "mcp-servers": "/apps/#custom-mcp-heading",
    docs: "/docs/",
  });
  assert.equal(palettePages(true).length, PALETTE_PAGES.length);
  assert.deepEqual(palettePages(false).map((page) => page.id), ["agents", "settings"]);
});

test("before typing, Go to lists the pages with a G shortcut; a member sees both of theirs", () => {
  const listed = (admin) => palettePages(admin).filter((page) => page.browse).map((page) => page.id);
  // G T and G K (design: Today, Tasks, then Agent permissions, which the palette adds from the
  // settings pages); Settings and every other page are searched for.
  assert.deepEqual(listed(true), ["today", "tasks"]);
  assert.deepEqual(listed(false), ["agents", "settings"]);
});

test("only Today and Tasks have go-to letters, and they differ", () => {
  const letters = PALETTE_PAGES.filter((page) => page.sequence).map((page) => [page.id, page.sequence]);
  assert.deepEqual(letters, [["today", "t"], ["tasks", "k"]]);
  // A and D answer an approval in the chat: never a go-to letter.
  for (const [, letter] of letters) assert.ok(!["a", "d", "g"].includes(letter));
});

test("normalize drops case and accents", () => {
  assert.equal(normalize("Résumé ÉTÉ"), "resume ete");
});

test("a search needs every word, and a label match beats a detail match", () => {
  const plan = entry("p", "recent", "Weekly content plan", { detail: "Chat with Verde" });
  assert.equal(scoreEntry(plan, "content plan") !== null, true);
  assert.equal(scoreEntry(plan, "content zebra"), null);
  assert.equal(scoreEntry(plan, "verde") !== null, true);
  assert.ok(scoreEntry(plan, "weekly") < scoreEntry(plan, "verde"));
  // Start of the label, then start of a word, then anywhere.
  assert.ok(scoreEntry(plan, "week") < scoreEntry(plan, "cont"));
  assert.ok(scoreEntry(plan, "cont") < scoreEntry(plan, "ntent"));
  // Keywords are searched but count like the detail.
  const theme = entry("s", "goto", "Appearance", { keywords: ["theme", "dark"] });
  assert.notEqual(scoreEntry(theme, "dark"), null);
});

test("before typing, each group shows a few browsable rows in the design's group order", () => {
  const rows = [
    entry("new", "actions", "New chat"),
    entry("routine", "actions", "New routine"),
    entry("today", "goto", "Today"),
    entry("setting", "goto", "Theme", { browse: false }),
    ...Array.from({ length: 8 }, (_, i) => entry(`t${i}`, "recent", `Chat ${i}`)),
    entry("a1", "agents", "Chat with Atlas"),
    entry("w1", "waiting", "Review"),
  ];
  const shown = ids(arrangePalette(rows, "  "));
  assert.deepEqual(shown, ["w1", "t0", "t1", "a1", "today", "new", "routine"]);
});

test("the opening list stays short enough for Actions to show (design: two or three rows a group)", () => {
  const many = (group, count) => Array.from({ length: count }, (_, i) => entry(`${group}${i}`, group, `${group} ${i}`));
  const rows = ["waiting", "recent", "agents", "goto", "actions"].flatMap((group) => many(group, 10));
  const counts = {};
  for (const row of arrangePalette(rows, "")) counts[row.group] = (counts[row.group] ?? 0) + 1;
  assert.deepEqual(counts, { waiting: 3, recent: 2, agents: 2, goto: 3, actions: 3 });
  // A search still finds more than the opening list shows.
  assert.equal(arrangePalette(rows, "recent").length, 10);
});

test("a search lists the best match's group first and settings rows become findable", () => {
  const rows = [
    entry("t1", "recent", "Today's numbers"),
    entry("today", "goto", "Today"),
    entry("theme", "goto", "Appearance", { browse: false, keywords: ["theme"] }),
    entry("new", "actions", "New chat"),
  ];
  assert.deepEqual(ids(arrangePalette(rows, "today")), ["today", "t1"]);
  assert.deepEqual(ids(arrangePalette(rows, "theme")), ["theme"]);
  assert.deepEqual(ids(arrangePalette(rows, "nothing like it")), []);
  // Equal scores keep the usual group order and the given order inside a group.
  const tie = [entry("b", "goto", "Plan B"), entry("a", "recent", "Plan A"), entry("c", "recent", "Plan C")];
  assert.deepEqual(ids(arrangePalette(tie, "plan")), ["a", "c", "b"]);
});

test("Recent leaves archived conversations out and puts the newest first", () => {
  const threads = [
    { id: 1, archived_at: null, updated_at: "2026-11-01T10:00:00Z" },
    { id: 2, archived_at: "2026-11-02T00:00:00Z", updated_at: "2026-11-03T10:00:00Z" },
    { id: 3, archived_at: null, updated_at: "2026-11-05T10:00:00Z" },
  ];
  assert.deepEqual(recentThreads(threads).map((thread) => thread.id), [3, 1]);
  assert.deepEqual(recentThreads(null), []);
});

test("waiting rows open the page that moves them on and never approve by themselves", () => {
  const rows = [
    { kind: "approval", key: "approval:9", title: "Atlas wants to use searxng_web_search", detail: "Freight capacity", thread_id: 5 },
    { kind: "question", key: "question:2", title: "Which week?", detail: null, thread_id: 6 },
    { kind: "due", key: "due:3", title: "Weekly content plan", detail: null, thread_id: null, work_item_id: 3 },
    { kind: "routine", key: "routine:1", title: "Digest failed", detail: null, thread_id: 7 },
    { kind: "due", key: "due:4", title: "Nowhere to go", detail: null, thread_id: null },
  ];
  const threads = [{ id: 5, agent_id: 11 }, { id: 6, agent_id: null }];
  assert.deepEqual(waitingEntries(rows, threads), [
    { key: "approval:9", action: "review", line: "Atlas wants to use searxng_web_search", context: "Freight capacity", tool: null, agentId: 11, href: "/chat?thread=5" },
    { key: "question:2", action: "answer", line: "Which week?", context: null, tool: null, agentId: null, href: "/chat?thread=6" },
    { key: "due:3", action: "reviewTask", line: "Weekly content plan", context: null, tool: null, agentId: null, href: "/tasks/?task=3" },
  ]);
  assert.deepEqual(waitingEntries(null, null), []);
  // The answers running now name the tool an approval waits on.
  const running = [{ thread_id: 5, approvals: [{ id: "9", tool: "mcp__community__community_ab", summary: "Custom MCP Web search (search.example.com): searxng_web_search" }] }];
  assert.equal(waitingEntries(rows, threads, running)[0].tool, "searxng_web_search");
});

test("the go-to keys stay out of fields, dialogs and menus", () => {
  const at = (tagName, inside = false, editable = false) => ({ tagName, isContentEditable: editable, closest: () => (inside ? {} : null) });
  assert.equal(keysAllowedAt(null), true);
  assert.equal(keysAllowedAt(at("BODY")), true);
  assert.equal(keysAllowedAt(at("BUTTON")), true);
  assert.equal(keysAllowedAt(at("INPUT")), false);
  assert.equal(keysAllowedAt(at("TEXTAREA")), false);
  assert.equal(keysAllowedAt(at("SELECT")), false);
  assert.equal(keysAllowedAt(at("DIV", false, true)), false);
  assert.equal(keysAllowedAt(at("BUTTON", true)), false);
});

test("a plain letter is read from the key, or from the physical key on another layout", () => {
  assert.equal(pressedLetter({ key: "g", code: "KeyG" }), "g");
  assert.equal(pressedLetter({ key: "T", code: "KeyT" }), "t");
  assert.equal(pressedLetter({ key: "п", code: "KeyG" }), "g");
  assert.equal(pressedLetter({ key: "g", code: "KeyG", ctrlKey: true }), null);
  assert.equal(pressedLetter({ key: "G", code: "KeyG", shiftKey: true }), null);
  assert.equal(pressedLetter({ key: "g", code: "KeyG", repeat: true }), null);
  assert.equal(pressedLetter({ key: "g", code: "KeyG", isComposing: true }), null);
  assert.equal(pressedLetter({ key: "Enter", code: "Enter" }), null);
});

test("Ctrl/Cmd+K is read from the letter typed; the physical K counts only on a non-Latin layout", () => {
  assert.equal(isPaletteShortcut({ key: "k", code: "KeyK", ctrlKey: true }), true);
  assert.equal(isPaletteShortcut({ key: "k", code: "KeyK", metaKey: true }), true);
  assert.equal(isPaletteShortcut({ key: "K", code: "KeyK", ctrlKey: true, shiftKey: true }), true);
  // Colemak and Dvorak: K sits on another key, and that key still opens the palette.
  assert.equal(isPaletteShortcut({ key: "k", code: "KeyN", ctrlKey: true }), true);
  assert.equal(isPaletteShortcut({ key: "k", code: "KeyV", metaKey: true }), true);
  // The physical K types E on Colemak: Ctrl+E keeps its meaning (end of line on a Mac).
  assert.equal(isPaletteShortcut({ key: "e", code: "KeyK", ctrlKey: true }), false);
  // Cyrillic: the physical K types л, so the key decides.
  assert.equal(isPaletteShortcut({ key: "л", code: "KeyK", ctrlKey: true }), true);
  assert.equal(isPaletteShortcut({ key: "k", code: "KeyK" }), false);
  assert.equal(isPaletteShortcut({ key: "k", code: "KeyK", ctrlKey: true, altKey: true }), false);
});

test("a page that would ask before unloading is found without unloading it", () => {
  const page = new EventTarget();
  assert.equal(wouldAskBeforeLeaving(page), false);
  // A guard that lets the page go (AppShell after the leave dialog) does not count.
  let leaving = true;
  const guard = (event) => {
    if (leaving) return;
    event.preventDefault();
    event.returnValue = "";
  };
  page.addEventListener("beforeunload", guard);
  assert.equal(wouldAskBeforeLeaving(page), false);
  leaving = false;
  assert.equal(wouldAskBeforeLeaving(page), true);
  page.removeEventListener("beforeunload", guard);
  assert.equal(wouldAskBeforeLeaving(page), false);
});

test("G then a target letter fires it in time; anything else disarms", () => {
  const targets = new Set(["t", "k"]);
  let step = nextSequence(null, "g", 1000, targets);
  assert.deepEqual(step, { pending: 1000, fire: null });
  assert.deepEqual(nextSequence(step.pending, "t", 1000 + SEQUENCE_MS, targets), { pending: null, fire: "t" });
  assert.deepEqual(nextSequence(step.pending, "t", 1001 + SEQUENCE_MS, targets), { pending: null, fire: null });
  assert.deepEqual(nextSequence(step.pending, "x", 1200, targets), { pending: null, fire: null });
  assert.deepEqual(nextSequence(step.pending, null, 1200, targets), { pending: null, fire: null });
  // A letter alone does nothing; G again re-arms.
  assert.deepEqual(nextSequence(null, "t", 1200, targets), { pending: null, fire: null });
  assert.deepEqual(nextSequence(step.pending, "g", 1200, targets), { pending: 1200, fire: null });
  // With no targets (a member), G arms but nothing fires.
  step = nextSequence(null, "g", 1000, new Set());
  assert.deepEqual(nextSequence(step.pending, "t", 1100, new Set()), { pending: null, fire: null });
});

test("Apple platforms are told apart for the key labels", () => {
  assert.equal(isApplePlatform("MacIntel"), true);
  assert.equal(isApplePlatform("iPhone"), true);
  assert.equal(isApplePlatform("Win32"), false);
  assert.equal(isApplePlatform("Linux x86_64"), false);
});

test("C alone starts a new chat, but not as the second key after G", () => {
  assert.equal(isNewChatKey(null, "c", 5000), true);
  assert.equal(isNewChatKey(null, "x", 5000), false);
  assert.equal(isNewChatKey(null, null, 5000), false);
  // G then C: the go-to keys own it (and disarm), no new chat.
  assert.equal(isNewChatKey(4000, "c", 4000 + SEQUENCE_MS), false);
  // A G pressed long ago no longer counts.
  assert.equal(isNewChatKey(1000, "c", 1001 + SEQUENCE_MS), true);
});
