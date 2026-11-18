import assert from "node:assert/strict";
import { test } from "node:test";
import { computerBadge, gridAgents, waitingByThread, waitingRows } from "./sidebar.ts";

const rows = [
  { kind: "approval", title: "Atlas wants to use searxng_web_search", thread_id: 4 },
  { kind: "routine", title: "Digest failed", thread_id: 5 },
  { kind: "question", title: "Fleet has a question", thread_id: 6 },
  { kind: "approval", title: "Atlas wants to use fetch", thread_id: 4 },
  { kind: "question", title: "A question with no chat", thread_id: null },
];

test("approvals, questions and tasks due for review wait for the person", () => {
  assert.equal(waitingRows(rows).length, 4);
  assert.equal(waitingRows([...rows, { kind: "due", title: "Task due: Invoices", thread_id: null }]).length, 5);
  assert.equal(waitingRows([{ kind: "gmail_message", title: "Mail", thread_id: null }]).length, 0);
  assert.equal(waitingRows(null).length, 0);
});

test("each conversation shows its first waiting line", () => {
  const map = waitingByThread(rows);
  assert.equal(map.get(4), "Atlas wants to use searxng_web_search");
  assert.equal(map.get(6), "Fleet has a question");
  assert.equal(map.has(5), false);
  assert.equal(map.size, 2);
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
