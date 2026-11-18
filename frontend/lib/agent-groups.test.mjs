import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  activityCounts,
  canMessageAll,
  cleanGroupName,
  decodeDrag,
  encodeDrag,
  freeRoomName,
  groupActivity,
  groupChoices,
  groupOf,
  groupThreads,
  pinnedTiles,
  planGroupWith,
  planRemove,
  roomForGroup,
} from "./agent-groups.ts";
import { agentGroups, runGroupOps } from "./agent-groups-api.ts";
import { agentActivities } from "./sidebar.ts";

const agent = (id, name, pinned = false) => ({ id, name, pinned, archived_at: null });
const group = (id, name, agent_ids, extra = {}) => ({ id, name, pinned: true, position: id, created_at: "2026-11-01T00:00:00Z", agent_ids, ...extra });
const kinds = (tiles) => tiles.map((tile) => (tile.kind === "agent" ? `a${tile.agent.id}` : `g${tile.group.id}`));

test("the grid shows pinned agents first, then pinned groups by position, and hides grouped agents", () => {
  const listed = [agent(1, "Atlas", true), agent(2, "Verde", true), agent(3, "Fleet"), agent(4, "Ledger")];
  const groups = [group(9, "Clients", [2, 3, 4], { position: 2 }), group(8, "LH Tech", [], { position: 1 })];
  const grid = pinnedTiles(listed, groups);
  assert.equal(grid.pinned, true);
  // Verde is in the Clients stack; the empty LH Tech group has nothing to show.
  assert.deepEqual(kinds(grid.tiles), ["a1", "g9"]);
  assert.deepEqual(grid.tiles[1].members.map((a) => a.id), [2, 3, 4]);
});

test("an unpinned group's pinned members show on their own, and archived members drop out", () => {
  const listed = [agent(1, "Atlas", true), agent(2, "Verde", true)];
  assert.deepEqual(kinds(pinnedTiles(listed, [group(5, "Hidden", [1, 2], { pinned: false })]).tiles), ["a1", "a2"]);
  // Agent 7 is not in the (live) list, so the stack shows only Verde.
  const grid = pinnedTiles(listed, [group(5, "G", [2, 7])]);
  assert.deepEqual(grid.tiles[1].members.map((a) => a.id), [2]);
});

test("with nothing pinned the grid shows the first agents, at most the limit", () => {
  const listed = [1, 2, 3, 4, 5, 6, 7, 8].map((id) => agent(id, `A${id}`));
  const grid = pinnedTiles(listed, []);
  assert.equal(grid.pinned, false);
  assert.equal(grid.tiles.length, 6);
  assert.deepEqual(kinds(pinnedTiles(listed, null, 2).tiles), ["a1", "a2"]);
  // A pinned group counts as something pinned.
  assert.equal(pinnedTiles(listed, [group(1, "G", [3])]).pinned, true);
});

test("a stack's dot is the most urgent status inside: waiting beats working", () => {
  assert.equal(groupActivity(["working", null, "waiting"]), "waiting");
  assert.equal(groupActivity([null, "working"]), "working");
  assert.equal(groupActivity([null, null]), null);
  assert.equal(groupActivity([]), null);
  assert.deepEqual(activityCounts(["working", "waiting", "waiting", null]), { waiting: 2, working: 1 });
});

test("dropping an agent on another agent in no group makes a new group of the two", () => {
  assert.deepEqual(planGroupWith([], 1, { kind: "agent", id: 2 }), [{ op: "create", agentIds: [2, 1] }]);
  assert.deepEqual(planGroupWith([], 1, { kind: "agent", id: 1 }), []);
});

test("dropping on a grouped agent, a stack or a tray joins that group", () => {
  const groups = [group(5, "Clients", [2, 3])];
  assert.deepEqual(planGroupWith(groups, 1, { kind: "agent", id: 3 }), [{ op: "members", groupId: 5, agentIds: [2, 3, 1] }]);
  assert.deepEqual(planGroupWith(groups, 1, { kind: "group", id: 5 }), [{ op: "members", groupId: 5, agentIds: [2, 3, 1] }]);
  // Already in it, or a group that is gone: nothing to do.
  assert.deepEqual(planGroupWith(groups, 2, { kind: "group", id: 5 }), []);
  assert.deepEqual(planGroupWith(groups, 2, { kind: "agent", id: 3 }), []);
  assert.deepEqual(planGroupWith(groups, 1, { kind: "group", id: 99 }), []);
});

test("moving the last agent out of a group ends that group", () => {
  const groups = [group(5, "Solo", [1]), group(6, "Pair", [2, 3])];
  assert.deepEqual(planGroupWith(groups, 1, { kind: "group", id: 6 }), [
    { op: "members", groupId: 6, agentIds: [2, 3, 1] },
    { op: "delete", groupId: 5 },
  ]);
  assert.deepEqual(planGroupWith(groups, 2, { kind: "agent", id: 4 }), [{ op: "create", agentIds: [4, 2] }]);
  assert.deepEqual(planGroupWith(groups, 1, { kind: "agent", id: 4 }), [{ op: "create", agentIds: [4, 1] }, { op: "delete", groupId: 5 }]);
});

test("removing an agent keeps the others; the last one out ends the group", () => {
  const groups = [group(5, "Pair", [1, 2]), group(6, "Solo", [3])];
  assert.deepEqual(planRemove(groups, 1), [{ op: "members", groupId: 5, agentIds: [2] }]);
  assert.deepEqual(planRemove(groups, 3), [{ op: "delete", groupId: 6 }]);
  assert.deepEqual(planRemove(groups, 4), []);
  assert.equal(groupOf(groups, 2)?.id, 5);
  assert.equal(groupOf(null, 2), null);
});

test("Group with… offers the other groups and the agents in no group", () => {
  const listed = [agent(1, "A"), agent(2, "B"), agent(3, "C"), agent(4, "D")];
  const groups = [group(5, "First", [1, 2]), group(6, "Second", [3]), group(7, "Empty", [])];
  const choices = groupChoices(listed, groups, 1);
  assert.deepEqual(choices.groups.map((g) => g.id), [6]);
  assert.deepEqual(choices.agents.map((a) => a.id), [4]);
  assert.deepEqual(groupChoices(listed, groups, 4).groups.map((g) => g.id), [5, 6]);
  assert.deepEqual(groupChoices(listed, groups, 4).agents.map((a) => a.id), []);
});

test("Recent in a group lists only its agents' conversations", () => {
  const threads = [{ id: 1, agent_id: 1 }, { id: 2, agent_id: 2 }, { id: 3, agent_id: null }, { id: 4 }];
  assert.deepEqual(groupThreads(threads, group(5, "G", [2])).map((t) => t.id), [2]);
  assert.deepEqual(groupThreads(threads, null).map((t) => t.id), [1, 2, 3, 4]);
});

test("Message all reuses the room with exactly the group's agents, else names a new one", () => {
  const rooms = [
    { id: 1, name: "Clients", members: [{ agent_id: 1 }, { agent_id: 2 }, { agent_id: 3 }] },
    { id: 2, name: "Pair", members: [{ agent_id: 2 }, { agent_id: 1 }] },
    { id: 3, name: "Pair again", members: [{ agent_id: 1 }, { agent_id: 2 }] },
  ];
  assert.equal(roomForGroup(rooms, [1, 2])?.id, 3);
  assert.equal(roomForGroup(rooms, [1, 2, 3])?.id, 1);
  assert.equal(roomForGroup(rooms, [1, 3]), null);
  assert.equal(freeRoomName(rooms, "Clients"), "Clients 2");
  assert.equal(freeRoomName([...rooms, { id: 4, name: "Clients 2", members: [] }], "Clients"), "Clients 3");
  assert.equal(freeRoomName(rooms, " Fresh "), "Fresh");
  assert.equal(freeRoomName([{ id: 1, name: "x".repeat(80), members: [] }], "x".repeat(80)).length, 80);
  assert.equal(canMessageAll([1, 2]), true);
  assert.equal(canMessageAll([1]), false);
  assert.equal(canMessageAll(Array.from({ length: 13 }, (_, i) => i)), false);
});

test("a drag carries the agent and the tray it left; anything else is ignored", () => {
  assert.deepEqual(decodeDrag(encodeDrag({ agentId: 4, from: 9 })), { agentId: 4, from: 9 });
  assert.deepEqual(decodeDrag(encodeDrag({ agentId: 4, from: null })), { agentId: 4, from: null });
  assert.equal(decodeDrag("text"), null);
  assert.equal(decodeDrag(JSON.stringify({ agentId: "4" })), null);
  assert.equal(decodeDrag(""), null);
});

test("group names are one line of 1 to 80 characters", () => {
  assert.equal(cleanGroupName("  Clients "), "Clients");
  assert.equal(cleanGroupName("   "), null);
  assert.equal(cleanGroupName("a\nb"), null);
  assert.equal(cleanGroupName("x".repeat(81)), null);
});

test("avatar dots come from the open conversation and the conversations that wait on you", () => {
  const threads = [{ id: 10, agent_id: 1 }, { id: 11, agent_id: 2 }, { id: 12, agent_id: null }];
  const map = agentActivities({ live: { agentId: 3, working: true, waiting: false }, threads, waitingThreadIds: [11, 12, 99] });
  assert.deepEqual([...map.entries()].sort(), [[2, "waiting"], [3, "working"]]);
  // A waiting conversation of the open agent outranks its live "working".
  const both = agentActivities({ live: { agentId: 2, working: true, waiting: false }, threads, waitingThreadIds: [11] });
  assert.equal(both.get(2), "waiting");
  assert.equal(agentActivities({ live: { agentId: 1, working: false, waiting: true }, threads: null, waitingThreadIds: [] }).get(1), "waiting");
  assert.equal(agentActivities({ live: { agentId: null, working: true, waiting: false }, threads, waitingThreadIds: [] }).size, 0);
});

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

function respond(body = {}) {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), method: options?.method ?? "GET", body: options?.body ? JSON.parse(options.body) : undefined });
    const status = options?.method === "DELETE" ? 204 : 200;
    return new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  };
  return calls;
}

test("the group calls use the /agent-groups routes", async () => {
  const calls = respond([]);
  await agentGroups.list();
  await agentGroups.create("Clients", [1, 2]);
  await agentGroups.update(5, { name: "Customers" });
  await agentGroups.setMembers(5, [2]);
  await agentGroups.remove(5);
  assert.deepEqual(calls.map((c) => [c.method, c.url.replace(/^.*\/api\/v1/, "")]), [
    ["GET", "/agent-groups"],
    ["POST", "/agent-groups"],
    ["PATCH", "/agent-groups/5"],
    ["PUT", "/agent-groups/5/members"],
    ["DELETE", "/agent-groups/5"],
  ]);
  assert.deepEqual(calls[1].body, { name: "Clients", agent_ids: [1, 2] });
  assert.deepEqual(calls[3].body, { agent_ids: [2] });
});

test("a plan runs in order and hands back the group it made", async () => {
  const calls = respond({ id: 12, name: "New group", pinned: true, position: 0, created_at: "", agent_ids: [4, 1] });
  const made = await runGroupOps([{ op: "create", agentIds: [4, 1] }, { op: "delete", groupId: 5 }], "New group");
  assert.equal(made?.id, 12);
  assert.deepEqual(calls.map((c) => c.method), ["POST", "DELETE"]);
  assert.deepEqual(calls[0].body, { name: "New group", agent_ids: [4, 1] });
  assert.equal(await runGroupOps([], "x"), null);
});
