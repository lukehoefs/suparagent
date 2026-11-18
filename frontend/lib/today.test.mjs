import assert from "node:assert/strict";
import { test } from "node:test";
import {
  activityHref, calendarNote, calendarRows, conversationHref, dayKey, dueTasks, firstDayOfWeek, firstName, greeting,
  greetingPart, monthCells, routineResults, runStatus, runningItems, runsCoverToday, safeZone, waitingItems, weekdayOrder, zonedParts,
} from "./today.ts";

const TZ = "America/Tijuana";

// --- time --------------------------------------------------------------------------------------

test("the wall clock and the local day follow the time zone, not the browser", () => {
  // 07:35 in Tijuana (UTC-8 in November) is 15:35 UTC.
  const at = "2026-11-16T15:35:00Z";
  assert.deepEqual(zonedParts(at, TZ), { year: 2026, month: 11, day: 16, hour: 7, minute: 35 });
  assert.equal(dayKey(at, TZ), "2026-11-16");
  // Late evening in Tijuana is already tomorrow in UTC.
  assert.equal(dayKey("2026-11-17T06:30:00Z", TZ), "2026-11-16");
  assert.equal(dayKey("2026-11-17T06:30:00Z", "UTC"), "2026-11-17");
  assert.equal(dayKey("not a date", TZ), null);
  assert.equal(zonedParts("2026-11-16T08:00:00Z", "UTC").hour, 8);
});

test("an unknown time zone falls back to UTC", () => {
  assert.equal(safeZone("Nowhere/Atlantis"), "UTC");
  assert.equal(safeZone(""), "UTC");
  assert.equal(safeZone(null), "UTC");
  assert.equal(safeZone(TZ), TZ);
  assert.equal(dayKey("2026-11-17T06:30:00Z", "Nowhere/Atlantis"), "2026-11-17");
});

test("the greeting follows the hour, with the first name when there is one", () => {
  assert.equal(greetingPart(5), "morning");
  assert.equal(greetingPart(11), "morning");
  assert.equal(greetingPart(12), "afternoon");
  assert.equal(greetingPart(17), "afternoon");
  assert.equal(greetingPart(18), "evening");
  assert.equal(greetingPart(0), "evening");
  assert.equal(greetingPart(4), "evening");
  assert.deepEqual(greeting(8, "Luke"), { key: "today.greeting.morning", params: { name: "Luke" } });
  assert.deepEqual(greeting(20, null), { key: "today.greeting.eveningPlain" });
  assert.equal(firstName("  Luke Hoefs "), "Luke");
  assert.equal(firstName("Luke"), "Luke");
  assert.equal(firstName("   "), null);
  assert.equal(firstName(null), null);
});

// --- the month ---------------------------------------------------------------------------------

test("a month starts on its weekday after the blanks, and has all its days", () => {
  // 1 November 2026 is a Sunday.
  const sunday = monthCells(2026, 11, 0);
  assert.equal(sunday[0], 1);
  assert.equal(sunday.length, 30);
  const monday = monthCells(2026, 11, 1);
  assert.deepEqual(monday.slice(0, 7), [null, null, null, null, null, null, 1]);
  assert.equal(monday.filter((cell) => cell !== null).length, 30);
  // February in a leap year.
  assert.equal(monthCells(2028, 2, 0).filter(Boolean).length, 29);
  assert.deepEqual(weekdayOrder(1), [1, 2, 3, 4, 5, 6, 0]);
  assert.deepEqual(weekdayOrder(0), [0, 1, 2, 3, 4, 5, 6]);
});

test("the week starts where the language usually starts it", () => {
  for (const tag of ["en", "pt-BR", "ja", "ko"]) assert.equal(firstDayOfWeek(tag), 0, tag);
  for (const tag of ["de", "fr", "es", "it", "nl", "pl", "ru", "tr"]) assert.equal(firstDayOfWeek(tag), 1, tag);
  const day = firstDayOfWeek("zz-unknown");
  assert.ok(day >= 0 && day <= 6);
});

// --- links -------------------------------------------------------------------------------------

test("every row opens where it lives", () => {
  assert.equal(conversationHref({ thread_id: 7, kind: "chat", room_id: null }), "/chat?thread=7");
  assert.equal(conversationHref({ thread_id: 7, kind: "room_member", room_id: 3 }), "/chat?room=3");
  assert.equal(conversationHref({ thread_id: 7, kind: "job", room_id: null }), "/chat?thread=7");
  assert.equal(activityHref({ thread_id: 4, routine_id: 9 }), "/chat?thread=4");
  assert.equal(activityHref({ thread_id: null, routine_id: 9 }), "/chat?view=routines&routine=9");
  assert.equal(activityHref({ thread_id: null, routine_id: null }), null);
});

// --- waiting for you ---------------------------------------------------------------------------

const call = (id, at, extra = {}) => ({ id, turn_id: 1, tool: "Bash", input: { command: "ls" }, summary: "ls", kind: "command", status: "pending", created_at: at, ...extra });
const turn = (thread, approvals = [], extra = {}) => ({ thread_id: thread, turn_id: thread * 10, kind: "chat", title: `T${thread}`, agent_id: thread, room_id: null, job_id: null, started_at: "2026-11-16T15:00:00Z", origin: "person", approvals, ...extra });
const row = (kind, key, extra = {}) => ({ kind, key, title: key, detail: null, thread_id: null, agent_id: null, ...extra });

test("waiting lists engines first, then the calls oldest first, then questions and fixes", () => {
  const running = [
    turn(1, [call("b", "2026-11-16T15:10:00Z")]),
    turn(2, [call("a", "2026-11-16T15:05:00Z", { tool: "WebSearch", summary: null })]),
    turn(3),
  ];
  const brief = [
    row("signed_out", "signed_out:claude"),
    row("approval", "approval:b", { thread_id: 1 }),
    row("question", "question:5", { thread_id: 8, agent_id: 4 }),
    row("routine", "routine:2", { routine_id: 2 }),
    row("repeated_failure", "repeated_failure:x"),
    row("due", "due:1", { work_item_id: 1 }),
    row("routine_completed", "completed:2:2026-11-16", { routine_id: 2 }),
    row("calendar_event", "calendar:e1"),
    row("gmail_message", "gmail:m1"),
  ];
  const items = waitingItems(running, brief);
  assert.deepEqual(items.map((item) => item.key), [
    "signed_out:claude", "approval:a", "approval:b", "question:5", "routine:2", "repeated_failure:x",
  ]);
  const first = items[1];
  assert.equal(first.type, "approval");
  assert.equal(first.threadId, 2);
  assert.equal(first.agentId, 2);
  assert.equal(first.title, "T2");
  assert.equal(first.href, "/chat?thread=2");
  assert.equal(first.summary, "WebSearch");
  assert.ok(first.call);
  const question = items[3];
  assert.deepEqual([question.type, question.agentId, question.href, question.actionKey], ["question", 4, "/chat?thread=8", "today.waiting.answer"]);
  assert.equal(items[0].href, "/settings/engines/");
  assert.equal(items[0].actionKey, "today.action.openSettings");
  assert.equal(items[4].href, "/chat?view=routines&routine=2");
  assert.equal(items[5].actionKey, "today.action.lookIntoIt");
});

test("calls in a room open the room", () => {
  const items = waitingItems([turn(1, [call("a", "2026-11-16T15:05:00Z")], { kind: "room_member", room_id: 6 })], []);
  assert.equal(items[0].href, "/chat?room=6");
});

test("without what is running, the brief's calls are links that cannot be answered here", () => {
  const items = waitingItems(null, [row("approval", "approval:z", { thread_id: 3, detail: "Freight", title: "Run ls", agent_id: 2 })]);
  assert.equal(items.length, 1);
  assert.deepEqual(
    [items[0].type, items[0].approvalId, items[0].call, items[0].href, items[0].title, items[0].summary, items[0].agentId],
    ["approval", "z", null, "/chat?thread=3", "Freight", "Run ls", 2],
  );
  assert.deepEqual(waitingItems(null, null), []);
  assert.deepEqual(waitingItems([], []), []);
});

test("the brief's calls are not listed twice when what is running is known", () => {
  const items = waitingItems([turn(1)], [row("approval", "approval:gone", { thread_id: 1 })]);
  assert.deepEqual(items, []);
});

// --- running now -------------------------------------------------------------------------------

test("running now leaves out answers waiting for you and names a routine's run after it", () => {
  const running = [turn(1), turn(2, [call("a", "2026-11-16T15:05:00Z")]), turn(3, [], { kind: "room_member", room_id: 5 })];
  const runs = [{ routine_id: 9, state: "running", thread_id: 1 }, { routine_id: 9, state: "completed", thread_id: 3 }];
  const items = runningItems(running, runs, [{ id: 9, name: "Production digest" }]);
  assert.deepEqual(items.map((item) => [item.threadId, item.routineName, item.href]), [
    [1, "Production digest", "/chat?thread=1"],
    [3, null, "/chat?room=5"],
  ]);
  assert.deepEqual(runningItems(null, null, null), []);
});

// --- routine results ---------------------------------------------------------------------------

const run = (id, routine, state, finished, extra = {}) => ({
  id, routine_id: routine, state, thread_id: id * 100, finished_at: finished, started_at: null, scheduled_for: null,
  created_at: finished ?? "2026-11-16T15:00:00Z", ...extra,
});
const routines = [{ id: 1, name: "Production digest", agent_id: 11 }, { id: 2, name: "Weekly content plan", agent_id: 12 }, { id: 3, name: "Quiet", agent_id: 13 }];

test("routine results show each routine's latest result today, with how many it had", () => {
  const runs = [
    run(1, 1, "completed", "2026-11-16T15:35:00Z"),
    run(2, 1, "failed", "2026-11-16T16:00:00Z"),
    run(3, 1, "completed", "2026-11-15T15:35:00Z"), // yesterday in Tijuana
    run(4, 2, "needs_input", null, { started_at: "2026-11-16T17:00:00Z", thread_id: null }),
    run(5, 3, "running", null, { started_at: "2026-11-16T17:30:00Z" }),
    run(6, 3, "skipped", "2026-11-16T17:31:00Z"),
    run(7, 99, "completed", "2026-11-16T15:00:00Z"), // a task's own routine: not listed
  ];
  const results = routineResults(runs, routines, "2026-11-16", TZ);
  assert.deepEqual(results.map((r) => [r.routineId, r.run.id, r.count, r.status, r.labelKey]), [
    [2, 4, 1, "waiting", "today.run.needsYou"],
    [1, 2, 2, "denied", "today.run.failed"],
  ]);
  assert.equal(results[1].href, "/chat?thread=200");
  assert.equal(results[0].href, "/chat?view=routines&routine=2");
  assert.equal(results[1].agentId, 11);
  assert.deepEqual(routineResults(null, routines, "2026-11-16", TZ), []);
});

test("run states map onto the status language", () => {
  assert.deepEqual(runStatus("completed"), { status: "done", key: "today.run.done" });
  assert.deepEqual(runStatus("missed"), { status: "denied", key: "today.run.missed" });
  assert.deepEqual(runStatus("interrupted"), { status: "denied", key: "today.run.interrupted" });
  assert.equal(runStatus("queued"), null);
  assert.equal(runStatus("skipped"), null);
});

test("a full list of runs that is still from today may miss some", () => {
  const today = [run(1, 1, "completed", "2026-11-16T16:00:00Z"), run(2, 1, "completed", "2026-11-16T15:00:00Z")];
  assert.equal(runsCoverToday(today, 5, "2026-11-16", TZ), true);
  assert.equal(runsCoverToday(today, 2, "2026-11-16", TZ), false);
  const reaching = [...today.slice(0, 1), run(3, 1, "completed", "2026-11-15T12:00:00Z")];
  assert.equal(runsCoverToday(reaching, 2, "2026-11-16", TZ), true);
});

// --- due tasks ---------------------------------------------------------------------------------

const task = (id, extra = {}) => ({ id, column_id: 1, title: `Task ${id}`, archived: false, due_at: null, due_date: null, timezone: TZ, ...extra });
const NOW = new Date("2026-11-16T18:00:00Z"); // 10:00 in Tijuana

test("due tasks: overdue first, then today's by time; not later ones, done or archived", () => {
  const items = [
    task(1, { due_at: "2026-11-16T22:00:00Z" }), // 14:00 today
    task(2, { due_at: "2026-11-16T16:00:00Z" }), // 08:00 today: overdue
    task(3, { due_date: "2026-11-16" }),
    task(4, { due_date: "2026-11-14" }),
    task(5, { due_date: "2026-11-17" }),
    task(6, { due_at: "2026-11-17T18:00:00Z" }),
    task(7, { due_date: "2026-11-16", column_id: 4 }),
    task(8, { due_date: "2026-11-16", archived: true }),
    task(9),
    task(10, { due_at: "2026-11-14T18:00:00Z" }),
  ];
  const due = dueTasks(items, 4, NOW, TZ);
  assert.deepEqual(due.map((d) => d.item.id), [4, 10, 2, 3, 1]);
  const by = Object.fromEntries(due.map((d) => [d.item.id, d]));
  assert.deepEqual([by[4].overdue, by[4].when], [true, { kind: "date", day: "2026-11-14" }]);
  assert.deepEqual([by[10].overdue, by[10].when], [true, { kind: "date", day: "2026-11-14" }]);
  assert.deepEqual([by[2].overdue, by[2].when], [true, { kind: "time", at: "2026-11-16T16:00:00Z" }]);
  assert.deepEqual([by[3].overdue, by[3].when], [false, { kind: "today" }]);
  assert.deepEqual([by[1].overdue, by[1].when], [false, { kind: "time", at: "2026-11-16T22:00:00Z" }]);
});

test("a task ticked off here stays listed in its place, shown done", () => {
  const before = [task(1, { due_date: "2026-11-14" }), task(3, { due_date: "2026-11-15" }), task(2, { due_date: "2026-11-16" })];
  assert.deepEqual(dueTasks(before, 4, NOW, TZ).map((d) => [d.item.id, d.overdue]), [[1, true], [3, true], [2, false]]);
  const items = before.map((item) => (item.id === 1 ? { ...item, column_id: 4 } : item));
  assert.deepEqual(dueTasks(items, 4, NOW, TZ).map((d) => d.item.id), [3, 2]);
  const kept = dueTasks(items, 4, NOW, TZ, new Set([1]));
  assert.deepEqual(kept.map((d) => [d.item.id, d.done, d.overdue]), [[1, true, false], [3, false, true], [2, false, false]]);
  // Without a Done column nothing counts as done.
  assert.equal(dueTasks(items, null, NOW, TZ).length, 3);
});

test("a due day is read in the task's own time zone", () => {
  // 10:00 in Tijuana is already 17 November in Tokyo.
  const items = [task(1, { due_date: "2026-11-17", timezone: "Asia/Tokyo" })];
  assert.deepEqual(dueTasks(items, null, NOW, TZ).map((d) => [d.item.id, d.when.kind]), [[1, "today"]]);
});

// --- the calendar card -------------------------------------------------------------------------

test("the calendar card lists today's events and says when the calendar could not be read", () => {
  assert.deepEqual(calendarRows([row("calendar_event", "calendar:1"), row("approval", "approval:a")]).map((r) => r.key), ["calendar:1"]);
  assert.equal(calendarRows(null).length, 0);
  assert.equal(calendarNote("unavailable", 0), null);
  assert.equal(calendarNote(undefined, 0), null);
  assert.equal(calendarNote("quiet", 0), "none");
  assert.equal(calendarNote("available", 2), null);
  assert.equal(calendarNote("failed", 0), "failed");
  assert.equal(calendarNote("partial", 3), "partial");
});
