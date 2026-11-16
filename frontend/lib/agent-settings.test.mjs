import assert from "node:assert/strict";
import { test } from "node:test";
import {
  anyDirty,
  approvalChoices,
  clientIdsOf,
  INSTRUCTIONS_MAX_BYTES,
  memorySwitches,
  openTab,
  sameIds,
  teamChanges,
  utf8Bytes,
  visibleTabs,
  withAgentClients,
} from "./agent-settings.ts";
import { AGENT_TABS } from "./agent-pages.ts";
import { en } from "./i18n.ts";

test("sizes are counted in UTF-8 bytes, like the backend", () => {
  assert.equal(utf8Bytes(""), 0);
  assert.equal(utf8Bytes("abc"), 3);
  assert.equal(utf8Bytes("é"), 2);
  assert.equal(utf8Bytes("日本"), 6);
  assert.equal(INSTRUCTIONS_MAX_BYTES, 24000);
});

test("client membership is read and changed for one agent only", () => {
  const clients = [
    { id: "a", name: "A", agent_ids: [1, 2] },
    { id: "b", name: "B", agent_ids: [2] },
    { id: "c", name: "C", agent_ids: [] },
  ];
  assert.deepEqual(clientIdsOf(clients, 2), ["a", "b"]);
  assert.deepEqual(clientIdsOf(clients, 9), []);
  assert.deepEqual(clientIdsOf(null, 1), []);

  const next = withAgentClients(clients, 2, ["b", "c"]);
  assert.deepEqual(next.map((c) => c.agent_ids), [[1], [2], [2]]);
  // Unchanged clients keep their object; other agents' ids stay.
  assert.equal(next[1], clients[1]);
  assert.deepEqual(clients[0].agent_ids, [1, 2]);
  assert.deepEqual(withAgentClients(clients, 1, []).map((c) => c.agent_ids), [[2], [2], []]);
});

test("id lists compare without order", () => {
  assert.ok(sameIds(["a", "b"], ["b", "a"]));
  assert.ok(!sameIds(["a"], ["a", "b"]));
  assert.ok(sameIds([], []));
});

test("team changes add the ticked, remove the unticked, skip the lead", () => {
  assert.deepEqual(teamChanges({ 2: true, 3: false, 4: true, 5: false, 1: true }, [3, 4], 1), { add: [2], remove: [3] });
  assert.deepEqual(teamChanges({}, [3], 1), { add: [], remove: [] });
});

test("only the owner may move an agent to accept edits", () => {
  const modes = [{ value: "ask" }, { value: "accept_edits" }, { value: "plan" }];
  assert.deepEqual(approvalChoices(modes, "ask", true).map((m) => m.value), ["ask", "accept_edits", "plan"]);
  assert.deepEqual(approvalChoices(modes, "ask", false).map((m) => m.value), ["ask", "plan"]);
  assert.deepEqual(approvalChoices(modes, "accept_edits", false).map((m) => m.value), ["ask", "accept_edits", "plan"]);
});

test("recall and upkeep depend on the notes switch", () => {
  assert.deepEqual(memorySwitches({}), { notes: true, recall: true, upkeep: true, dependentsDisabled: false });
  assert.deepEqual(
    memorySwitches({ memory_enabled: false, recall_enabled: true, memory_upkeep: false }),
    { notes: false, recall: true, upkeep: false, dependentsDisabled: true },
  );
});

test("any dirty tab counts", () => {
  assert.equal(anyDirty({}), false);
  assert.equal(anyDirty({ soul: false, profile: false }), false);
  assert.equal(anyDirty({ soul: false, profile: true }), true);
});

test("a member without admin sees only the tabs their device may use", () => {
  assert.deepEqual(visibleTabs(AGENT_TABS, true), [...AGENT_TABS]);
  assert.deepEqual(visibleTabs(AGENT_TABS, false), ["profile", "memory"]);
  assert.equal(openTab("soul", visibleTabs(AGENT_TABS, true)), "soul");
  assert.equal(openTab("soul", visibleTabs(AGENT_TABS, false)), "profile");
  assert.equal(openTab("memory", visibleTabs(AGENT_TABS, false)), "memory");
  assert.equal(openTab("profile", []), "profile");
});

test("every tab label the page builds exists in the English table", () => {
  for (const tab of AGENT_TABS) assert.ok(`agentSettings.tab.${tab}` in en, tab);
});
