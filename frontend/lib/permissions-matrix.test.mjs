import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MAX_AGENT_SKILLS, SKILLS_GROUP, agentsInClient, agentsWithAny, appWithoutAccount, appsSource, cellChanged, cellFailed, changeKey,
  changeTally, changesStillShown, columnKeys, connectionOf, diff, grantKey, isEditable, itemChangeKey, itemChanged, keysState, overSkillLimit,
  pairKey, parseGrantKey, planSave, raiseEntries, raisesConfirmed, raisesToWrite, reapply, rowKeys, runSave, serverGroup, setAppAccount, setAppLevel, skillCount,
  skillSources, sourceCount, sourceKeys, toggleKeys, toolSources, visibleSources,
} from "./permissions-matrix.ts";

const state = (grants = [], apps = []) => ({ grants: new Set(grants), apps: new Map(apps) });
const S1 = serverGroup("c1");
const tools = [
  { name: "gmail_send", description: "Send an email" },
  { name: "gmail_search", description: "Search mail" },
  { name: "sheets_read", description: "Read a sheet" },
];
const noLocks = new Map();

test("keys round-trip and never collide on pipes in names", () => {
  const key = grantKey("server:a|b", "tool|x", 7);
  assert.deepEqual(parseGrantKey(key), { group: "server:a|b", item: "tool|x", agentId: 7 });
  assert.notEqual(grantKey("a", "b|c", 1), grantKey("a|b", "c", 1));
  assert.deepEqual(connectionOf("server:abc"), { kind: "server", id: "abc" });
  assert.deepEqual(connectionOf("plugin:p1"), { kind: "plugin", id: "p1" });
  assert.equal(connectionOf(SKILLS_GROUP), null);
});

test("a server splits into one column per app, and stays one column when its tools are one app", () => {
  const split = toolSources("server", { id: "c1", name: "Activepieces" }, tools);
  assert.deepEqual(split.map((s) => [s.id, s.sub, s.items.map((i) => i.id)]), [
    [`${S1}#Gmail`, "Gmail", ["gmail_send", "gmail_search"]],
    [`${S1}#Google Sheets`, "Google Sheets", ["sheets_read"]],
  ]);
  assert.ok(split.every((s) => s.group === S1 && s.type === "tool" && s.readOnly === null));
  const one = toolSources("plugin", { id: "p1", name: "Search" }, [{ name: "lookup", description: "" }], "server_off");
  assert.equal(one.length, 1);
  assert.equal(one[0].id, "plugin:p1");
  assert.equal(one[0].sub, null);
  assert.equal(one[0].readOnly, "server_off");
});

test("skills split by category in library order; the apps column marks apps that can change things", () => {
  const lib = [
    { name: "b", category: "Writing", description: "" },
    { name: "a", category: "Sales", description: "" },
  ];
  assert.deepEqual(skillSources(lib, ["Sales", "Design", "Writing"]).map((s) => [s.id, s.items.map((i) => i.id)]), [
    ["skills#Sales", ["a"]],
    ["skills#Writing", ["b"]],
  ]);
  const apps = appsSource([{ slug: "github", label: "GitHub", read: "r", write: "w" }, { slug: "x", label: "X", read: "r", write: null }]);
  assert.equal(apps.actsForYou, true);
  assert.deepEqual(apps.items.map((i) => [i.id, i.canWrite]), [["github", true], ["x", false]]);
  assert.equal(appsSource([]), null);
});

test("collapsed cells count what is on and notice changes, for tools and for apps", () => {
  const [gmail] = toolSources("server", { id: "c1", name: "AP" }, tools);
  const saved = state([grantKey(S1, "gmail_send", 1)]);
  const desired = state([grantKey(S1, "gmail_send", 1), grantKey(S1, "gmail_search", 1)]);
  assert.deepEqual(sourceCount(gmail, 1, desired), { on: 2, total: 2 });
  assert.equal(cellChanged(gmail, 1, saved, desired), true);
  assert.equal(cellChanged(gmail, 2, saved, desired), false);
  assert.equal(agentsWithAny(gmail, [1, 2], desired), 1);

  const apps = appsSource([{ slug: "gmail", label: "Gmail", read: "", write: "w" }, { slug: "github", label: "GitHub", read: "", write: "w" }]);
  const before = state([], [[1, { scopes: { gmail: "read" }, accounts: { gmail: ["acc1"] } }]]);
  assert.deepEqual(sourceCount(apps, 1, before), { on: 1, total: 2 });
  // Turning an app off and on again with the same accounts is no change.
  const offOn = { ...before, apps: setAppLevel(setAppLevel(before.apps, 1, "gmail", "off"), 1, "gmail", "read") };
  assert.equal(itemChanged(apps, "gmail", 1, before, offOn), false);
  const another = { ...before, apps: setAppAccount(before.apps, 1, "gmail", "acc2", true) };
  assert.equal(itemChanged(apps, "gmail", 1, before, another), true);
});

test("toggles turn a set on when any is off and off when all are on, and report mixed", () => {
  const keys = [grantKey(S1, "a", 1), grantKey(S1, "a", 2)];
  const on = toggleKeys(new Set([keys[0]]), keys);
  assert.ok(keys.every((k) => on.has(k)));
  assert.equal(keysState(on, keys), "on");
  assert.equal(keysState(toggleKeys(on, keys), keys), "off");
  assert.equal(keysState(new Set([keys[1]]), keys), "mixed");
});

test("row and column toggles skip read-only sources, locked agents and connected apps", () => {
  const [gmail, sheets] = toolSources("server", { id: "c1", name: "AP" }, tools);
  const off = { ...sheets, readOnly: "server_off" };
  const apps = appsSource([{ slug: "gmail", label: "Gmail", read: "", write: null }]);
  const locks = new Map([[pairKey(S1, 2), "load_failed"]]);
  assert.deepEqual(rowKeys([gmail, off, apps], 1, locks), [grantKey(S1, "gmail_send", 1), grantKey(S1, "gmail_search", 1)]);
  assert.deepEqual(rowKeys([gmail], 2, locks), []);
  assert.deepEqual(columnKeys(gmail, "gmail_send", [1, 2, 3], locks), [grantKey(S1, "gmail_send", 1), grantKey(S1, "gmail_send", 3)]);
  assert.deepEqual(columnKeys(apps, "gmail", [1], noLocks), []);
  assert.deepEqual(sourceKeys(gmail, 1, noLocks), rowKeys([gmail], 1, noLocks));
  assert.equal(isEditable(gmail, 2, locks), false);
  assert.equal(isEditable(off, 1, noLocks), false);
});

test("diff lists grants, removals and app changes sorted by agent; tally counts agents", () => {
  const saved = state(
    [grantKey(S1, "gmail_send", 1), grantKey(SKILLS_GROUP, "icp", 2)],
    [[2, { scopes: { gmail: "read" }, accounts: { gmail: ["a1"] } }]],
  );
  const desired = state(
    [grantKey(S1, "gmail_send", 1), grantKey(S1, "gmail_search", 2), grantKey(SKILLS_GROUP, "cold", 1)],
    [[2, { scopes: { gmail: "write" }, accounts: { gmail: ["a1"] } }]],
  );
  const changes = diff(saved, desired);
  assert.deepEqual(changes.map((c) => (c.kind === "grant" ? [c.agentId, c.group, c.item, c.grant] : [c.agentId, c.app, c.from, c.to])), [
    [1, SKILLS_GROUP, "cold", true],
    [2, "gmail", "read", "write"],
    [2, S1, "gmail_search", true],
    [2, SKILLS_GROUP, "icp", false],
  ]);
  assert.deepEqual(changeTally(changes), { changes: 4, agents: 2 });
  assert.equal(raisesToWrite(changes).length, 1);
  assert.equal(new Set(changes.map(changeKey)).size, 4);
});

test("a new account on an app already at read and change is a raise; removing one is not", () => {
  const at = (accounts) => [[1, { scopes: { gmail: "write" }, accounts: { gmail: accounts } }]];
  // write [a1] -> write [a1, a2]: the agent can now act in a2.
  assert.equal(raisesToWrite(diff(state([], at(["a1"])), state([], at(["a1", "a2"])))).length, 1);
  // write with no account (gives nothing) -> write [a1].
  assert.equal(raisesToWrite(diff(state([], at([])), state([], at(["a1"])))).length, 1);
  // write [a1, a2] -> write [a1]: less access, nothing to confirm.
  assert.equal(raisesToWrite(diff(state([], at(["a1", "a2"])), state([], at(["a1"])))).length, 0);
  // write -> read is not a raise either.
  const read = [[1, { scopes: { gmail: "read" }, accounts: { gmail: ["a1", "a2"] } }]];
  assert.equal(raisesToWrite(diff(state([], at(["a1"])), state([], read))).length, 0);
});

test("a confirmation covers only the raises it was given for", () => {
  const raise = (agentId, app, accounts) => [agentId, { scopes: { [app]: "write" }, accounts: { [app]: accounts } }];
  const raises = (apps) => raisesToWrite(diff(state(), state([], apps)));
  const atlas = raise(1, "gmail", ["a1"]);
  const verde = raise(2, "github", ["g1"]);
  const ticked = raiseEntries(raises([atlas]));
  assert.equal(raisesConfirmed(ticked, raises([atlas])), true);
  // No tick, no confirmation.
  assert.equal(raisesConfirmed(null, raises([atlas])), false);
  // Another agent's raise added after the tick is not covered.
  assert.equal(raisesConfirmed(ticked, raises([atlas, verde])), false);
  // Nor a different raise in place of the first, nor a new account on the same one.
  assert.equal(raisesConfirmed(ticked, raises([verde])), false);
  assert.equal(raisesConfirmed(ticked, raises([raise(1, "gmail", ["a1", "a2"])])), false);
  // A raise that saved drops out; the rest stays covered. The order changes come in does not matter.
  const both = raiseEntries(raises([verde, atlas]));
  assert.deepEqual(both, raiseEntries(raises([atlas, verde])));
  assert.equal(raisesConfirmed(both, raises([verde])), true);
});

test("an app switched on with no account is flagged, one switched off is not", () => {
  const changes = diff(state(), state([], [[1, { scopes: { gmail: "read" }, accounts: {} }]]));
  assert.equal(appWithoutAccount(changes[0]), true);
  const offed = diff(state([], [[1, { scopes: { gmail: "read" }, accounts: {} }]]), state([], [[1, { scopes: {}, accounts: {} }]]));
  assert.equal(appWithoutAccount(offed[0]), false);
});

test("the skill limit counts library picks plus the agent's other skills", () => {
  const grants = new Set(Array.from({ length: 5 }, (_, i) => grantKey(SKILLS_GROUP, `s${i}`, 7)));
  assert.equal(skillCount(grants, new Map([[7, 25]]), 7), 30);
  assert.deepEqual(overSkillLimit(grants, new Map([[7, 25]]), [7]), []);
  assert.deepEqual(overSkillLimit(grants, new Map([[7, 26]]), [7, 8]), [7]);
  assert.equal(MAX_AGENT_SKILLS, 30);
});

test("filters: type, unticked sources, and a search over items or the source name", () => {
  const sources = [...toolSources("server", { id: "c1", name: "Activepieces" }, tools), ...skillSources([{ name: "cold-email", category: "Outreach", description: "Write a cold email" }], ["Outreach"])];
  const all = new Set(["tool", "skill"]);
  const shown = (filters) => visibleSources(sources, { query: "", types: all, hidden: new Set(), ...filters }).map((s) => [s.id, s.items.length]);
  assert.equal(shown({}).length, 3);
  assert.deepEqual(shown({ types: new Set(["skill"]) }), [["skills#Outreach", 1]]);
  assert.deepEqual(shown({ hidden: new Set([`${S1}#Gmail`]) }).map(([id]) => id), [`${S1}#Google Sheets`, "skills#Outreach"]);
  // "gmail" matches the source name, so every Gmail tool stays; "email" matches descriptions.
  assert.deepEqual(shown({ query: "Gmail" }), [[`${S1}#Gmail`, 2]]);
  assert.deepEqual(shown({ query: "email" }), [[`${S1}#Gmail`, 1], ["skills#Outreach", 1]]);
  assert.deepEqual(shown({ query: "nothing like it" }), []);
  // A translated label is searched too.
  assert.deepEqual(visibleSources(sources, { query: "akquise", types: all, hidden: new Set() }, (s) => (s.sub === "Outreach" ? "Akquise" : "")).map((s) => s.id), ["skills#Outreach"]);
});

test("a client filter keeps the client's agents; no client or an unknown one keeps everyone", () => {
  const agents = [{ id: 1 }, { id: 2 }, { id: 3 }];
  const clients = [{ id: "pfnz", agent_ids: [2, 3] }];
  assert.deepEqual(agentsInClient(agents, clients, "pfnz").map((a) => a.id), [2, 3]);
  assert.deepEqual(agentsInClient(agents, clients, null).map((a) => a.id), [1, 2, 3]);
  assert.deepEqual(agentsInClient(agents, clients, "gone").map((a) => a.id), [1, 2, 3]);
});

test("the save plan removes skills first, sends full tool lists per pair and one app update per agent", () => {
  const P = "plugin:p1";
  const saved = state([grantKey(S1, "a", 1), grantKey(S1, "b", 1), grantKey(SKILLS_GROUP, "old", 1), grantKey(P, "x", 2)],
    [[1, { scopes: { gmail: "read" }, accounts: { gmail: ["acc"] } }]]);
  const desired = state([grantKey(S1, "a", 1), grantKey(S1, "c", 1), grantKey(SKILLS_GROUP, "new", 1)],
    [[1, { scopes: { gmail: "read", github: "write" }, accounts: { gmail: ["acc"], github: ["g1"] } }]]);
  const changes = diff(saved, desired);
  const ops = planSave(changes, desired, () => "claude");
  assert.deepEqual(ops.map((op) => op.op === "skill" ? [op.op, op.name, op.grant] : op.op === "tools" ? [op.op, op.kind, op.connectionId, op.agentId, op.tools] : [op.op, op.agentId, op.scopes, op.accounts]), [
    ["skill", "old", false],
    ["skill", "new", true],
    ["tools", "server", "c1", 1, ["a", "c"]],
    ["tools", "plugin", "p1", 2, []],
    ["apps", 1, { github: "write", gmail: "read" }, { github: ["g1"], gmail: ["acc"] }],
  ]);
  // Every change is carried by exactly one call.
  const carried = ops.flatMap((op) => op.keys).sort();
  assert.deepEqual(carried, changes.map(changeKey).sort());
  // An engine without connected apps sends none (the backend would refuse them).
  const other = planSave(changes, desired, () => "gemini").find((op) => op.op === "apps");
  assert.equal(other.scopes, null);
  assert.deepEqual(other.accounts, {});
});

test("runSave keeps going after a failure and reports each change key", async () => {
  const calls = [];
  const deps = {
    saveSkill: async (agent, name) => { calls.push(`+${name}`); },
    deleteSkill: async (agent, name) => { calls.push(`-${name}`); },
    saveTools: async (kind, id, agent) => { calls.push(`${kind}:${id}:${agent}`); if (agent === 2) throw Object.assign(new Error("changed"), { code: "connection_changed" }); },
    saveApps: async () => { calls.push("apps"); },
  };
  const ops = [
    { op: "skill", agentId: 1, name: "old", grant: false, keys: ["k1"] },
    { op: "skill", agentId: 1, name: "new", grant: true, keys: ["k2"] },
    { op: "tools", kind: "server", connectionId: "c1", agentId: 1, tools: ["a"], keys: ["k3"] },
    { op: "tools", kind: "server", connectionId: "c1", agentId: 2, tools: [], keys: ["k4", "k5"] },
    { op: "apps", agentId: 1, scopes: null, accounts: {}, keys: ["k6"] },
  ];
  const result = await runSave(ops, deps, 2);
  assert.deepEqual(calls.slice(0, 2), ["-old", "+new"]);
  assert.deepEqual(result.saved.sort(), ["k1", "k2", "k3", "k6"]);
  assert.deepEqual([...result.failed.keys()].sort(), ["k4", "k5"]);
  assert.equal(result.failed.get("k4").code, "connection_changed");
  assert.deepEqual(await runSave([], deps), { saved: [], failed: new Map() });
});

test("after a partial save the failed changes are put back on the fresh state", () => {
  const fresh = state([grantKey(S1, "a", 1)], [[1, { scopes: {}, accounts: {} }]]);
  const failed = [
    { kind: "grant", group: S1, item: "b", agentId: 1, grant: true },
    { kind: "grant", group: S1, item: "a", agentId: 1, grant: false },
    { kind: "app", app: "gmail", agentId: 1, from: "off", to: "read", accountsFrom: [], accountsTo: ["acc"] },
  ];
  const next = reapply(fresh, failed);
  assert.deepEqual([...next.grants], [grantKey(S1, "b", 1)]);
  assert.deepEqual(next.apps.get(1), { scopes: { gmail: "read" }, accounts: { gmail: ["acc"] } });
  assert.deepEqual(diff(fresh, next).map(changeKey).sort(), failed.map(changeKey).sort());
  // The fresh state itself is left alone.
  assert.deepEqual([...fresh.grants], [grantKey(S1, "a", 1)]);
});

test("a cell finds its own save error by the change key its item would have", () => {
  const [gmail] = toolSources("server", { id: "c1", name: "AP" }, tools);
  const apps = appsSource([{ slug: "gmail", label: "Gmail", read: "", write: null }]);
  const grant = { kind: "grant", group: S1, item: "gmail_send", agentId: 3, grant: false };
  const app = { kind: "app", app: "gmail", agentId: 3, from: "read", to: "off", accountsFrom: [], accountsTo: [] };
  assert.equal(itemChangeKey(gmail, "gmail_send", 3), changeKey(grant));
  assert.equal(itemChangeKey(apps, "gmail", 3), changeKey(app));
  const failed = new Set([changeKey(grant)]);
  assert.equal(cellFailed(gmail, 3, failed), true);
  assert.equal(cellFailed(gmail, 4, failed), false);
  assert.equal(cellFailed(apps, 3, failed), false);
});

test("changes for a source or agent that is gone after a reload are dropped", () => {
  const sources = toolSources("server", { id: "c1", name: "AP" }, tools);
  const changes = [
    { kind: "grant", group: S1, item: "gmail_send", agentId: 1, grant: true },
    { kind: "grant", group: S1, item: "gone_tool", agentId: 1, grant: true },
    { kind: "grant", group: S1, item: "gmail_send", agentId: 9, grant: true },
    { kind: "app", app: "gmail", agentId: 1, from: "off", to: "read", accountsFrom: [], accountsTo: [] },
  ];
  assert.deepEqual(changesStillShown(changes, sources, [1]).map((c) => c.item ?? c.app), ["gmail_send"]);
});
