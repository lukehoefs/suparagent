import assert from "node:assert/strict";
import { test } from "node:test";
import { agentActivities, agentComputerBadge, agentTarget, hasMoreBelow, recentVisible, rowStatus, showsUnreadDot, sidebarAgents, signedInPerson, threadName, wantsProfileName } from "./sidebar.ts";

test("a routine's run is listed by its routine's name, with the whole title kept", () => {
  assert.deepEqual(threadName("Production digest · Tue 17 Nov 07:35 PST"), { name: "Production digest", full: "Production digest · Tue 17 Nov 07:35 PST" });
  assert.deepEqual(threadName("Weekly content plan · now"), { name: "Weekly content plan", full: "Weekly content plan · now" });
  // A task's own routine is named after its task.
  assert.deepEqual(threadName("Task #3: Supplier price check · Wed 18 Nov 07:00 PST"), { name: "Supplier price check", full: "Task #3: Supplier price check · Wed 18 Nov 07:00 PST" });
  // Any other title is listed as it is.
  assert.deepEqual(threadName("Freight capacity, November"), { name: "Freight capacity, November", full: null });
  assert.deepEqual(threadName("Notes · from Monday"), { name: "Notes · from Monday", full: null });
  assert.deepEqual(threadName(null), { name: null, full: null });
  assert.deepEqual(threadName("  "), { name: null, full: null });
});

const thread = (id, agent_id, updated_at, archived_at = null) => ({ id, agent_id, updated_at, archived_at });

test("an agent leads to its newest conversation that is not archived", () => {
  const threads = [
    thread(1, 7, "2026-10-01T10:00:00Z"),
    thread(2, 7, "2026-10-03T10:00:00Z"),
    thread(3, 7, "2026-10-09T10:00:00Z", "2026-10-10T00:00:00Z"),
    thread(4, 8, "2026-10-20T10:00:00Z"),
  ];
  assert.deepEqual(agentTarget(threads, 7), { kind: "thread", id: 2 });
  assert.deepEqual(agentTarget(threads, 8), { kind: "thread", id: 4 });
});

test("an agent with no conversation, or only archived ones, starts a new chat", () => {
  assert.deepEqual(agentTarget([], 7), { kind: "new" });
  assert.deepEqual(agentTarget(null, 7), { kind: "new" });
  assert.deepEqual(agentTarget([thread(1, 7, "2026-10-01T10:00:00Z", "2026-10-02T00:00:00Z")], 7), { kind: "new" });
  assert.deepEqual(agentTarget([thread(1, null, "2026-10-01T10:00:00Z")], 7), { kind: "new" });
});

test("the list skips archived agents, puts pinned first, then sorts by name", () => {
  const agents = [
    { id: 1, name: "zed", archived_at: null },
    { id: 2, name: "Atlas", archived_at: null },
    { id: 3, name: "old", archived_at: "2026-10-01T00:00:00Z" },
    { id: 4, name: "mira", pinned: true, archived_at: null },
    { id: 5, name: "Bea", archived_at: null },
  ];
  assert.deepEqual(sidebarAgents(agents).map((a) => a.id), [4, 2, 5, 1]);
  assert.deepEqual(sidebarAgents(null), []);
});

test("sorting does not change the array it was given", () => {
  const agents = [{ id: 1, name: "b", archived_at: null }, { id: 2, name: "a", archived_at: null }];
  sidebarAgents(agents);
  assert.deepEqual(agents.map((a) => a.id), [1, 2]);
});

test("status precedence: waiting, then working, then needs a new session", () => {
  assert.equal(rowStatus({ waiting: true, working: true, brokenSession: true }), "waiting");
  assert.equal(rowStatus({ working: true, brokenSession: true }), "working");
  assert.equal(rowStatus({ brokenSession: true }), "reset");
  assert.equal(rowStatus({}), null);
});

test("unread is the quietest status and gets a second dot beside a louder one", () => {
  assert.equal(rowStatus({ unread: true }), "unread");
  assert.equal(rowStatus({ unread: true, working: true }), "working");
  assert.equal(showsUnreadDot("working", true), true);
  assert.equal(showsUnreadDot("unread", true), false);
  assert.equal(showsUnreadDot(null, true), false);
  assert.equal(showsUnreadDot("working", false), false);
});

test("the short list keeps anything needing attention beyond the limit", () => {
  const threads = [1, 2, 3, 4, 5, 6].map((id) => ({ id }));
  assert.deepEqual(recentVisible(threads, 2, () => false, false).map((x) => x.id), [1, 2]);
  assert.deepEqual(recentVisible(threads, 2, (x) => x.id === 5, false).map((x) => x.id), [1, 2, 5]);
  assert.equal(recentVisible(threads, 2, () => false, true).length, 6);
  assert.equal(recentVisible(threads, 10, () => false, false).length, 6);
});

test("an agent's cloud computer badge is on only while its gateway answers", () => {
  assert.equal(agentComputerBadge({ state: "online" }, null), "on");
  assert.equal(agentComputerBadge({ state: "offline" }, null), "off");
  assert.equal(agentComputerBadge({ state: "needs_key" }, "running"), "off");
  assert.equal(agentComputerBadge({ state: "disabled" }, null), "off");
});

test("without a cloud computer the agent's own computer decides, and no computer shows no badge", () => {
  assert.equal(agentComputerBadge(null, "running"), "on");
  assert.equal(agentComputerBadge(undefined, "stopped"), "off");
  assert.equal(agentComputerBadge(null, "missing"), null);
  assert.equal(agentComputerBadge(null, null), null);
});

test("an agent with an answer running shows working, unless it waits for the person", () => {
  const threads = [{ id: 1, agent_id: 7 }, { id: 2, agent_id: 8 }, { id: 3, agent_id: 8 }];
  const none = { agentId: null, working: false, waiting: false };
  const map = agentActivities({ live: none, threads, waitingThreadIds: [3], workingThreadIds: [1, 2] });
  assert.equal(map.get(7), "working");
  assert.equal(map.get(8), "waiting");
  // Without the running answers only the open conversation and the waiting ones are known.
  assert.equal(agentActivities({ live: none, threads, waitingThreadIds: [] }).size, 0);
});

test("a list shows more below only while its end is out of view", () => {
  assert.equal(hasMoreBelow({ scrollTop: 0, scrollHeight: 900, clientHeight: 500 }), true);
  assert.equal(hasMoreBelow({ scrollTop: 400, scrollHeight: 900, clientHeight: 500 }), false);
  // Fractional scrolling stops a pixel short of the end on some screens.
  assert.equal(hasMoreBelow({ scrollTop: 399.5, scrollHeight: 900, clientHeight: 500 }), false);
  assert.equal(hasMoreBelow({ scrollTop: 0, scrollHeight: 500, clientHeight: 500 }), false);
});

test("the footer names the person: their own name, else the owner's profile name, else the label", () => {
  const session = (extra) => ({ kind: "browser", scopes: ["chat"], label: "Chrome on Windows", ...extra });
  // The owner on this computer has no session: the profile names them.
  assert.equal(wantsProfileName(null), true);
  assert.deepEqual(signedInPerson(null, " Luke "), { name: "Luke", role: "owner" });
  assert.deepEqual(signedInPerson(null, null), { name: null, role: "owner" });
  // This machine trusted with admin rights, no person behind it.
  const loopback = { kind: "loopback", scopes: ["admin"], label: null };
  assert.equal(wantsProfileName(loopback), true);
  assert.deepEqual(signedInPerson(loopback, "Luke"), { name: "Luke", role: "owner" });
  // A signed-in member has a name and a role of their own; the profile is not theirs to read.
  const member = session({ display_name: "Mira", role: "member" });
  assert.equal(wantsProfileName(member), false);
  assert.deepEqual(signedInPerson(member, "Luke"), { name: "Mira", role: "member" });
  // A paired device without admin rights: its label, never the owner's name.
  assert.equal(wantsProfileName(session()), false);
  assert.deepEqual(signedInPerson(session(), "Luke"), { name: "Chrome on Windows", role: null });
  // An admin browser session with no name: the profile first, then the label.
  const admin = session({ scopes: ["admin"] });
  assert.deepEqual(signedInPerson(admin, "Luke"), { name: "Luke", role: null });
  assert.deepEqual(signedInPerson(admin, ""), { name: "Chrome on Windows", role: null });
});
