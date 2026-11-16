import assert from "node:assert/strict";
import { test } from "node:test";
import { agentStatus, chunk, clientAgentIds, clientsCovering, engineSummary, fitColumns, splitRoster, teamStatus, waitingAgentIds } from "./roster.ts";

const agent = (id, name, extra = {}) => ({ id, name, pinned: false, archived_at: null, ...extra });

test("live agents come pinned first, then by name; archived ones apart", () => {
  const { live, archived } = splitRoster([
    agent(1, "scout"),
    agent(2, "Atlas"),
    agent(3, "Verde", { pinned: true }),
    agent(4, "Ledger", { archived_at: "2026-11-01T00:00:00Z" }),
    agent(5, "Fleet", { archived_at: "2026-11-02T00:00:00Z", pinned: true }),
  ]);
  assert.deepEqual(live.map((a) => a.id), [3, 2, 1]);
  assert.deepEqual(archived.map((a) => a.id), [5, 4]);
  assert.deepEqual(splitRoster(null), { live: [], archived: [] });
});

test("team states map onto the status language", () => {
  assert.equal(teamStatus("working"), "running");
  assert.equal(teamStatus("waiting_on_you"), "waiting");
  assert.equal(teamStatus("idle"), "idle");
  assert.equal(teamStatus("something_new"), null);
  assert.equal(teamStatus(undefined), null);
});

test("waiting comes from approvals and questions in the agent's own threads", () => {
  const threads = [{ id: 10, agent_id: 1 }, { id: 11, agent_id: 2 }, { id: 12, agent_id: null }];
  const attention = [
    { kind: "approval", title: "Atlas wants to use a tool", thread_id: 10 },
    { kind: "signed_out", title: "Claude is signed out", thread_id: 11 },
    { kind: "question", title: "Scout asks", thread_id: 99 },
    { kind: "question", title: "Plain chat asks", thread_id: 12 },
  ];
  assert.deepEqual([...waitingAgentIds(attention, threads)], [1]);
  assert.equal(waitingAgentIds(null, threads).size, 0);
});

test("a card claims a status only when something reports it", () => {
  const team = [{ id: 1, state: "working" }, { id: 2, state: "idle" }];
  assert.equal(agentStatus(1, team, new Set()), "running");
  assert.equal(agentStatus(2, team, new Set()), "idle");
  assert.equal(agentStatus(2, team, new Set([2])), "waiting");
  assert.equal(agentStatus(1, team, new Set([1])), "waiting");
  // Not on the team and nothing waiting: no pill, never a made-up "Idle".
  assert.equal(agentStatus(3, team, new Set()), null);
  assert.equal(agentStatus(3, null, new Set([3])), "waiting");
});

test("the engine line names the engine and the model really used", () => {
  const engines = [
    { id: "claude", label: "Claude", available: true, reason: null, default_model: null, models: [{ id: "opus", label: "Opus", default: false }, { id: "sonnet", label: "Sonnet", default: true }] },
    { id: "codex", label: "Codex", available: false, reason: "Not signed in", default_model: "gpt-5", models: [] },
  ];
  assert.deepEqual(engineSummary({ provider: "claude", model: "opus" }, engines), { engine: "Claude", model: "Opus", available: true, reason: null });
  assert.equal(engineSummary({ provider: "claude", model: null }, engines).model, "Sonnet");
  assert.equal(engineSummary({ provider: "claude", model: "my-custom" }, engines).model, "my-custom");
  assert.deepEqual(engineSummary({ provider: "codex", model: null }, engines), { engine: "Codex", model: "gpt-5", available: false, reason: "Not signed in" });
  // Engines not loaded: the stored id, and no "default" placeholder for a null model.
  assert.deepEqual(engineSummary({ provider: "claude", model: null }, null), { engine: "claude", model: null, available: null, reason: null });
  assert.equal(engineSummary({ provider: "claude", model: "opus" }, null).model, "opus");
});

test("client filter and the clients count use real assignments", () => {
  const clients = [{ id: "lh", agent_ids: [1, 2] }, { id: "pf", agent_ids: [3] }, { id: "empty", agent_ids: [] }];
  assert.equal(clientAgentIds(clients, ""), null);
  assert.deepEqual([...clientAgentIds(clients, "lh")], [1, 2]);
  assert.equal(clientAgentIds(clients, "gone"), null);
  assert.equal(clientsCovering(clients, new Set([1, 3])), 2);
  assert.equal(clientsCovering(clients, new Set([9])), 0);
  assert.equal(clientsCovering(null, new Set([1])), 0);
});

test("the team chart fits what the width allows, in rows", () => {
  assert.equal(fitColumns(0, 5, 160, 12), 5);
  assert.equal(fitColumns(1000, 5, 160, 12), 5);
  assert.equal(fitColumns(500, 5, 160, 12), 2);
  assert.equal(fitColumns(100, 5, 160, 12), 1);
  assert.equal(fitColumns(1000, 0, 160, 12), 1);
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(chunk([1, 2], 0), [[1], [2]]);
  assert.deepEqual(chunk([], 3), []);
});
