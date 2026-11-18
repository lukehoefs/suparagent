import assert from "node:assert/strict";
import { test } from "node:test";
import {
  anyActiveRun,
  anyRunActive,
  appActionWords,
  approvalModeFor,
  canToggle,
  cardIndexAfterRemoval,
  clearAllGrants,
  draftChanged,
  draftProblems,
  dayChipKey,
  formatDuration,
  grantableTools,
  groupAccount,
  hasAppGrants,
  legacyRoutinesHref,
  markBusy,
  newRoutineDraft,
  nextRunsWords,
  PANEL_EDGE_PX,
  PANEL_MIN_ROOM_PX,
  panelRoom,
  parseId,
  parseRoutinesView,
  previewFailure,
  replaceRoutine,
  ROUTINE_APP_TOOL_NAMES,
  ROUTINE_APP_TOOLS,
  routineApprovalModes,
  routineAppAccounts,
  routineCardStatus,
  routineDraft,
  routineHref,
  routineInput,
  routinesHref,
  ROUTINES_HREF,
  runMoment,
  runTriggerKey,
  runWorkSeconds,
  samePanel,
  schedulePreviewable,
  scheduleSaveProblem,
  scheduleSaveStep,
  selectAllGrants,
  selectableTools,
  setGroupAccount,
  shortMoment,
  sortRoutines,
  splitPlaceholder,
  timeZoneChoices,
  timeZoneOptions,
  toggleDay,
  toggleGrant,
  toolLabelKey,
  usesTimezone,
  weekdayName,
  WEEK_ORDER,
  zoneCity,
  ROUTINE_TABS,
  SCHEDULE_KIND_ORDER,
} from "./routines-page.ts";
import { ROUTINES_VIEW_HREF, routineRunsHref } from "./agent-automation.ts";
import { en } from "./i18n.ts";
import { routinesMessages } from "./locales/routines-extra.ts";

// Some ICU versions put a narrow no-break space before AM/PM.
const norm = (text) => text.replace(/\s/g, " ");
const params = (query) => new URLSearchParams(query);

const run = (patch = {}) => ({
  id: 1, routine_id: 1, trigger: "schedule", state: "completed", scheduled_for: null, thread_id: null, turn_id: null,
  result: null, error: null, waiting_since: null, waited_seconds: 0, attempt: 1, retry_of: null,
  started_at: null, finished_at: null, created_at: "2026-11-17T07:35:00Z", ...patch,
});

const routine = (patch = {}) => ({
  id: 4, agent_id: 2, name: "Production digest", prompt: "Summarise yesterday's production.",
  schedule_kind: "weekdays", schedule_spec: { days: [1, 2, 3, 4, 5], time: "07:35" }, timezone: "America/Tijuana",
  paused: false, paused_reason: null, next_run_at: "2026-11-17T15:35:00Z", run_limit_minutes: 30, approval_mode: "ask",
  approval_timeout_minutes: 30, catch_up_minutes: 60, quiet_reporting: false, retry_limit: 0, retry_delay_minutes: 5,
  last_run_at: null, created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-01T00:00:00Z", summary: "Mon–Fri at 07:35",
  status: "on", next_dates: ["2026-11-17T15:35:00Z", "2026-11-18T15:35:00Z", "2026-11-19T15:35:00Z"], webhook_enabled: false,
  latest_run: null, connected_app_grants: [], uninterrupted_access: false, ...patch,
});

test("addresses of the page, a routine and the new-routine form", () => {
  assert.equal(ROUTINES_HREF, "/routines/");
  assert.equal(routinesHref(), "/routines/");
  assert.equal(routinesHref({ kind: "new", agentId: null }), "/routines/?new=1");
  assert.equal(routinesHref({ kind: "new", agentId: 3 }), "/routines/?new=1&agent=3");
  assert.equal(routineHref(12), "/routines/?id=12");
  assert.equal(routineHref(12, "runs"), "/routines/?id=12&tab=runs");
  assert.equal(routineHref(12, "webhook"), "/routines/?id=12&tab=webhook");
  // The old dialog opened on a routine's runs.
  assert.equal(legacyRoutinesHref(7), "/routines/?id=7&tab=runs");
  assert.equal(legacyRoutinesHref(null), "/routines/");
});

test("the address reads back as the view, and odd values fall back", () => {
  assert.deepEqual(parseRoutinesView(params("")), { kind: "list" });
  assert.deepEqual(parseRoutinesView(params("id=12")), { kind: "routine", id: 12, tab: "settings" });
  assert.deepEqual(parseRoutinesView(params("id=12&tab=runs")), { kind: "routine", id: 12, tab: "runs" });
  assert.deepEqual(parseRoutinesView(params("id=12&tab=nope")), { kind: "routine", id: 12, tab: "settings" });
  assert.deepEqual(parseRoutinesView(params("new=1&agent=5")), { kind: "new", agentId: 5 });
  assert.deepEqual(parseRoutinesView(params("new=1&agent=x")), { kind: "new", agentId: null });
  assert.deepEqual(parseRoutinesView(params("id=0")), { kind: "list" });
  assert.deepEqual(parseRoutinesView(params("id=-3&new=1")), { kind: "new", agentId: null });
  for (const view of [{ kind: "list" }, { kind: "new", agentId: 2 }, { kind: "routine", id: 9, tab: "webhook" }]) {
    assert.deepEqual(parseRoutinesView(params(routinesHref(view).split("?")[1] ?? "")), view);
  }
  assert.equal(parseId("007"), 7);
  assert.equal(parseId("1e3"), null);
  assert.equal(parseId(null), null);
});

test("the same panel ignores the tab", () => {
  assert.equal(samePanel({ kind: "routine", id: 1, tab: "runs" }, { kind: "routine", id: 1, tab: "settings" }), true);
  assert.equal(samePanel({ kind: "routine", id: 1, tab: "runs" }, { kind: "routine", id: 2, tab: "runs" }), false);
  assert.equal(samePanel({ kind: "new", agentId: 1 }, { kind: "new", agentId: 2 }), true);
  assert.equal(samePanel({ kind: "list" }, { kind: "new", agentId: null }), false);
});

test("routines by name, then id; a newer copy replaces the old one", () => {
  const list = [routine({ id: 3, name: "b" }), routine({ id: 2, name: "a" }), routine({ id: 1, name: "b" })];
  assert.deepEqual(sortRoutines(list).map((r) => r.id), [2, 1, 3]);
  const replaced = replaceRoutine(list, routine({ id: 2, name: "a", paused: true }));
  assert.equal(replaced.find((r) => r.id === 2).paused, true);
  assert.equal(replaced.length, 3);
  assert.equal(replaceRoutine(list, routine({ id: 9 })).length, 4);
});

test("the card says what is going on: an active run first, then paused, then the last run", () => {
  assert.deepEqual(routineCardStatus(routine()), { tone: "idle", key: "routines.card.notRunYet" });
  // The card's own shorter words for a finished and a waiting run (design: "Done", "Needs review").
  assert.deepEqual(routineCardStatus(routine({ latest_run: run() })), { tone: "done", key: "routines.card.done" });
  assert.deepEqual(routineCardStatus(routine({ latest_run: run({ state: "failed" }) })), { tone: "denied", key: "agentAutomation.run.state.failed" });
  assert.deepEqual(routineCardStatus(routine({ paused: true, status: "off", latest_run: run({ state: "failed" }) })), { tone: "idle", key: "agentAutomation.routine.state.paused" });
  // Run now works on a paused routine, and a run waiting for you must not hide behind "Paused".
  assert.deepEqual(routineCardStatus(routine({ paused: true, status: "off", latest_run: run({ state: "needs_input" }) })), { tone: "waiting", key: "routines.card.needsReview" });
  assert.deepEqual(routineCardStatus(routine({ latest_run: run({ state: "needs_input" }) })), { tone: "waiting", key: "routines.card.needsReview" });
  assert.deepEqual(routineCardStatus(routine({ latest_run: run({ state: "running" }) })), { tone: "running", key: "agentAutomation.run.state.running" });
  assert.deepEqual(routineCardStatus(routine({ schedule_kind: "once", status: "done", next_run_at: null })), { tone: "idle", key: "agentAutomation.routine.state.finished" });
});

test("the next three dates in the routine's own zone, or why there are none", () => {
  const next = nextRunsWords(routine(), "en-US");
  assert.equal(next.key, "routines.next.dates");
  assert.equal(norm(next.params.dates), "Tue Nov 17, 7:35 AM · Wed Nov 18, 7:35 AM · Thu Nov 19, 7:35 AM");
  assert.deepEqual(next.dates.map(norm), ["Tue Nov 17, 7:35 AM", "Wed Nov 18, 7:35 AM", "Thu Nov 19, 7:35 AM"]);
  // A 24-hour language keeps two-digit hours, as the design writes them.
  assert.equal(nextRunsWords(routine(), "en-GB").dates[0], "Tue 17 Nov, 07:35");
  assert.deepEqual(nextRunsWords(routine({ paused: true, status: "off" }), "en-US"), { key: "routines.next.paused" });
  assert.deepEqual(nextRunsWords(routine({ schedule_kind: "once", status: "done", next_run_at: null }), "en-US"), { key: "routines.next.finished" });
  assert.equal(nextRunsWords(routine({ schedule_kind: "manual", next_dates: [], next_run_at: null }), "en-US"), null);
  assert.deepEqual(nextRunsWords(routine({ next_dates: [], next_run_at: null }), "en-US"), { key: "routines.next.none" });
  const fallback = nextRunsWords(routine({ next_dates: [] }), "en-US");
  assert.equal(norm(fallback.params.dates), "Tue Nov 17, 7:35 AM");
});

test("the panel beside the list is as tall as the room below its top, so Save is in view", () => {
  // Opened under the page heading (top 101) in a 900 px view: it ends 16 px above the bottom.
  assert.equal(panelRoom(101, 900), 783);
  // Scrolled, it sticks 16 px from the top: never measured from above that.
  assert.equal(panelRoom(16, 900), 868);
  assert.equal(panelRoom(-40, 900), 868);
  // A very short view still leaves room for a few fields and the Save bar.
  assert.equal(panelRoom(700, 800), PANEL_MIN_ROOM_PX);
  assert.equal(PANEL_EDGE_PX, 16);
});

test("a message splits around its placeholder, so the card can keep each date on one line", () => {
  assert.deepEqual(splitPlaceholder("Next: {dates}", "dates"), ["Next: ", ""]);
  assert.deepEqual(splitPlaceholder("{dates} next", "dates"), ["", " next"]);
  assert.equal(splitPlaceholder("Next", "dates"), null);
  assert.equal(splitPlaceholder("{dates} and {dates}", "dates"), null);
  for (const [locale, table] of Object.entries(routinesMessages)) assert.ok(splitPlaceholder(table["routines.next.dates"], "dates"), locale);
});

test("a finished one-time routine cannot be switched back on", () => {
  assert.equal(canToggle(routine()), true);
  assert.equal(canToggle(routine({ paused: true, status: "off" })), true);
  assert.equal(canToggle(routine({ schedule_kind: "once", status: "done", next_run_at: null })), false);
});

test("a new draft takes the agent asked for when it is live, else the first live agent", () => {
  const agents = [{ id: 1, archived_at: "2026-01-01" }, { id: 2, archived_at: null }, { id: 3, archived_at: null }];
  assert.equal(newRoutineDraft(agents, 3, "UTC").agentId, 3);
  assert.equal(newRoutineDraft(agents, 1, "UTC").agentId, 2);
  assert.equal(newRoutineDraft(agents, null, "UTC").agentId, 2);
  assert.equal(newRoutineDraft([], null, "UTC").agentId, null);
  const draft = newRoutineDraft(agents, null, "Europe/Berlin");
  assert.equal(draft.schedule.timezone, "Europe/Berlin");
  assert.equal(draft.approvalMode, "ask");
  assert.deepEqual(draft.connectedAppGrants, []);
  assert.equal(draft.uninterruptedAccess, false);
});

test("approval modes follow the engine; one it lacks falls back to Ask first", () => {
  assert.deepEqual(routineApprovalModes("claude"), ["ask", "accept_edits", "approve_for_me", "plan"]);
  assert.deepEqual(routineApprovalModes("gemini"), ["ask", "accept_edits", "plan"]);
  assert.equal(approvalModeFor("approve_for_me", "gemini"), "ask");
  assert.equal(approvalModeFor("plan", "gemini"), "plan");
});

test("a saved routine round-trips through the draft unchanged", () => {
  const saved = routine({ approval_mode: "plan", retry_limit: 2, connected_app_grants: [{ tool: "gmail_fetch_emails", account_id: "ca_1" }], uninterrupted_access: true });
  const draft = routineDraft(saved, "claude");
  assert.equal(draft.id, 4);
  assert.equal(draft.retryLimit, "2");
  const input = routineInput(draft);
  assert.equal(input.agent_id, 2);
  assert.equal(input.schedule_kind, "weekdays");
  assert.deepEqual(input.schedule_spec, { days: [1, 2, 3, 4, 5], time: "07:35" });
  assert.equal(input.timezone, "America/Tijuana");
  assert.equal(input.approval_mode, "plan");
  assert.equal(input.retry_limit, 2);
  assert.equal(input.uninterrupted_access, true);
  assert.deepEqual(input.connected_app_grants, [{ tool: "gmail_fetch_emails", account_id: "ca_1" }]);
  assert.equal(draftChanged(draft, routineDraft(saved, "claude")), false);
  // Trailing spaces are trimmed on save, so they are not a change; another word is.
  assert.equal(draftChanged(draft, { ...draft, name: `${draft.name}  ` }), false);
  assert.equal(draftChanged(draft, { ...draft, name: "Other" }), true);
  assert.equal(draftChanged(draft, { ...draft, schedule: { ...draft.schedule, days: [1, 2, 3] } }), true);
  // Grant order does not matter.
  const two = { ...draft, connectedAppGrants: [{ tool: "a", account_id: "1" }, { tool: "b", account_id: "1" }] };
  assert.equal(draftChanged(two, { ...two, connectedAppGrants: [...two.connectedAppGrants].reverse() }), false);
  // A mode the engine lacks is shown as Ask first.
  assert.equal(routineDraft(routine({ approval_mode: "approve_for_me" }), "gemini").approvalMode, "ask");
});

test("the draft's problems name the field and the range", () => {
  const ok = newRoutineDraft([{ id: 1, archived_at: null }], null, "UTC");
  assert.deepEqual(draftProblems({ ...ok, name: "Digest", prompt: "Do it" }), {});
  const bad = draftProblems({
    ...ok, name: " ", prompt: "", agentId: null, runLimit: "0", approvalWait: "1.5", catchUp: "", retryLimit: "4", retryDelay: "1441",
    schedule: { ...ok.schedule, days: [] },
  });
  assert.deepEqual(Object.keys(bad).sort(), ["agent", "approvalWait", "catchUp", "days", "name", "prompt", "retryDelay", "retryLimit", "runLimit"]);
  assert.deepEqual(bad.runLimit, { key: "routines.problem.range", params: { min: 1, max: 240 } });
  assert.deepEqual(bad.retryLimit, { key: "routines.problem.range", params: { min: 0, max: 3 } });
  const interval = draftProblems({ ...ok, name: "a", prompt: "b", schedule: { ...ok.schedule, kind: "interval", everyMinutes: "4" } });
  assert.deepEqual(interval, { everyMinutes: { key: "routines.problem.range", params: { min: 5, max: 10080 } } });
  // Days only matter for the weekdays kind.
  assert.deepEqual(draftProblems({ ...ok, name: "a", prompt: "b", schedule: { ...ok.schedule, kind: "manual", days: [] } }), {});
});

test("days toggle in schedule order; the week starts on Monday", () => {
  assert.deepEqual(WEEK_ORDER, [1, 2, 3, 4, 5, 6, 0]);
  assert.deepEqual(toggleDay([1, 2, 3], 2), [1, 3]);
  assert.deepEqual(toggleDay([3, 1], 0), [0, 1, 3]);
  assert.equal(weekdayName(1, "en-US"), "Mon");
  assert.equal(weekdayName(0, "en-US", "long"), "Sunday");
  // ICU versions differ on the full stop ("Mo." or "Mo").
  assert.match(weekdayName(1, "de"), /^Mo\.?$/);
  // The day buttons' short labels are each language's own, and no two days look alike.
  assert.deepEqual(WEEK_ORDER.map((day) => routinesMessages.en[dayChipKey(day)]), ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]);
  for (const [locale, table] of Object.entries(routinesMessages)) {
    const labels = WEEK_ORDER.map((day) => table[dayChipKey(day)]);
    assert.equal(new Set(labels.map((label) => label.toLowerCase())).size, 7, locale);
  }
  assert.equal(usesTimezone("weekdays"), true);
  assert.equal(usesTimezone("cron"), true);
  assert.equal(usesTimezone("once"), true);
  assert.equal(usesTimezone("interval"), false);
  assert.equal(usesTimezone("manual"), false);
});

test("an incomplete schedule is not sent for its next dates", () => {
  const base = newRoutineDraft([{ id: 1, archived_at: null }], null, "UTC").schedule;
  assert.equal(schedulePreviewable(base), true);
  assert.equal(schedulePreviewable({ ...base, days: [] }), false);
  assert.equal(schedulePreviewable({ ...base, time: "" }), false);
  assert.equal(schedulePreviewable({ ...base, kind: "interval", everyMinutes: "4" }), false);
  assert.equal(schedulePreviewable({ ...base, kind: "interval", everyMinutes: "90" }), true);
  assert.equal(schedulePreviewable({ ...base, kind: "cron", expression: "  " }), false);
  assert.equal(schedulePreviewable({ ...base, kind: "once", at: "" }), false);
  assert.equal(schedulePreviewable({ ...base, kind: "once", at: "2026-12-01T09:00" }), true);
  assert.equal(schedulePreviewable({ ...base, kind: "manual" }), true);
});

test("time zones always offer UTC and the routine's own zone", () => {
  assert.deepEqual(timeZoneChoices("Mars/Base", ["Europe/Berlin"]), ["Mars/Base", "UTC", "Europe/Berlin"]);
  assert.deepEqual(timeZoneChoices("Europe/Berlin", ["Europe/Berlin", "UTC"]), ["Europe/Berlin", "UTC"]);
  assert.ok(timeZoneChoices("UTC").includes("UTC"));
  assert.equal(norm(shortMoment("2026-11-17T15:35:00Z", "en-US", "America/Tijuana")), "Tue Nov 17, 7:35 AM");
  assert.equal(shortMoment("2026-11-17T15:35:00Z", "en-GB", "America/Tijuana"), "Tue 17 Nov, 07:35");
  assert.equal(shortMoment(null, "en-US", "UTC"), "");
  assert.equal(shortMoment("not a date", "en-US", "UTC"), "");
});

test("the time zone picker names each zone by its city and keeps the IANA name as the value", () => {
  assert.equal(zoneCity("America/Tijuana"), "Tijuana");
  assert.equal(zoneCity("America/Argentina/Buenos_Aires"), "Buenos Aires");
  assert.equal(zoneCity("UTC"), null);
  assert.equal(zoneCity("Etc/GMT+5"), null);
  const label = (city) => `${city} time`;
  assert.deepEqual(timeZoneOptions(["UTC", "America/Tijuana", "Europe/Berlin"], label, "en"), [
    { value: "Europe/Berlin", label: "Berlin time" },
    { value: "America/Tijuana", label: "Tijuana time" },
    { value: "UTC", label: "UTC" },
  ]);
  // Two zones named after the same city show their IANA names, so the choices stay apart.
  assert.deepEqual(
    timeZoneOptions(["America/Kentucky/Louisville", "America/Louisville"], label, "en").map((option) => option.label),
    ["America/Kentucky/Louisville", "America/Louisville"],
  );
  assert.equal(routinesMessages.en["routines.zone.city"], "{city} time");
});

const agent = (patch = {}) => ({ connector_scopes: { gmail: "read", github: "write" }, connector_account_scopes: { gmail: ["ca_g1", "ca_g2"], github: ["ca_h"] }, ...patch });
const accounts = [
  { id: "ca_g1", toolkit: "gmail", alias: "Work", status: "ACTIVE", created_at: null, updated_at: null },
  { id: "ca_g2", toolkit: "gmail", alias: null, status: "ACTIVE", created_at: null, updated_at: null },
  { id: "ca_g3", toolkit: "gmail", alias: null, status: "ACTIVE", created_at: null, updated_at: null },
  { id: "ca_h", toolkit: "github", alias: null, status: "ACTIVE", created_at: null, updated_at: null },
  { id: "ca_c", toolkit: "googlecalendar", alias: null, status: "EXPIRED", created_at: null, updated_at: null },
];
const group = (app) => ROUTINE_APP_TOOLS.find((g) => g.app === app);

test("an app offers its accounts only when the agent may use them", () => {
  assert.deepEqual(routineAppAccounts(agent(), accounts, "gmail").map((a) => a.id), ["ca_g1", "ca_g2"]);
  assert.deepEqual(routineAppAccounts(agent({ connector_scopes: {} }), accounts, "gmail"), []);
  assert.deepEqual(routineAppAccounts(agent(), accounts, "googlecalendar"), []);
  assert.deepEqual(routineAppAccounts(null, accounts, "gmail"), []);
  assert.deepEqual(routineAppAccounts(agent(), null, "gmail"), []);
  // Read access offers reads only; write access adds the writes.
  assert.deepEqual(grantableTools(agent(), accounts, group("gmail")), [...group("gmail").reads]);
  assert.deepEqual(grantableTools(agent(), accounts, group("github")), [...group("github").reads, ...group("github").writes]);
  const all = selectableTools(agent(), accounts);
  assert.ok(all.has("gmail_fetch_emails"));
  assert.ok(!all.has("gmail_send_email"));
  assert.ok(all.has("github_create_pull_request"));
  assert.ok(!all.has("googlecalendar_list_events"));
});

test("grants toggle, move account, select all and clear", () => {
  let grants = toggleGrant([], "gmail_fetch_emails", "ca_g1");
  assert.deepEqual(grants, [{ tool: "gmail_fetch_emails", account_id: "ca_g1" }]);
  assert.equal(hasAppGrants(grants), true);
  grants = setGroupAccount([...grants, { tool: "github_get_file", account_id: "ca_h" }], group("gmail"), "ca_g2");
  assert.deepEqual(grants, [{ tool: "gmail_fetch_emails", account_id: "ca_g2" }, { tool: "github_get_file", account_id: "ca_h" }]);
  assert.equal(groupAccount(grants, group("gmail"), routineAppAccounts(agent(), accounts, "gmail")), "ca_g2");
  // An account no longer allowed falls back to the first allowed one.
  assert.equal(groupAccount([{ tool: "gmail_fetch_emails", account_id: "ca_g3" }], group("gmail"), routineAppAccounts(agent(), accounts, "gmail")), "ca_g1");
  const selected = selectAllGrants(grants, agent(), accounts);
  assert.ok(selected.every((g) => !g.tool.startsWith("gmail_") || g.account_id === "ca_g2"));
  assert.equal(selected.filter((g) => g.tool.startsWith("gmail_")).length, group("gmail").reads.length);
  assert.equal(selected.filter((g) => g.tool.startsWith("github_")).length, group("github").reads.length + group("github").writes.length);
  assert.deepEqual(toggleGrant(grants, "gmail_fetch_emails", "ca_g2"), [{ tool: "github_get_file", account_id: "ca_h" }]);
  const other = { tool: "something_else", account_id: "x" };
  assert.deepEqual(clearAllGrants([...selected, other]), [other]);
  assert.equal(hasAppGrants([other]), false);
});

test("every routine app action has a label in every language", () => {
  for (const tool of ROUTINE_APP_TOOL_NAMES) assert.ok(toolLabelKey(tool) in en, tool);
  for (const [locale, table] of Object.entries(routinesMessages)) {
    assert.deepEqual(Object.keys(table).sort(), Object.keys(routinesMessages.en).sort(), locale);
  }
});

test("every placeholder in English is kept in every language", () => {
  const holes = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
  for (const [locale, table] of Object.entries(routinesMessages)) {
    for (const [key, text] of Object.entries(routinesMessages.en)) {
      assert.deepEqual(holes(table[key]), holes(text), `${locale} ${key}`);
      assert.ok(table[key].trim().length > 0, `${locale} ${key}`);
      assert.ok(!/\[[A-Z ]+\]/.test(table[key]), `${locale} ${key} has a placeholder in brackets`);
    }
  }
});

test("run words: trigger, moment, work time without the wait", () => {
  assert.equal(runTriggerKey("schedule"), "routines.trigger.schedule");
  assert.equal(runTriggerKey("webhook"), "routines.trigger.webhook");
  assert.equal(runTriggerKey("other"), "routines.trigger.unknown");
  assert.equal(runMoment(run({ scheduled_for: "a", started_at: "b" })), "a");
  assert.equal(runMoment(run({ started_at: "b" })), "b");
  assert.equal(runMoment(run()), "2026-11-17T07:35:00Z");
  assert.equal(runWorkSeconds(run({ started_at: "2026-11-17T07:35:00Z", finished_at: "2026-11-17T07:45:00Z", waited_seconds: 120 })), 480);
  assert.equal(runWorkSeconds(run({ started_at: "2026-11-17T07:35:00Z" })), null);
  assert.equal(runWorkSeconds(run({ started_at: "2026-11-17T07:35:00Z", finished_at: "2026-11-17T07:30:00Z" })), null);
  assert.equal(norm(formatDuration(45, "en-US")), "45 sec");
  assert.equal(norm(formatDuration(480, "en-US")), "8 min");
  assert.equal(norm(formatDuration(5400, "en-US")), "1.5 hr");
  assert.equal(anyRunActive([run(), run({ state: "queued" })]), true);
  assert.equal(anyRunActive([run()]), false);
  assert.equal(anyRunActive(null), false);
  assert.equal(anyActiveRun([routine({ latest_run: run({ state: "needs_input" }) })]), true);
  assert.equal(anyActiveRun([routine()]), false);
});

test("app action receipts read as a word and a dot", () => {
  assert.deepEqual(appActionWords("completed"), { tone: "done", key: "routines.action.completed" });
  assert.deepEqual(appActionWords("refused"), { tone: "denied", key: "routines.action.refused" });
  assert.deepEqual(appActionWords("outcome_unknown"), { tone: "waiting", key: "routines.action.outcome_unknown" });
  assert.deepEqual(appActionWords("reserved"), { tone: "running", key: "routines.action.reserved" });
  assert.deepEqual(appActionWords("odd"), { tone: "idle", key: "routines.action.unknown" });
  for (const status of ["completed", "failed", "refused", "outcome_unknown", "reserved", "odd"]) {
    assert.ok(appActionWords(status).key in en, status);
  }
});

test("the agent settings links land on the page", () => {
  assert.equal(ROUTINES_VIEW_HREF, ROUTINES_HREF);
  assert.equal(routineRunsHref(12), routineHref(12, "runs"));
  // New routine opens the form with that agent chosen; Edit opens that routine's editor.
  assert.deepEqual(parseRoutinesView(params(routinesHref({ kind: "new", agentId: 3 }).split("?")[1])), { kind: "new", agentId: 3 });
  assert.deepEqual(parseRoutinesView(params(routineHref(12).split("?")[1])), { kind: "routine", id: 12, tab: "settings" });
});

test("each card's action in flight is its own", () => {
  const none = new Map();
  const a = markBusy(none, 1, "toggle");
  const ab = markBusy(a, 2, "run");
  assert.equal(none.size, 0, "the map given is not changed");
  assert.deepEqual([...ab], [[1, "toggle"], [2, "run"]]);
  // Card 1's reply frees card 1 only: card 2's request is still on its way.
  assert.deepEqual([...markBusy(ab, 1, null)], [[2, "run"]]);
  assert.deepEqual([...markBusy(none, 5, null)], []);
});

test("after a delete, focus goes to the card now in its place, else the one before", () => {
  assert.equal(cardIndexAfterRemoval(0, 3), 0);
  assert.equal(cardIndexAfterRemoval(1, 3), 1);
  assert.equal(cardIndexAfterRemoval(3, 3), 2, "the last one deleted: the one before it");
  assert.equal(cardIndexAfterRemoval(0, 0), null, "none left");
  assert.equal(cardIndexAfterRemoval(-1, 2), 0, "not found in the list: the first");
});

test("the schedule check: refused is not valid, no answer is only unchecked", () => {
  assert.equal(previewFailure(422), "invalid");
  assert.equal(previewFailure(400), "invalid");
  for (const status of [500, 502, 503, 401, 0, null, undefined]) assert.equal(previewFailure(status), "failed", String(status));
});

test("Save waits for the schedule check instead of refusing", () => {
  assert.equal(scheduleSaveStep(false, null), "incomplete");
  assert.equal(scheduleSaveStep(false, "valid"), "incomplete");
  assert.equal(scheduleSaveStep(true, "valid"), "save");
  assert.equal(scheduleSaveStep(true, "invalid"), "refused");
  assert.equal(scheduleSaveStep(true, null), "check", "still on its way: wait for it");
  assert.equal(scheduleSaveStep(true, "failed"), "check", "no answer: ask again");
  assert.equal(scheduleSaveProblem(false, null), "routines.problem.schedule");
  assert.equal(scheduleSaveProblem(true, "invalid"), "routines.problem.schedule");
  assert.equal(scheduleSaveProblem(true, "failed"), "routines.problem.scheduleUnchecked");
  assert.equal(scheduleSaveProblem(true, null), null, "nothing to say while it is checked");
  assert.equal(scheduleSaveProblem(true, "valid"), null);
});

test("every schedule kind and approval mode the editor offers has its words", () => {
  for (const kind of SCHEDULE_KIND_ORDER) assert.ok(`routines.kind.${kind}` in en, kind);
  for (const mode of routineApprovalModes("claude")) {
    assert.ok(`routines.mode.${mode}` in en, mode);
    assert.ok(`routines.mode.${mode}.help` in en, mode);
  }
  for (const tab of ROUTINE_TABS) assert.ok(`routines.tab.${tab}` in en, tab);
});

test("every message key the page's rules return exists", () => {
  const keys = [
    routineCardStatus(routine()).key,
    routineCardStatus(routine({ latest_run: run() })).key,
    routineCardStatus(routine({ latest_run: run({ state: "needs_input" }) })).key,
    "routines.schedule.advanced", "routines.zone.city",
    ...WEEK_ORDER.map(dayChipKey),
    nextRunsWords(routine(), "en").key,
    nextRunsWords(routine({ paused: true, status: "off" }), "en").key,
    nextRunsWords(routine({ schedule_kind: "once", status: "done", next_run_at: null }), "en").key,
    nextRunsWords(routine({ next_dates: [], next_run_at: null }), "en").key,
    "routines.problem.required", "routines.problem.agent", "routines.problem.days", "routines.problem.range",
    scheduleSaveProblem(false, null), scheduleSaveProblem(true, "failed"),
    "routines.preview.failed", "routines.preview.retry", "routines.delete.failed",
    ...["schedule", "manual", "webhook", "retry", "x"].map(runTriggerKey),
  ];
  for (const key of keys) assert.ok(key in en, key);
});
