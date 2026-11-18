import assert from "node:assert/strict";
import { test } from "node:test";
import {
  computerPanelOpen,
  dateDividerKeys,
  endedTurnKeys,
  enginePillText,
  engineNote,
  failedTurnCopy,
  formatToolDuration,
  isAddress,
  isChatHome,
  modelName,
  saveComputerPanel,
  toolArgument,
  toolDurationMs,
  toolResultCount,
  usageHomes,
} from "./chat-page.ts";

const t = (key, vars) => (vars ? `${key}:${JSON.stringify(vars)}` : key);

test("the model name comes from the engine's list, then its default, else nothing", () => {
  const engine = { label: "OpenRouter", default_model: "b", models: [{ id: "a", label: "Model A" }, { id: "b", label: "Model B", default: true }] };
  assert.equal(modelName(engine, "a"), "Model A");
  assert.equal(modelName(engine, "custom/x"), "custom/x");
  assert.equal(modelName(engine, null), "Model B");
  assert.equal(modelName({ label: "X", default_model: "raw-id", models: [] }, null), "raw-id");
  assert.equal(modelName({ label: "X", default_model: null, models: [] }, null), null);
  assert.equal(modelName(undefined, null), null);
});

test("the engine pill names the engine and model, or the engine alone", () => {
  assert.equal(enginePillText("Claude", "Opus"), "Claude · Opus");
  assert.equal(enginePillText("Claude", null), "Claude");
});

test("the status note says what the header text used to: version or ready, chat only, approvals", () => {
  assert.equal(engineNote(t, { label: "C", available: true, version: "2.1.3", capabilities: { tools: true } }, "Ask first"), "2.1.3 · Ask first");
  assert.equal(engineNote(t, { label: "C", available: true, version: null, capabilities: { tools: false } }, null), "header.ready · header.chatOnly");
  assert.equal(engineNote(t, { label: "C", available: false, capabilities: { tools: true } }, null), "header.unavailable");
  assert.equal(engineNote(t, undefined, null), null);
  assert.equal(engineNote(t, undefined, "Ask first"), "Ask first");
});

test("a call's main argument is its most telling input field", () => {
  assert.equal(toolArgument("mcp__community__community_ab12", { query: "freight capacity November", limit: 5 }, "Custom MCP S (h): searxng_web_search"), "freight capacity November");
  assert.equal(toolArgument("Bash", { command: "ls   -la\n" }, "ls -la"), "ls -la");
  assert.equal(toolArgument("Read", { file_path: "/a/b.txt" }, ""), "/a/b.txt");
  assert.equal(toolArgument("x", { other: "first string" }, ""), "first string");
});

test("a built-in tool without a string input falls back to its summary; an MCP one never does", () => {
  assert.equal(toolArgument("TodoWrite", { todos: [] }, "Update the to-do list"), "Update the to-do list");
  assert.equal(toolArgument("mcp__community__community_ab12", {}, "Custom MCP S (h): searxng_web_search"), null);
  assert.equal(toolArgument("Glob", {}, ""), null);
});

test("a long argument is cut to one short line", () => {
  const long = "word ".repeat(100);
  const shown = toolArgument("x", { query: long }, "");
  assert.ok(shown.length <= 160);
  assert.ok(shown.endsWith("…"));
  assert.ok(!shown.includes("\n"));
});

test("web addresses are told apart from other arguments", () => {
  assert.equal(isAddress("https://example.com/a?b=1"), true);
  assert.equal(isAddress("freight capacity"), false);
  assert.equal(isAddress("see https://example.com"), false);
});

test("the result count is read only from plain lists", () => {
  assert.equal(toolResultCount('[{"a":1},{"a":2}]'), 2);
  assert.equal(toolResultCount('{"results":[1,2,3,4,5,6],"query":"x"}'), 6);
  assert.equal(toolResultCount(JSON.stringify({ content: [{ type: "text", text: '{"items":[1,2]}' }] })), 2);
  assert.equal(toolResultCount(JSON.stringify({ content: [{ type: "text", text: "Found six pages" }] })), null);
  assert.equal(toolResultCount("total 0\nfile.txt"), null);
  assert.equal(toolResultCount('{"ok":true}'), null);
  assert.equal(toolResultCount("{broken"), null);
  assert.equal(toolResultCount(""), null);
  assert.equal(toolResultCount(null), null);
});

test("a call's duration runs from its start, or from the answer it waited for, to its end", () => {
  const tool = { state: "done", startedAt: "2026-01-01T00:00:00.000Z", endedAt: "2026-01-01T00:00:02.500Z" };
  assert.equal(toolDurationMs(tool), 2500);
  assert.equal(toolDurationMs(tool, { resolvedAt: "2026-01-01T00:00:02.000Z" }), 500);
  // An answer outside the call's time is ignored.
  assert.equal(toolDurationMs(tool, { resolvedAt: "2025-12-31T23:59:00.000Z" }), 2500);
  assert.equal(toolDurationMs({ ...tool, state: "running" }), null);
  assert.equal(toolDurationMs({ ...tool, state: "stopped" }), null);
  assert.equal(toolDurationMs({ state: "done", startedAt: tool.startedAt }), null);
  assert.equal(toolDurationMs({ state: "done", startedAt: tool.endedAt, endedAt: tool.startedAt }), null);
  assert.equal(toolDurationMs({ state: "error", startedAt: "nope", endedAt: tool.endedAt }), null);
});

test("durations read short, in the reader's language", () => {
  assert.equal(formatToolDuration(420, "en"), "0.4s");
  assert.equal(formatToolDuration(20, "en"), "0.1s");
  assert.equal(formatToolDuration(9_400, "en"), "9.4s");
  assert.equal(formatToolDuration(12_400, "en"), "12s");
  assert.equal(formatToolDuration(65_000, "en"), "1m 5s");
  assert.equal(formatToolDuration(120_000, "en"), "2m");
  assert.notEqual(formatToolDuration(420, "de"), "");
});

test("a turn's usage goes under its last written answer", () => {
  const items = [
    { kind: "user", key: "u1", turnId: 1 },
    { kind: "assistant", key: "a1", turnId: 1, text: "first" },
    { kind: "tool", key: "t1", turnId: 1 },
    { kind: "assistant", key: "a2", turnId: 1, text: "second" },
    { kind: "turn_end", key: "e1", turnId: 1 },
    { kind: "user", key: "u2", turnId: 2 },
    { kind: "assistant", key: "a3", turnId: 2, text: "" },
    { kind: "turn_end", key: "e2", turnId: 2 },
  ];
  const homes = usageHomes(items);
  assert.equal(homes.get(1), "a2");
  assert.equal(homes.has(2), false);
});

test("the computer panel is open unless it was closed for that agent", () => {
  const store = new Map();
  const storage = () => ({ getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) });
  assert.equal(computerPanelOpen(storage, 7), true);
  assert.equal(saveComputerPanel(storage, 7, false), true);
  assert.equal(computerPanelOpen(storage, 7), false);
  assert.equal(computerPanelOpen(storage, 8), true);
  saveComputerPanel(storage, 7, true);
  assert.equal(computerPanelOpen(storage, 7), true);
});

test("the computer panel stays open, and saving says so, when storage is blocked", () => {
  const blocked = () => { throw new Error("blocked"); };
  assert.equal(computerPanelOpen(blocked, 1), true);
  assert.equal(saveComputerPanel(blocked, 1, false), false);
});

test("an audio link's chip shows its host and path, shortened", async () => {
  const { linkLabel } = await import("./chat-page.ts");
  assert.equal(linkLabel(" https://example.com/ep/12.mp3?x=1 "), "example.com/ep/12.mp3");
  assert.equal(linkLabel("https://example.com/"), "example.com");
  assert.equal(linkLabel("not a url"), "not a url");
  assert.equal(linkLabel(`https://example.com/${"a".repeat(80)}`).length, 48);
});

test("a call whose approval is pending is the one that waits", async () => {
  const { awaitingCalls } = await import("./chat-page.ts");
  const items = [
    { kind: "tool", key: "t1", name: "search", state: "done" },
    { kind: "tool", key: "t2", name: "search", state: "running" },
    { kind: "tool", key: "t3", name: "read", state: "running" },
    { kind: "approval", key: "a1", tool: "search", status: "pending" },
    { kind: "approval", key: "a0", tool: "read", status: "allowed" },
  ];
  assert.deepEqual([...awaitingCalls(items)], ["t2"]);
  assert.equal(awaitingCalls([{ kind: "approval", key: "a", tool: "x", status: "pending" }]).size, 0);
});

test("the chat page with nothing open is the home: no header, no message box", () => {
  const none = { has: () => false };
  const base = { threadId: null, roomId: null, startingAgentId: null, newChatStarted: false, draft: "", params: none };
  assert.equal(isChatHome(base), true);
  assert.equal(isChatHome({ ...base, threadId: 4 }), false);
  assert.equal(isChatHome({ ...base, roomId: "new" }), false);
  assert.equal(isChatHome({ ...base, startingAgentId: 2 }), false);
  // New chat pressed, with no agent: the plain chat stays reachable.
  assert.equal(isChatHome({ ...base, newChatStarted: true }), false);
  // Unsent text (onboarding's first request, say) needs the box.
  assert.equal(isChatHome({ ...base, draft: "Plan my week" }), false);
  assert.equal(isChatHome({ ...base, draft: "   " }), true);
  // A link that starts a new chat opens it.
  assert.equal(isChatHome({ ...base, params: new URLSearchParams("engine=codex") }), false);
  assert.equal(isChatHome({ ...base, params: new URLSearchParams("onboarding=1") }), false);
  assert.equal(isChatHome({ ...base, params: new URLSearchParams("view=agents") }), true);
});

test("date dividers mark a change of day, and a conversation from today opens without one", () => {
  const now = new Date(2026, 10, 17, 15, 0);
  const at = (day, hour) => new Date(2026, 10, day, hour, 0).toISOString();
  // All today: no divider at all.
  assert.deepEqual([...dateDividerKeys([{ key: "a", ts: at(17, 9) }, { key: "b", ts: at(17, 10) }], now)], []);
  // Started yesterday: its day opens it, and today gets its own.
  assert.deepEqual(
    [...dateDividerKeys([{ key: "a", ts: at(16, 9) }, { key: "b", ts: at(16, 11) }, { key: "c", ts: at(17, 8) }], now)],
    ["a", "c"],
  );
  // Items without a time, or with a bad one, are skipped.
  assert.deepEqual([...dateDividerKeys([{ key: "x" }, { key: "y", ts: "nope" }, { key: "z", ts: at(15, 9) }], now)], ["z"]);
});

test("a failed answer says what failed, the next step it knows, and offers the Computer panel for the computer", () => {
  assert.deepEqual(failedTurnCopy("computer_unavailable"), {
    titleKey: "chatPage.end.computerTitle",
    nextKey: "chatPage.next.computer_unavailable",
    openComputerPanel: true,
  });
  assert.deepEqual(failedTurnCopy("engine_stalled"), { titleKey: "chatPage.end.failedTitle", nextKey: "chatPage.next.engine_stalled", openComputerPanel: false });
  assert.deepEqual(failedTurnCopy("something_new"), { titleKey: "chatPage.end.failedTitle", nextKey: null, openComputerPanel: false });
  assert.deepEqual(failedTurnCopy(""), { titleKey: "chatPage.end.failedTitle", nextKey: null, openComputerPanel: false });
});

test("a stopped or interrupted answer says why in translated sentences", () => {
  assert.equal(endedTurnKeys({ status: "completed", reason: "", replay: "" }), null);
  assert.equal(endedTurnKeys({ status: "failed", reason: "", replay: "" }), null);
  assert.deepEqual(endedTurnKeys({ status: "cancelled", reason: "", replay: "" }), ["chatPage.end.cancelled"]);
  assert.deepEqual(endedTurnKeys({ status: "interrupted", reason: "shutdown", replay: "before_accept" }), ["chatPage.end.appClosed", "chatPage.end.beforeAccept"]);
  assert.deepEqual(endedTurnKeys({ status: "interrupted", reason: "lease_expired", replay: "after_accept" }), ["chatPage.end.appStopped", "chatPage.end.afterAccept"]);
  assert.deepEqual(endedTurnKeys({ status: "interrupted", reason: "lease_expired", replay: "unknown" }), ["chatPage.end.appStopped", "chatPage.end.unknownAccept"]);
  assert.deepEqual(endedTurnKeys({ status: "interrupted", reason: "shutdown", replay: "" }), ["chatPage.end.appClosed", "chatPage.end.interrupted"]);
});
