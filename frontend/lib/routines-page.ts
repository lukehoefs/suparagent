// Pure rules for the Routines page (/routines/, design: Routines.html): its address, what each card
// says, the editor's draft and checks, the connected-app grants and the run history's words. No
// React and no network, so node tests load it. Words come back as message keys
// (lib/locales/routines-extra.ts, plus the routine words of lib/locales/agents-automation-extra.ts)
// for the caller to translate; dates are formatted with Intl in the reader's language.
import type { Agent, ApprovalMode, ConnectedAppGrant, Routine, RoutineInput, RoutineRun } from "./api";
import type { ComposioAccount } from "./connected-apps";
import { activeAgents, approvalModesForProvider } from "./agents.ts";
import { formatMoment, routineState, runStateWords, type Tone, type Words } from "./agent-automation.ts";
import { browserTimezone, emptySchedule, isActiveRun, scheduleDraftOf, scheduleSpec, type ScheduleDraft } from "./routines.ts";

// --- the address -------------------------------------------------------------------------

/** Static export: a query string, never an [id] folder, and a trailing slash (next.config.ts). */
export const ROUTINES_HREF = "/routines/";

export const ROUTINE_TABS = ["settings", "runs", "webhook"] as const;
export type RoutineTab = (typeof ROUTINE_TABS)[number];

/** What the page shows beside the list: nothing, the new-routine form, or one routine's panel. */
export type RoutinesView =
  | { kind: "list" }
  | { kind: "new"; agentId: number | null }
  | { kind: "routine"; id: number; tab: RoutineTab };

export function routinesHref(view: RoutinesView = { kind: "list" }): string {
  if (view.kind === "new") return view.agentId ? `${ROUTINES_HREF}?new=1&agent=${view.agentId}` : `${ROUTINES_HREF}?new=1`;
  if (view.kind === "routine") return view.tab === "settings" ? `${ROUTINES_HREF}?id=${view.id}` : `${ROUTINES_HREF}?id=${view.id}&tab=${view.tab}`;
  return ROUTINES_HREF;
}

/** One routine on the Routines page, on its settings or another tab. */
export function routineHref(id: number, tab: RoutineTab = "settings"): string {
  return routinesHref({ kind: "routine", id, tab });
}

/** A positive whole number from the address, or null. */
export function parseId(value: string | null | undefined): number | null {
  if (!value || !/^\d{1,9}$/.test(value)) return null;
  const id = Number(value);
  return id > 0 ? id : null;
}

/** ?id= opens a routine (on ?tab=, settings by default); ?new=1 the new-routine form (?agent= chosen). */
export function parseRoutinesView(params: { get(name: string): string | null }): RoutinesView {
  const id = parseId(params.get("id"));
  if (id !== null) {
    const tab = params.get("tab");
    return { kind: "routine", id, tab: (ROUTINE_TABS as readonly string[]).includes(tab ?? "") ? (tab as RoutineTab) : "settings" };
  }
  if (params.get("new") === "1") return { kind: "new", agentId: parseId(params.get("agent")) };
  return { kind: "list" };
}

/** The same panel: the same routine (any tab), or the new-routine form. */
export function samePanel(a: RoutinesView, b: RoutinesView): boolean {
  if (a.kind === "routine" && b.kind === "routine") return a.id === b.id;
  return a.kind === b.kind;
}

/**
 * Where the old Routines dialog's address (/chat/?view=routines&routine=12) goes now: the page,
 * on that routine's runs, since that is what the dialog opened on.
 */
export function legacyRoutinesHref(routineId: number | null): string {
  return routineId === null ? ROUTINES_HREF : routineHref(routineId, "runs");
}

// --- the list ----------------------------------------------------------------------------

/** By name, then by id, so the order holds while the list refreshes. */
export function sortRoutines<T extends Pick<Routine, "id" | "name">>(routines: readonly T[]): T[] {
  return [...routines].sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id);
}

/** The list with one routine swapped for its newer copy (or added when it is new). */
export function replaceRoutine<T extends Pick<Routine, "id">>(routines: readonly T[], next: T): T[] {
  return routines.some((item) => item.id === next.id) ? routines.map((item) => (item.id === next.id ? next : item)) : [...routines, next];
}

/** A card's own action in flight: Run now, or the on/off switch. */
export type CardAction = "run" | "toggle";

/** The card actions in flight with one routine's set (or cleared, with null); the others stay as they are. */
export function markBusy(busy: ReadonlyMap<number, CardAction>, id: number, action: CardAction | null): Map<number, CardAction> {
  const next = new Map(busy);
  if (action) next.set(id, action);
  else next.delete(id);
  return next;
}

/**
 * Which card takes focus once the one at `removed` is gone and `remaining` are left: the one now in
 * its place, else the one before it; null when the list is empty.
 */
export function cardIndexAfterRemoval(removed: number, remaining: number): number | null {
  if (remaining <= 0) return null;
  return Math.min(Math.max(removed, 0), remaining - 1);
}

/** How far the panel beside the list keeps from the top (where it sticks) and the bottom of the view. */
export const PANEL_EDGE_PX = 16;
/** The least height the panel beside the list gets, however low it starts: a few fields and the Save bar. */
export const PANEL_MIN_ROOM_PX = 320;

/**
 * The height the panel beside the list may take, so its Save bar is in view: from its top (never
 * above where it sticks) to 16 px above the bottom of what can be seen, and never less than the least.
 */
export function panelRoom(top: number, bottom: number): number {
  return Math.max(PANEL_MIN_ROOM_PX, Math.floor(bottom - Math.max(top, PANEL_EDGE_PX) - PANEL_EDGE_PX));
}

/** True while any routine has a run queued, running or waiting for an answer. */
export function anyActiveRun(routines: readonly Pick<Routine, "latest_run">[] | null): boolean {
  return routines?.some((routine) => isActiveRun(routine.latest_run)) ?? false;
}

type CardRoutine = Pick<Routine, "paused" | "next_run_at" | "schedule_kind" | "latest_run"> & { status?: string };

// The card's own shorter words for a finished and a waiting run (design: "Done", "Needs review");
// the Runs tab keeps the run's full words (agentAutomation.run.state.*). The dot stays the run's.
const CARD_RUN_KEYS: Readonly<Record<string, string>> = {
  completed: "routines.card.done",
  needs_input: "routines.card.needsReview",
};

function cardRunWords(state: string): { tone: Tone; key: string } {
  const words = runStateWords(state);
  const key = CARD_RUN_KEYS[state];
  return key ? { tone: words.tone, key } : words;
}

/**
 * The card's word and dot. A run that is going (or waiting for you) says so even on a paused
 * routine, since Run now works while paused; then Paused; then how the last run ended.
 */
export function routineCardStatus(routine: CardRoutine): { tone: Tone; key: string } {
  const run = routine.latest_run;
  if (run && isActiveRun(run)) return cardRunWords(run.state);
  const state = routineState(routine);
  if (state === "paused") return { tone: "idle", key: "agentAutomation.routine.state.paused" };
  if (run) return cardRunWords(run.state);
  if (state === "finished") return { tone: "idle", key: "agentAutomation.routine.state.finished" };
  return { tone: "idle", key: "routines.card.notRunYet" };
}

/** The card's "Next:" words, with each date on its own so the card can keep a date on one line. */
export type NextRuns = Words & { dates?: string[] };

/**
 * The card's "Next:" line: the next three dates the server computed, in the routine's own time
 * zone (the one its schedule is written in), each said briefly ("Wed Nov 18, 7:35 AM"). Null for a
 * routine that runs only by hand.
 */
export function nextRunsWords(
  routine: Pick<Routine, "paused" | "next_run_at" | "schedule_kind" | "timezone"> & { status?: string; next_dates?: string[] },
  locale: string,
): NextRuns | null {
  const state = routineState(routine);
  if (state === "paused") return { key: "routines.next.paused" };
  if (state === "finished") return { key: "routines.next.finished" };
  if (routine.schedule_kind === "manual") return null;
  const zone = routine.timezone || undefined;
  const dates = (routine.next_dates ?? []).slice(0, 3).map((iso) => shortMoment(iso, locale, zone)).filter(Boolean);
  if (dates.length === 0) {
    const one = shortMoment(routine.next_run_at, locale, zone);
    if (one) dates.push(one);
  }
  return dates.length > 0 ? { key: "routines.next.dates", params: { dates: dates.join(" · ") }, dates } : { key: "routines.next.none" };
}

/**
 * The text before and after a placeholder in a message ("Next: {dates}" → ["Next: ", ""]), so the
 * caller can lay out what goes in it; null when the message has it not exactly once.
 */
export function splitPlaceholder(template: string, name: string): [string, string] | null {
  const hole = `{${name}}`;
  const at = template.indexOf(hole);
  if (at < 0 || template.includes(hole, at + hole.length)) return null;
  return [template.slice(0, at), template.slice(at + hole.length)];
}

/** Whether the on/off switch can change anything: a finished one-time routine needs a new date. */
export function canToggle(routine: Pick<Routine, "paused" | "next_run_at" | "schedule_kind"> & { status?: string }): boolean {
  return routineState(routine) !== "finished";
}

// --- the editor --------------------------------------------------------------------------

export type RoutineDraft = {
  id: number | null;
  name: string;
  agentId: number | null;
  prompt: string;
  schedule: ScheduleDraft;
  runLimit: string;
  approvalMode: ApprovalMode;
  approvalWait: string;
  catchUp: string;
  quietReporting: boolean;
  retryLimit: string;
  retryDelay: string;
  connectedAppGrants: ConnectedAppGrant[];
  uninterruptedAccess: boolean;
};

/** A blank routine for the agent asked for (when it is live), else the first live agent. */
export function newRoutineDraft(
  agents: readonly Pick<Agent, "id" | "archived_at">[] | null,
  agentId: number | null = null,
  timezone: string = browserTimezone(),
): RoutineDraft {
  const live = activeAgents(agents as Agent[] | null);
  const chosen = live.find((agent) => agent.id === agentId)?.id ?? live[0]?.id ?? null;
  return {
    id: null, name: "", agentId: chosen, prompt: "", schedule: emptySchedule(timezone),
    runLimit: "30", approvalMode: "ask", approvalWait: "30", catchUp: "60",
    quietReporting: false, retryLimit: "0", retryDelay: "5", connectedAppGrants: [], uninterruptedAccess: false,
  };
}

/** The approval modes the agent's engine offers; "Approve for me" only where it exists. */
export function routineApprovalModes(provider: string | null | undefined): ApprovalMode[] {
  return approvalModesForProvider(provider).map((mode) => mode.value);
}

/** A mode the agent's engine cannot use falls back to Ask first. */
export function approvalModeFor(mode: ApprovalMode, provider: string | null | undefined): ApprovalMode {
  return routineApprovalModes(provider).includes(mode) ? mode : "ask";
}

/** The editor's draft for a saved routine. */
export function routineDraft(routine: Routine, provider?: string | null): RoutineDraft {
  return {
    id: routine.id,
    name: routine.name,
    agentId: routine.agent_id,
    prompt: routine.prompt,
    schedule: scheduleDraftOf(routine),
    runLimit: String(routine.run_limit_minutes),
    approvalMode: approvalModeFor(routine.approval_mode, provider),
    approvalWait: String(routine.approval_timeout_minutes),
    catchUp: String(routine.catch_up_minutes),
    quietReporting: routine.quiet_reporting ?? false,
    retryLimit: String(routine.retry_limit),
    retryDelay: String(routine.retry_delay_minutes),
    connectedAppGrants: routine.connected_app_grants ?? [],
    uninterruptedAccess: routine.uninterrupted_access ?? false,
  };
}

/** What Save sends: the full routine, the schedule shaped for its kind. The server checks it again. */
export function routineInput(draft: RoutineDraft): RoutineInput {
  return {
    agent_id: draft.agentId ?? 0,
    name: draft.name.trim(),
    prompt: draft.prompt.trim(),
    schedule_kind: draft.schedule.kind,
    schedule_spec: scheduleSpec(draft.schedule),
    timezone: draft.schedule.timezone.trim() || "UTC",
    run_limit_minutes: Number(draft.runLimit),
    approval_mode: draft.approvalMode,
    approval_timeout_minutes: Number(draft.approvalWait),
    catch_up_minutes: Number(draft.catchUp),
    quiet_reporting: draft.quietReporting,
    retry_limit: Number(draft.retryLimit),
    retry_delay_minutes: Number(draft.retryDelay),
    connected_app_grants: draft.connectedAppGrants,
    uninterrupted_access: draft.uninterruptedAccess,
  };
}

function comparable(draft: RoutineDraft): string {
  const input = routineInput(draft);
  const grants = [...input.connected_app_grants].sort((a, b) => a.tool.localeCompare(b.tool) || a.account_id.localeCompare(b.account_id));
  return JSON.stringify({ ...input, connected_app_grants: grants });
}

/** True when Save would send something other than what the draft started from. */
export function draftChanged(start: RoutineDraft, now: RoutineDraft): boolean {
  return comparable(start) !== comparable(now);
}

/** The ranges the server accepts (schemas and services/routine_service.py). */
export const LIMITS = {
  runLimit: [1, 240],
  approvalWait: [1, 1440],
  catchUp: [0, 1440],
  retryLimit: [0, 3],
  retryDelay: [1, 1440],
  everyMinutes: [5, 10080],
} as const satisfies Record<string, readonly [number, number]>;

export type DraftField = "name" | "agent" | "prompt" | "days" | keyof typeof LIMITS;

function inRange(value: string, [min, max]: readonly [number, number]): boolean {
  const text = value.trim();
  if (!/^\d+$/.test(text)) return false;
  const n = Number(text);
  return n >= min && n <= max;
}

/** What keeps the draft from being saved, field by field, as message keys. The server checks it too. */
export function draftProblems(draft: RoutineDraft): Partial<Record<DraftField, Words>> {
  const problems: Partial<Record<DraftField, Words>> = {};
  if (!draft.name.trim()) problems.name = { key: "routines.problem.required" };
  if (draft.agentId === null) problems.agent = { key: "routines.problem.agent" };
  if (!draft.prompt.trim()) problems.prompt = { key: "routines.problem.required" };
  if (draft.schedule.kind === "weekdays" && draft.schedule.days.length === 0) problems.days = { key: "routines.problem.days" };
  const numbers: [Exclude<keyof typeof LIMITS, "everyMinutes">, string][] = [
    ["runLimit", draft.runLimit], ["approvalWait", draft.approvalWait], ["catchUp", draft.catchUp],
    ["retryLimit", draft.retryLimit], ["retryDelay", draft.retryDelay],
  ];
  for (const [field, value] of numbers) {
    if (!inRange(value, LIMITS[field])) problems[field] = { key: "routines.problem.range", params: { min: LIMITS[field][0], max: LIMITS[field][1] } };
  }
  if (draft.schedule.kind === "interval" && !inRange(draft.schedule.everyMinutes, LIMITS.everyMinutes)) {
    problems.everyMinutes = { key: "routines.problem.range", params: { min: LIMITS.everyMinutes[0], max: LIMITS.everyMinutes[1] } };
  }
  return problems;
}

// --- the schedule ------------------------------------------------------------------------

/** The schedule kinds in the editor's order: the plain ones first, cron last. */
export const SCHEDULE_KIND_ORDER = ["weekdays", "interval", "once", "manual", "cron"] as const;

/**
 * Whether the draft is complete enough to ask the server for its next dates: a day and a time,
 * an interval in range, an expression, a date. Until then the editor says what is missing.
 */
export function schedulePreviewable(draft: ScheduleDraft): boolean {
  switch (draft.kind) {
    case "weekdays":
      return draft.days.length > 0 && /^\d{1,2}:\d{2}$/.test(draft.time.trim());
    case "interval":
      return inRange(draft.everyMinutes, LIMITS.everyMinutes);
    case "cron":
      return draft.expression.trim().length > 0;
    case "once":
      return draft.at.trim().length > 0;
    default:
      return true;
  }
}

/** The server's answer to a schedule preview: it accepted the draft, refused it, or never answered. */
export type ScheduleCheckStatus = "valid" | "invalid" | "failed";

/**
 * A preview the server refused (400 or 422: the schedule itself is wrong) against one that got no
 * answer (offline, a dropped connection, a server error): only the first means "not valid".
 */
export function previewFailure(status: number | null | undefined): "invalid" | "failed" {
  return status === 400 || status === 422 ? "invalid" : "failed";
}

/**
 * What Save does about the schedule: stop while it is incomplete or the server refused it, save
 * once the server accepted it, and otherwise (not checked yet, or the check got no answer) check
 * it now and wait for the answer.
 */
export function scheduleSaveStep(complete: boolean, status: ScheduleCheckStatus | null): "incomplete" | "refused" | "check" | "save" {
  if (!complete) return "incomplete";
  if (status === "valid") return "save";
  if (status === "invalid") return "refused";
  return "check";
}

/** The line above Save once it was pressed: why the schedule kept the routine from being saved. */
export function scheduleSaveProblem(complete: boolean, status: ScheduleCheckStatus | null): string | null {
  if (!complete || status === "invalid") return "routines.problem.schedule";
  if (status === "failed") return "routines.problem.scheduleUnchecked";
  return null;
}

/** Kinds that run at a wall-clock time, so their time zone matters. */
export function usesTimezone(kind: ScheduleDraft["kind"]): boolean {
  return kind !== "manual" && kind !== "interval";
}

/** Monday first, as the design draws the days; schedules store Sunday as 0. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

export function toggleDay(days: readonly number[], day: number): number[] {
  const next = days.includes(day) ? days.filter((d) => d !== day) : [...days, day];
  return [...new Set(next)].sort((a, b) => a - b);
}

/** A weekday's name in the reader's language; 2024-01-07 was a Sunday, so day d is 7 + d. */
export function weekdayName(day: number, locale: string, width: "short" | "long" = "short"): string {
  try {
    return new Intl.DateTimeFormat(locale, { weekday: width, timeZone: "UTC" }).format(new Date(Date.UTC(2024, 0, 7 + day)));
  } catch {
    return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][day] ?? String(day);
  }
}

/**
 * The message key of a day button's short label ("Mo", "Tu"…; design: Routines.html). Each
 * language says its own: cutting Intl's names to two letters would make two days alike in some
 * (Portuguese quarta and quinta) and mislead in others (Turkish Pazartesi and Pazar).
 */
export function dayChipKey(day: number): string {
  return `routines.dayChip.${day}`;
}

/** Every IANA zone this browser knows, with UTC and the routine's own zone always offered. */
export function timeZoneChoices(current: string, supported?: readonly string[]): string[] {
  let zones: string[] = [];
  try {
    zones = [...(supported ?? Intl.supportedValuesOf("timeZone"))];
  } catch {
    zones = [];
  }
  const extra = [current.trim(), "UTC"].filter((zone) => zone && !zones.includes(zone));
  return [...new Set([...extra, ...zones])];
}

/** The city an IANA zone is named after ("America/Tijuana" → "Tijuana"); null for one without (UTC, Etc/GMT+5). */
export function zoneCity(zone: string): string | null {
  const parts = zone.trim().split("/");
  const city = parts[parts.length - 1];
  if (parts.length < 2 || parts[0] === "Etc" || !city) return null;
  return city.replace(/_/g, " ");
}

/**
 * The time zone picker's choices, by the city people know ("Tijuana time", in the reader's words
 * through `cityLabel`), sorted by what they show. Each keeps its IANA name as the value. A zone
 * without a city, or whose city another zone shares, shows its IANA name instead.
 */
export function timeZoneOptions(
  zones: readonly string[],
  cityLabel: (city: string) => string,
  locale: string,
): { value: string; label: string }[] {
  const seen = new Map<string, number>();
  for (const zone of zones) {
    const city = zoneCity(zone);
    if (city) seen.set(city, (seen.get(city) ?? 0) + 1);
  }
  const options = zones.map((zone) => {
    const city = zoneCity(zone);
    return { value: zone, label: city && seen.get(city) === 1 ? cityLabel(city) : zone.replace(/_/g, " ") };
  });
  return options.sort((a, b) => a.label.localeCompare(b.label, locale) || a.value.localeCompare(b.value));
}

// Whether the reader's language tells the time on a 12-hour clock (7:35 AM) rather than 24 (07:35).
function twelveHourClock(locale: string): boolean {
  try {
    const cycle = new Intl.DateTimeFormat(locale, { hour: "numeric" }).resolvedOptions().hourCycle;
    return cycle === "h11" || cycle === "h12";
  } catch {
    return false;
  }
}

/**
 * A moment said briefly, as the design writes it ("Tue Nov 17, 07:35"; "Tue Nov 17, 7:35 AM" where
 * the reader's language keeps a 12-hour clock), in the given zone or the reader's own. No zone
 * name: the card's dates are in the routine's zone and the editor's in the zone picked above it.
 */
export function shortMoment(iso: string | null | undefined, locale: string, timeZone?: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const options: Intl.DateTimeFormatOptions = {
    weekday: "short", month: "short", day: "numeric",
    hour: twelveHourClock(locale) ? "numeric" : "2-digit", minute: "2-digit",
  };
  try {
    const parts = new Intl.DateTimeFormat(locale, timeZone ? { ...options, timeZone } : options).formatToParts(date);
    // "Tue, Nov 17" reads as "Tue Nov 17": only the comma right after the weekday goes.
    return parts.map((part, index) => (
      part.type === "literal" && parts[index - 1]?.type === "weekday" && /^,\s+$/.test(part.value) ? " " : part.value
    )).join("");
  } catch {
    return formatMoment(iso, locale);
  }
}

// --- connected apps ----------------------------------------------------------------------

/**
 * The exact routine-safe reads and the separately authorized writes the backend accepts for a
 * routine (app/composio_tools.py: the read inventory and ROUTINE_WRITE_TOOLS). Each label is the
 * message key routines.tool.<name>.
 */
export type RoutineAppGroup = { app: string; label: string; reads: readonly string[]; writes: readonly string[] };

export const ROUTINE_APP_TOOLS: readonly RoutineAppGroup[] = [
  {
    app: "github",
    label: "GitHub",
    reads: [
      "github_get_authenticated_user", "github_list_my_repositories", "github_list_issues", "github_get_issue",
      "github_list_issue_comments", "github_list_pull_requests", "github_get_pull_request", "github_list_pull_request_files",
      "github_list_pull_request_reviews", "github_list_pull_request_review_comments", "github_list_commits", "github_list_branches",
      "github_get_file", "github_search_issues", "github_list_workflow_runs",
    ],
    writes: ["github_fork_repository", "github_create_branch", "github_commit_file", "github_create_pull_request"],
  },
  {
    app: "gmail",
    label: "Gmail",
    reads: ["gmail_fetch_emails", "gmail_fetch_message", "gmail_fetch_thread", "gmail_get_profile"],
    writes: ["gmail_send_email", "gmail_prepare_checked_reply"],
  },
  {
    app: "googlecalendar",
    label: "Google Calendar",
    reads: ["googlecalendar_list_calendars", "googlecalendar_list_events"],
    writes: [],
  },
];

export const ROUTINE_APP_TOOL_NAMES: ReadonlySet<string> = new Set<string>(
  ROUTINE_APP_TOOLS.flatMap((group) => [...group.reads, ...group.writes]),
);

export function toolLabelKey(tool: string): string {
  return `routines.tool.${tool}`;
}

type ScopedAgent = Pick<Agent, "connector_scopes" | "connector_account_scopes">;

/** The agent's access to an app: none, read, or read and write. */
export function appScope(agent: ScopedAgent | null | undefined, app: string): "none" | "read" | "write" {
  const scope = agent?.connector_scopes?.[app];
  return scope === "write" ? "write" : scope === "read" ? "read" : "none";
}

/** The connected accounts of an app this agent may use: active, and allowed for the agent. */
export function routineAppAccounts(agent: ScopedAgent | null | undefined, accounts: readonly ComposioAccount[] | null, app: string): ComposioAccount[] {
  if (!agent || !accounts || appScope(agent, app) === "none") return [];
  const allowed = agent.connector_account_scopes?.[app] ?? [];
  return accounts.filter((account) => account.toolkit === app && account.status === "ACTIVE" && allowed.includes(account.id));
}

/** The actions of an app the agent could be granted: its reads, and its writes with write access. */
export function grantableTools(agent: ScopedAgent | null | undefined, accounts: readonly ComposioAccount[] | null, group: RoutineAppGroup): string[] {
  if (routineAppAccounts(agent, accounts, group.app).length === 0) return [];
  return [...group.reads, ...(appScope(agent, group.app) === "write" ? group.writes : [])];
}

/** Every action any app offers this agent now. */
export function selectableTools(agent: ScopedAgent | null | undefined, accounts: readonly ComposioAccount[] | null): Set<string> {
  return new Set(ROUTINE_APP_TOOLS.flatMap((group) => grantableTools(agent, accounts, group)));
}

function groupTools(group: RoutineAppGroup): Set<string> {
  return new Set<string>([...group.reads, ...group.writes]);
}

/** The account the group's grants use: the one already granted when it is still allowed, else the first allowed. */
export function groupAccount(grants: readonly ConnectedAppGrant[], group: RoutineAppGroup, available: readonly ComposioAccount[]): string {
  const tools = groupTools(group);
  const current = grants.find((grant) => tools.has(grant.tool));
  if (current && available.some((account) => account.id === current.account_id)) return current.account_id;
  return available[0]?.id ?? current?.account_id ?? "";
}

/** Grant or take back one action, on the given account. */
export function toggleGrant(grants: readonly ConnectedAppGrant[], tool: string, accountId: string): ConnectedAppGrant[] {
  return grants.some((grant) => grant.tool === tool)
    ? grants.filter((grant) => grant.tool !== tool)
    : [...grants, { tool, account_id: accountId }];
}

/** Move every grant of an app to another of its accounts. */
export function setGroupAccount(grants: readonly ConnectedAppGrant[], group: RoutineAppGroup, accountId: string): ConnectedAppGrant[] {
  const tools = groupTools(group);
  return grants.map((grant) => (tools.has(grant.tool) ? { ...grant, account_id: accountId } : grant));
}

/** Grant every action the agent can be granted, keeping each app on its chosen account. */
export function selectAllGrants(grants: readonly ConnectedAppGrant[], agent: ScopedAgent | null | undefined, accounts: readonly ComposioAccount[] | null): ConnectedAppGrant[] {
  const byTool = new Map<string, ConnectedAppGrant>(grants.map((grant) => [grant.tool, grant] as const));
  for (const group of ROUTINE_APP_TOOLS) {
    const available = routineAppAccounts(agent, accounts, group.app);
    if (available.length === 0) continue;
    const accountId = groupAccount(grants, group, available);
    for (const tool of grantableTools(agent, accounts, group)) byTool.set(tool, { tool, account_id: accountId });
  }
  return [...byTool.values()];
}

/** Take back every routine app grant; anything else stays. */
export function clearAllGrants(grants: readonly ConnectedAppGrant[]): ConnectedAppGrant[] {
  return grants.filter((grant) => !ROUTINE_APP_TOOL_NAMES.has(grant.tool));
}

export function hasAppGrants(grants: readonly ConnectedAppGrant[]): boolean {
  return grants.some((grant) => ROUTINE_APP_TOOL_NAMES.has(grant.tool));
}

// --- runs --------------------------------------------------------------------------------

const TRIGGER_KEYS: Record<RoutineRun["trigger"], string> = {
  schedule: "routines.trigger.schedule",
  manual: "routines.trigger.manual",
  webhook: "routines.trigger.webhook",
  retry: "routines.trigger.retry",
};

export function runTriggerKey(trigger: string): string {
  return TRIGGER_KEYS[trigger as RoutineRun["trigger"]] ?? "routines.trigger.unknown";
}

/** When the run was meant to start, else when it did, else when it was recorded. */
export function runMoment(run: Pick<RoutineRun, "scheduled_for" | "started_at" | "created_at">): string {
  return run.scheduled_for ?? run.started_at ?? run.created_at;
}

/** Seconds of work, without the time it waited for you; null until it has finished. */
export function runWorkSeconds(run: Pick<RoutineRun, "started_at" | "finished_at" | "waited_seconds">): number | null {
  if (!run.started_at || !run.finished_at) return null;
  const start = Date.parse(run.started_at);
  const end = Date.parse(run.finished_at);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return null;
  return Math.max(0, Math.round((end - start) / 1000 - (run.waited_seconds ?? 0)));
}

/** "45 sec", "3 min", "2 hr" in the reader's language. */
export function formatDuration(seconds: number, locale: string): string {
  const [unit, value] = seconds < 60 ? ["second", seconds] as const : seconds < 3600 ? ["minute", Math.round(seconds / 60)] as const : ["hour", Math.round(seconds / 360) / 10] as const;
  try {
    return new Intl.NumberFormat(locale, { style: "unit", unit, unitDisplay: "short", maximumFractionDigits: 1 }).format(value);
  } catch {
    return `${value} ${unit === "second" ? "s" : unit === "minute" ? "min" : "h"}`;
  }
}

/** True while any of the runs is queued, running or waiting. */
export function anyRunActive(runs: readonly Pick<RoutineRun, "state">[] | null): boolean {
  return runs?.some((run) => isActiveRun(run)) ?? false;
}

const ACTION_WORDS: Record<string, { tone: Tone; key: string }> = {
  completed: { tone: "done", key: "routines.action.completed" },
  failed: { tone: "denied", key: "routines.action.failed" },
  refused: { tone: "denied", key: "routines.action.refused" },
  outcome_unknown: { tone: "waiting", key: "routines.action.outcome_unknown" },
  reserved: { tone: "running", key: "routines.action.reserved" },
};

/** The word and dot for an app action receipt (services/composio_bridge.py); unknown reads as neutral. */
export function appActionWords(status: string): { tone: Tone; key: string } {
  return ACTION_WORDS[status] ?? { tone: "idle", key: "routines.action.unknown" };
}
