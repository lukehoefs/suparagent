import assert from "node:assert/strict";
import { test } from "node:test";
import {
  agentRooms,
  agentRoutines,
  APPROVALS_SETTINGS_HREF,
  clockTime,
  formatLogDay,
  NEW_TOPIC,
  newestDaysFirst,
  nextRunWords,
  NOTES_FILE,
  oneLine,
  proposalAcceptance,
  proposalTargets,
  routineRunsHref,
  routineState,
  routineStateWords,
  ROUTINES_VIEW_HREF,
  runOutcomeKey,
  runStateWords,
  scheduleWords,
  sizeKb,
  sortRules,
} from "./agent-automation.ts";
import { en } from "./i18n.ts";
import { agentsAutomationMessages } from "./locales/agents-automation-extra.ts";

// Some ICU versions put a narrow no-break space before AM/PM.
const norm = (text) => text.replace(/s/g, " ");

const routine = (patch = {}) => ({
  id: 1,
  agent_id: 5,
  name: "Morning digest",
  schedule_kind: "weekdays",
  schedule_spec: { days: [1, 2, 3, 4, 5], time: "09:00" },
  timezone: "Europe/London",
  paused: false,
  next_run_at: "2026-11-17T09:00:00Z",
  ...patch,
});

test("addresses of the routines view and the approvals settings", () => {
  assert.equal(ROUTINES_VIEW_HREF, "/chat/?view=routines");
  assert.equal(routineRunsHref(12), "/chat/?view=routines&routine=12");
  assert.equal(APPROVALS_SETTINGS_HREF, "/settings/approvals/");
});

test("only the agent's routines, by name", () => {
  const list = [
    routine({ id: 3, name: "b" }),
    routine({ id: 1, name: "a", agent_id: 6 }),
    routine({ id: 2, name: "a" }),
    routine({ id: 4, name: "a" }),
  ];
  assert.deepEqual(agentRoutines(list, 5).map((r) => r.id), [2, 4, 3]);
  assert.deepEqual(agentRoutines(list, 9), []);
});

test("a routine is on, paused or finished, with a dot and a word", () => {
  assert.equal(routineState(routine()), "on");
  assert.equal(routineState(routine({ paused: true })), "paused");
  assert.equal(routineState(routine({ schedule_kind: "once", next_run_at: null })), "finished");
  // The server's own status wins.
  assert.equal(routineState(routine({ status: "off" })), "paused");
  assert.deepEqual(routineStateWords("on"), { tone: "done", key: "agentAutomation.routine.state.on" });
  assert.equal(routineStateWords("paused").tone, "idle");
  assert.equal(routineStateWords("finished").tone, "idle");
});

test("run states and outcomes map to the status language", () => {
  assert.deepEqual(runStateWords("completed"), { tone: "done", key: "agentAutomation.run.state.completed" });
  assert.equal(runStateWords("running").tone, "running");
  assert.equal(runStateWords("queued").tone, "running");
  assert.equal(runStateWords("needs_input").tone, "waiting");
  assert.equal(runStateWords("failed").tone, "denied");
  assert.equal(runStateWords("missed").tone, "denied");
  assert.equal(runStateWords("skipped").tone, "idle");
  assert.deepEqual(runStateWords("weird"), { tone: "idle", key: "agentAutomation.run.state.unknown" });
  assert.equal(runOutcomeKey("no_change"), "agentAutomation.run.outcome.no_change");
  assert.equal(runOutcomeKey("source_failed"), "agentAutomation.run.outcome.source_failed");
  assert.equal(runOutcomeKey("failed"), null);
  assert.equal(runOutcomeKey(null), null);
});

test("schedules read in words, with the routine's zone when it is not the reader's", () => {
  const weekdays = scheduleWords(routine(), "en", "Europe/London");
  assert.equal(weekdays.words.key, "agentAutomation.schedule.weekdays");
  assert.equal(norm(weekdays.words.params.time), "9:00 AM");
  assert.equal(weekdays.zone, null);
  assert.equal(scheduleWords(routine(), "en", "America/New_York").zone, "Europe/London");
  assert.equal(scheduleWords(routine({ schedule_spec: { days: [0, 1, 2, 3, 4, 5, 6], time: "07:30" } }), "en", "UTC").words.key, "agentAutomation.schedule.daily");
  assert.equal(scheduleWords(routine({ schedule_spec: { days: [6, 0], time: "07:30" } }), "en", "UTC").words.key, "agentAutomation.schedule.weekends");
  const some = scheduleWords(routine({ schedule_spec: { days: [0, 3, 1], time: "18:05" } }), "en", "UTC").words;
  assert.equal(some.key, "agentAutomation.schedule.onDays");
  assert.equal(some.params.days, "Mon, Wed, & Sun");
  assert.equal(norm(some.params.time), "6:05 PM");
  assert.equal(scheduleWords(routine({ schedule_spec: { days: [1], time: "18:05" } }), "de", "UTC").words.params.time, "18:05");
});

test("intervals, one-time, cron and hand-run schedules", () => {
  const every = (minutes, locale = "en") => scheduleWords(routine({ schedule_kind: "interval", schedule_spec: { every_minutes: minutes } }), locale, "UTC");
  assert.deepEqual(every(30), { words: { key: "agentAutomation.schedule.every.minutes.other", params: { n: 30 } }, zone: null });
  assert.equal(every(60).words.key, "agentAutomation.schedule.every.hours.single");
  assert.equal(every(180).words.key, "agentAutomation.schedule.every.hours.other");
  assert.equal(every(1440).words.key, "agentAutomation.schedule.every.days.single");
  assert.equal(every(2880, "ru").words.key, "agentAutomation.schedule.every.days.few");
  assert.equal(every(0).words.key, "agentAutomation.schedule.unreadable");

  const once = scheduleWords(routine({ schedule_kind: "once", schedule_spec: { at: "2026-12-01T09:00:00Z" }, timezone: "UTC" }), "en", "Europe/Paris");
  assert.equal(once.words.key, "agentAutomation.schedule.once");
  assert.match(once.words.params.when, /Dec 1, 2026/);
  assert.equal(once.zone, "UTC");

  assert.deepEqual(scheduleWords(routine({ schedule_kind: "cron", schedule_spec: { expression: " 0 9 * * 1 " } }), "en", "Europe/London").words, {
    key: "agentAutomation.schedule.cron",
    params: { expression: "0 9 * * 1" },
  });
  assert.deepEqual(scheduleWords(routine({ schedule_kind: "manual", schedule_spec: {} }), "en", "UTC"), {
    words: { key: "agentAutomation.schedule.manual" },
    zone: null,
  });
  assert.equal(scheduleWords(routine({ schedule_spec: { days: [], time: "09:00" } }), "en", "UTC").words.key, "agentAutomation.schedule.unreadable");
  assert.equal(scheduleWords(routine({ schedule_spec: { days: [1], time: "25:00" } }), "en", "UTC").words.key, "agentAutomation.schedule.unreadable");
});

test("times of day are checked", () => {
  assert.equal(norm(clockTime("09:00", "en")), "9:00 AM");
  assert.equal(clockTime("9:5", "en"), null);
  assert.equal(clockTime(9, "en"), null);
});

test("the next run shows only for a routine that runs by itself", () => {
  assert.equal(nextRunWords(routine(), "en").key, "agentAutomation.routine.next");
  assert.equal(nextRunWords(routine({ paused: true }), "en"), null);
  assert.equal(nextRunWords(routine({ schedule_kind: "manual", next_run_at: null }), "en"), null);
  assert.equal(nextRunWords(routine({ next_run_at: null }), "en"), null);
  assert.equal(nextRunWords(routine({ schedule_kind: "once", next_run_at: null }), "en"), null);
});

test("rules for the agent's folders come before the ones for every folder", () => {
  const rules = [
    { id: 1, command: "pwd", workspace: null },
    { id: 2, command: "ls", workspace: "/a" },
    { id: 3, command: "git status", workspace: "/a" },
    { id: 4, command: "echo", workspace: null },
  ];
  assert.deepEqual(sortRules(rules).map((r) => r.id), [3, 2, 4, 1]);
});

test("the rooms an agent is in, with whether it is held", () => {
  const rooms = [
    { id: 1, name: "Zeta", members: [{ agent_id: 5, held: true }] },
    { id: 2, name: "Alpha", members: [{ agent_id: 6, held: false }, { agent_id: 5, held: false }] },
    { id: 3, name: "Beta", members: [{ agent_id: 6, held: false }] },
  ];
  assert.deepEqual(agentRooms(rooms, 5).map(({ room, held }) => [room.id, held]), [[2, false], [1, true]]);
  assert.deepEqual(agentRooms(rooms, 7), []);
});

test("daily logs read newest first, with dates in the reader's language", () => {
  assert.deepEqual(newestDaysFirst([{ day: "2026-11-01" }, { day: "2026-11-16" }, { day: "2025-12-31" }]).map((d) => d.day), ["2026-11-16", "2026-11-01", "2025-12-31"]);
  assert.equal(formatLogDay("2026-11-16", "en"), "Mon, Nov 16, 2026");
  assert.equal(formatLogDay("2026-02-30", "en"), "2026-02-30");
  assert.equal(formatLogDay("nope", "en"), "nope");
  assert.equal(sizeKb(10), 1);
  assert.equal(sizeKb(4096), 4);
});

test("a proposal may go to the notes or any topic note", () => {
  assert.deepEqual(proposalTargets([{ name: "travel.md" }, { name: "food.md" }], NOTES_FILE), [NOTES_FILE, "food.md", "travel.md"]);
  // A proposal for a topic note not made yet keeps that choice.
  assert.deepEqual(proposalTargets([{ name: "travel.md" }], "school.md"), [NOTES_FILE, "school.md", "travel.md"]);
  assert.deepEqual(proposalTargets([], NOTES_FILE), [NOTES_FILE]);
});

test("accepting an edited proposal sends only what changed", () => {
  const proposal = { line: "Prefers  aisle seats", target: NOTES_FILE };
  assert.deepEqual(proposalAcceptance(proposal, "Prefers aisle seats", NOTES_FILE, ""), { ok: true, change: {} });
  assert.deepEqual(proposalAcceptance(proposal, "Prefers window\nseats ", NOTES_FILE, ""), { ok: true, change: { line: "Prefers window seats" } });
  assert.deepEqual(proposalAcceptance(proposal, "Prefers aisle seats", "travel.md", ""), { ok: true, change: { target: "travel.md" } });
  assert.deepEqual(proposalAcceptance(proposal, "Prefers aisle seats", NEW_TOPIC, "Long trips"), { ok: true, change: { target: "long-trips.md" } });
  assert.deepEqual(proposalAcceptance(proposal, "  ", NOTES_FILE, ""), { ok: false, reason: "empty_line" });
  assert.deepEqual(proposalAcceptance(proposal, "x".repeat(2001), NOTES_FILE, ""), { ok: false, reason: "too_long" });
  assert.deepEqual(proposalAcceptance(proposal, "ok", NEW_TOPIC, "!!!"), { ok: false, reason: "bad_topic" });
  assert.deepEqual(proposalAcceptance(proposal, "ok", "memory.md", ""), { ok: false, reason: "bad_topic" });
  assert.equal(oneLine(" a \n b\t c "), "a b c");
});

test("every key the tab and the memory extras build exists, in every language", () => {
  const built = [
    ...["on", "paused", "finished"].map((s) => routineStateWords(s).key),
    ...["queued", "running", "needs_input", "completed", "failed", "missed", "skipped", "interrupted", "weird"].map((s) => runStateWords(s).key),
    ...["no_change", "report", "unknown", "source_failed"].map(runOutcomeKey),
    ...["days", "hours", "minutes"].flatMap((unit) => ["single", "one", "few", "many", "other"].map((form) => `agentAutomation.schedule.every.${unit}.${form}`)),
    ...["daily", "weekdays", "weekends", "onDays", "once", "cron", "manual", "unreadable"].map((k) => `agentAutomation.schedule.${k}`),
    "agentAutomation.routine.next",
    "agentSettings.tab.routines",
    ...["one", "few", "many", "other"].map((form) => `agentAutomation.rooms.members.${form}`),
  ];
  for (const key of built) assert.ok(key in en, key);
  const english = Object.keys(agentsAutomationMessages.en).sort();
  for (const [locale, table] of Object.entries(agentsAutomationMessages)) {
    assert.deepEqual(Object.keys(table).sort(), english, locale);
    for (const [key, value] of Object.entries(table)) {
      assert.ok(value.trim(), `${locale} ${key}`);
      // Placeholders survive translation.
      const want = (agentsAutomationMessages.en[key].match(/\{\w+\}/g) ?? []).sort();
      const got = (value.match(/\{\w+\}/g) ?? []).sort();
      assert.deepEqual([...new Set(got)], [...new Set(want)], `${locale} ${key}`);
    }
  }
});
