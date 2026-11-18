import assert from "node:assert/strict";
import { test } from "node:test";
import { computerBadge, gridAgents, waitingByThread, waitingRows, waitingTool, workingThreadIds } from "./sidebar.ts";

const rows = [
  { kind: "approval", title: "Atlas wants to use searxng_web_search", thread_id: 4 },
  { kind: "routine", title: "Digest failed", thread_id: 5 },
  { kind: "question", title: "Fleet has a question", thread_id: 6 },
  { kind: "approval", title: "Atlas wants to use fetch", thread_id: 4 },
  { kind: "question", title: "A question with no chat", thread_id: null },
];

test("approvals and questions wait for the person; tasks due are Today's own card", () => {
  assert.equal(waitingRows(rows).length, 4);
  assert.equal(waitingRows([...rows, { kind: "due", title: "Task due: Invoices", thread_id: null }]).length, 4);
  assert.equal(waitingByThread([{ kind: "due", title: "Task due: Invoices", thread_id: 7 }]).has(7), false);
  assert.equal(waitingRows([{ kind: "gmail_message", title: "Mail", thread_id: null }]).length, 0);
  assert.equal(waitingRows(null).length, 0);
});

test("each conversation shows its first waiting line", () => {
  const map = waitingByThread(rows);
  assert.deepEqual(map.get(4), { title: "Atlas wants to use searxng_web_search", tool: null });
  assert.deepEqual(map.get(6), { title: "Fleet has a question", tool: null });
  assert.equal(map.has(5), false);
  assert.equal(map.size, 2);
});

// An approval's title is the call's summary; an MCP tool's summary names the server's tool last.
const mcpSummary = "Custom MCP Web search (search.example.com): searxng_web_search";
const running = [
  { thread_id: 4, approvals: [{ id: "a1", tool: "mcp__community__community_9f2", summary: mcpSummary }] },
  { thread_id: 8, approvals: [{ id: "b2", tool: "Bash", summary: "ls -la: see the files" }] },
  { thread_id: 9, approvals: [] },
];

test("an approval names its tool from the row, else from the running answers", () => {
  const approval = (key, extra = {}) => ({ kind: "approval", key, title: mcpSummary, thread_id: 4, ...extra });
  // A newer server sends the tool with the row.
  assert.equal(waitingTool(approval("approval:zz", { tool: "mcp__community__community_9f2" }), null), "searxng_web_search");
  assert.equal(waitingTool(approval("approval:zz", { tool: "WebFetch" }), null), "WebFetch");
  // Otherwise the call with the same id among the answers running now.
  assert.equal(waitingTool(approval("approval:a1"), running), "searxng_web_search");
  // A Bash summary is the command: the tool is Bash, never a word read out of the command.
  assert.equal(waitingTool({ kind: "approval", key: "approval:b2", title: "ls -la: see the files", thread_id: 8 }, running), "Bash");
  // Not known: the row keeps its own title.
  assert.equal(waitingTool(approval("approval:gone"), running), null);
  assert.equal(waitingTool(approval("approval:a1"), null), null);
  assert.equal(waitingTool({ kind: "question", key: "question:1", title: "Which week?", thread_id: 4 }, running), null);
  const map = waitingByThread([{ kind: "approval", key: "approval:a1", title: mcpSummary, thread_id: 4 }], running);
  assert.deepEqual(map.get(4), { title: mcpSummary, tool: "searxng_web_search" });
  // While the running answers are known, the calls come from them, as Today counts them: one asked
  // after the rows were read shows, and one answered since (thread 3 below) does not.
  assert.deepEqual(map.get(8), { title: "ls -la: see the files", tool: "Bash" });
  assert.equal(map.has(9), false);
  assert.deepEqual(waitingByThread(null, running).get(4), { title: mcpSummary, tool: "searxng_web_search" });
  const answered = waitingByThread([{ kind: "approval", key: "approval:old", title: "Run ls", thread_id: 3 }, { kind: "question", title: "Which week?", thread_id: 6 }], running);
  assert.equal(answered.has(3), false);
  assert.deepEqual(answered.get(6), { title: "Which week?", tool: null });
  // Without them, the rows' own calls are the lines.
  assert.deepEqual(waitingByThread([{ kind: "approval", key: "approval:old", title: "Run ls", thread_id: 3 }], null).get(3), { title: "Run ls", tool: null });
});

test("only answers that wait for nothing count as working", () => {
  assert.deepEqual([...workingThreadIds(running)], [9]);
  assert.equal(workingThreadIds(null).size, 0);
});

test("the grid shows pinned agents, or the first agents when none is pinned", () => {
  const a = (id, pinned = false) => ({ id, name: `A${id}`, pinned, archived_at: null });
  assert.deepEqual(gridAgents([a(1), a(2, true), a(3, true)]).agents.map((x) => x.id), [2, 3]);
  assert.equal(gridAgents([a(1), a(2)]).pinned, false);
  assert.equal(gridAgents([1, 2, 3, 4, 5, 6, 7, 8].map((id) => a(id))).agents.length, 6);
});

test("computer badge", () => {
  assert.equal(computerBadge("running"), "on");
  assert.equal(computerBadge("stopped"), "off");
  assert.equal(computerBadge("error"), "off");
  assert.equal(computerBadge("missing"), null);
  assert.equal(computerBadge(undefined), null);
});
