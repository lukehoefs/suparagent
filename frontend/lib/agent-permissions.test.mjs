import assert from "node:assert/strict";
import { test } from "node:test";
import { cellKey, diff, overSkillLimit, summary, toggleAll, toolGrantsByPair } from "./agent-permissions.ts";

const k = (kind, group, item, agentId) => cellKey({ kind, group, item, agentId });

test("diff lists grants and removals, sorted by agent then kind", () => {
  const saved = new Set([k("tool", "c1", "search", 1), k("skill", "lib", "icp-builder", 2)]);
  const desired = new Set([k("tool", "c1", "search", 1), k("tool", "c1", "read", 2), k("skill", "lib", "cold-email-writer", 1)]);
  const changes = diff(saved, desired);
  assert.deepEqual(changes.map((c) => [c.agentId, c.kind, c.item, c.grant]), [
    [1, "skill", "cold-email-writer", true],
    [2, "skill", "icp-builder", false],
    [2, "tool", "read", true],
  ]);
  assert.equal(summary(changes), "3 changes · 2 agents");
});

test("tool grants are rebuilt as full lists per connection and agent, including emptied pairs", () => {
  const desired = new Set([k("tool", "c1", "b", 1), k("tool", "c1", "a", 1), k("skill", "lib", "x", 1)]);
  const lists = toolGrantsByPair(desired, [["c1", 1], ["c1", 2]]);
  assert.deepEqual(lists.get("c1|1"), ["a", "b"]);
  assert.deepEqual(lists.get("c1|2"), []);
});

test("skill limit counts library picks plus the agent's other skills", () => {
  const desired = new Set(Array.from({ length: 5 }, (_, i) => k("skill", "lib", `s${i}`, 7)));
  assert.deepEqual(overSkillLimit(desired, new Map([[7, 25]])), []);
  assert.deepEqual(overSkillLimit(desired, new Map([[7, 26]])), [7]);
});

test("toggleAll turns a group on when any cell is off, and off when all are on", () => {
  const keys = [k("tool", "c1", "a", 1), k("tool", "c1", "a", 2)];
  const on = toggleAll(new Set([keys[0]]), keys);
  assert.ok(keys.every((key) => on.has(key)));
  const off = toggleAll(on, keys);
  assert.ok(keys.every((key) => !off.has(key)));
});
