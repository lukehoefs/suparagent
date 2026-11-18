// The Today page (design: Today.html, MobileToday.html): which rows go in which section, the
// greeting and the month, and where every row links. Pure: no React, no network; the only runtime
// import is the needs-you links, so node tests can load it (lib/today.test.mjs).
import type { AppNotification, Routine, RoutineRun } from "./api";
import type { NeedsYouRow, NeedsYouSnapshot } from "./needs-you";
import type { WorkItem } from "./planner-api";
import { rowAction } from "./needs-you.ts";

// --- what the server sends (GET /today/running, GET /today/brief) -------------------------------

// A tool call waiting in a running answer: the same fields as GET /threads/{id}/approvals.
export type RunningApproval = {
  id: string;
  turn_id: number;
  tool: string;
  input: Record<string, unknown>;
  summary: string | null;
  kind: string | null;
  status: string;
  created_at: string;
  tool_summary?: string | null;
  risk?: string | null;
  scopes?: string[];
};

// A conversation with an answer being worked on right now.
export type RunningTurn = {
  thread_id: number;
  turn_id: number;
  kind: string;
  title: string | null;
  agent_id: number | null;
  room_id: number | null;
  job_id: number | null;
  started_at: string;
  origin: string | null;
  approvals: RunningApproval[];
};

// A row of the Today brief, with the agent of its conversation, routine or task when known.
export type BriefRow = NeedsYouRow & { agent_id?: number | null };
export type TodayBrief = Omit<NeedsYouSnapshot, "items"> & { items: BriefRow[] };

// The status language (components/ui/StatusPill): colour means status, always with a word.
export type TodayStatus = "done" | "waiting" | "denied" | "running" | "idle";

// --- time ------------------------------------------------------------------------------------

export type ZonedParts = { year: number; month: number; day: number; hour: number; minute: number };

// A time zone the browser knows, else UTC.
export function safeZone(timeZone: string | null | undefined): string {
  if (!timeZone) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(0);
    return timeZone;
  } catch {
    return "UTC";
  }
}

/** The wall clock in a time zone: year, month (1-12), day, hour (0-23) and minute. */
export function zonedParts(at: Date | number | string, timeZone: string): ZonedParts {
  const date = at instanceof Date ? at : new Date(at);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: safeZone(timeZone), year: "numeric", month: "numeric", day: "numeric",
    hour: "numeric", minute: "numeric", hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { year: part("year"), month: part("month"), day: part("day"), hour: part("hour") % 24, minute: part("minute") };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** The local day an instant falls on in a time zone, as YYYY-MM-DD; null for a bad date. */
export function dayKey(at: Date | number | string, timeZone: string): string | null {
  const date = at instanceof Date ? at : new Date(at);
  if (Number.isNaN(date.getTime())) return null;
  const { year, month, day } = zonedParts(date, timeZone);
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** Which greeting the hour gets: morning from 5 to 11, afternoon from 12 to 17, evening else. */
export function greetingPart(hour: number): "morning" | "afternoon" | "evening" {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 18) return "afternoon";
  return "evening";
}

/** The message key and name for the greeting; without a name, the plain greeting. */
export function greeting(hour: number, name: string | null): { key: string; params?: { name: string } } {
  const part = greetingPart(hour);
  return name ? { key: `today.greeting.${part}`, params: { name } } : { key: `today.greeting.${part}Plain` };
}

/** The first word of a name ("Luke Hoefs" → "Luke"); null when there is none. */
export function firstName(name: string | null | undefined): string | null {
  const word = (name ?? "").trim().split(/\s+/)[0];
  return word ? word : null;
}

// --- the month -------------------------------------------------------------------------------

// Where the week starts when the browser cannot say (0 Sunday, 1 Monday), by app language.
const SUNDAY_FIRST = new Set(["en", "ja", "ko", "pt", "zh"]);

/** The first day of the week for a language tag: what the browser's Intl.Locale says when it
 * can, else the usual one for the app language. 0 is Sunday. */
export function firstDayOfWeek(tag: string): number {
  try {
    const locale = new Intl.Locale(tag) as Intl.Locale & { getWeekInfo?: () => { firstDay: number }; weekInfo?: { firstDay: number } };
    const info = locale.getWeekInfo?.() ?? locale.weekInfo;
    if (info && Number.isInteger(info.firstDay)) return info.firstDay % 7;
  } catch {
    // An unknown tag: fall back below.
  }
  return SUNDAY_FIRST.has(tag.slice(0, 2).toLowerCase()) ? 0 : 1;
}

/** The days of a week in display order (0 Sunday … 6 Saturday), starting on `firstDay`. */
export function weekdayOrder(firstDay: number): number[] {
  return Array.from({ length: 7 }, (_, i) => (firstDay + i) % 7);
}

/** A month as calendar cells: null for the blanks before the 1st, then each day's number. */
export function monthCells(year: number, month: number, firstDay: number): (number | null)[] {
  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const blanks = (first - firstDay + 7) % 7;
  return [...Array.from({ length: blanks }, () => null), ...Array.from({ length: days }, (_, i) => i + 1)];
}

// --- links -----------------------------------------------------------------------------------

/** Where a running conversation opens: its room for a room's member, else the conversation. */
export function conversationHref(turn: Pick<RunningTurn, "thread_id" | "kind" | "room_id">): string {
  if ((turn.kind === "room" || turn.kind === "room_member") && turn.room_id !== null) return `/chat?room=${turn.room_id}`;
  return `/chat?thread=${turn.thread_id}`;
}

// The Routines page on that routine's runs (lib/routines-page.ts routineHref) and the Tasks board
// with that task open (lib/tasks-board.ts taskHref).
export function routineHref(routineId: number): string {
  return `/routines/?id=${routineId}&tab=runs`;
}

export function taskHref(taskId: number): string {
  return `/tasks/?task=${taskId}`;
}

export const TASKS_HREF = "/tasks/";

/** Where the app opens (`/`): Today for owners and admins (it is theirs only), else the chat.
 * Without a session (signed out, or the server could not say) the chat, which signs in. */
export function homeHref(scopes: readonly string[] | null | undefined): string {
  return scopes?.includes("admin") ? "/today/" : "/chat/";
}

/** Where a notification leads: its conversation, else its routine; null when it names neither. */
export function activityHref(item: Pick<AppNotification, "thread_id" | "routine_id">): string | null {
  if (item.thread_id !== null) return `/chat?thread=${item.thread_id}`;
  if (item.routine_id !== null) return routineHref(item.routine_id);
  return null;
}

// --- waiting for you ---------------------------------------------------------------------------

export type WaitingApproval = {
  type: "approval";
  key: string;
  approvalId: string;
  threadId: number;
  agentId: number | null;
  // The conversation it was asked in, and where it opens.
  title: string | null;
  href: string;
  // What the call is; null when only the brief knows of it (it is then a link, never answered here).
  call: RunningApproval | null;
  summary: string;
  at: string | null;
};
export type WaitingRow = { type: "question" | "attention"; key: string; row: BriefRow; agentId: number | null; href: string | null; actionKey: string };
export type WaitingItem = WaitingApproval | WaitingRow;

// Rows that belong to other sections (or that this page leaves to the chat's Today card).
const ELSEWHERE = new Set(["due", "routine_completed", "calendar_event", "gmail_message"]);
const ENGINE_KINDS = new Set(["signed_out", "out_of_credit", "usage_limit"]);

/**
 * What a row's one link says. It names where the link goes, which depends on the id the row
 * carries (needs-you rowAction), not on its kind alone: a recorded engine failure opens its
 * conversation, a failed routine its run's conversation, a paused one the routine.
 */
export function waitingActionKey(kind: string, href: string | null): string {
  if (href === null) return "today.action.open";
  if (href === "/settings/engines/") return "today.action.openSettings";
  if (href === "/chat?panel=usage") return "today.action.seeUsage";
  if (href.startsWith("/routines/")) return "today.action.openRoutine";
  if (href.startsWith("/chat?thread=") || href.startsWith("/chat?room=")) {
    if (kind === "question") return "today.waiting.answer";
    if (kind === "routine") return "today.action.openRun";
    if (kind === "repeated_failure") return "today.action.lookIntoIt";
    return "today.waiting.openChat";
  }
  return "today.action.open";
}

/**
 * What waits for the person, most blocking first: engines that stop everything, then the tool
 * calls (oldest first), then questions, routines that need fixing and repeated failures. The
 * calls come from what is running when that is known (it names the tool, so they can be answered
 * here), else from the brief, as links to their conversations.
 */
export function waitingItems(running: readonly RunningTurn[] | null, brief: readonly BriefRow[] | null): WaitingItem[] {
  const rows = (brief ?? []).filter((row) => !ELSEWHERE.has(row.kind));
  const attention = (row: BriefRow): WaitingRow => {
    const href = rowAction(row).href;
    return {
      type: row.kind === "question" ? "question" : "attention",
      key: row.key, row, agentId: row.agent_id ?? null, href,
      actionKey: waitingActionKey(row.kind, href),
    };
  };
  let approvals: WaitingApproval[];
  if (running !== null) {
    approvals = running.flatMap((turn) => turn.approvals.map((call): WaitingApproval => ({
      type: "approval", key: `approval:${call.id}`, approvalId: call.id, threadId: turn.thread_id,
      agentId: turn.agent_id, title: turn.title, href: conversationHref(turn), call,
      summary: call.summary || call.tool, at: call.created_at,
    })));
    approvals.sort((a, b) => Date.parse(a.at ?? "") - Date.parse(b.at ?? "") || a.approvalId.localeCompare(b.approvalId));
  } else {
    approvals = rows.filter((row) => row.kind === "approval" && row.thread_id !== null).map((row): WaitingApproval => ({
      type: "approval", key: row.key, approvalId: row.key.replace(/^approval:/, ""), threadId: row.thread_id as number,
      agentId: row.agent_id ?? null, title: row.detail, href: `/chat?thread=${row.thread_id}`, call: null,
      summary: row.title, at: row.at ?? null,
    }));
  }
  const engines = rows.filter((row) => ENGINE_KINDS.has(row.kind)).map(attention);
  const rest = rows.filter((row) => row.kind !== "approval" && !ENGINE_KINDS.has(row.kind)).map(attention);
  return [...engines, ...approvals, ...rest];
}

/**
 * How many items Today lists under "Waiting for you" (its badge), by the page's own rules, so the
 * phone bar's pill that opens Today says the same number. Null when neither read came in.
 */
export function waitingCount(running: readonly RunningTurn[] | null, brief: readonly BriefRow[] | null): number | null {
  if (running === null && brief === null) return null;
  return waitingItems(running, brief).length;
}

// --- running now -------------------------------------------------------------------------------

export type RunningItem = { key: string; threadId: number; agentId: number | null; title: string | null; routineName: string | null; startedAt: string; href: string };

/** Answers being worked on that wait for nothing (those are in Waiting for you), newest first.
 * A routine's run is named after its routine. */
export function runningItems(running: readonly RunningTurn[] | null, runs: readonly RoutineRun[] | null, routines: readonly Routine[] | null): RunningItem[] {
  const names = new Map((routines ?? []).map((routine) => [routine.id, routine.name]));
  const byThread = new Map<number, string>();
  for (const run of runs ?? []) {
    const name = names.get(run.routine_id);
    if (run.thread_id !== null && name && (run.state === "running" || run.state === "queued") && !byThread.has(run.thread_id)) byThread.set(run.thread_id, name);
  }
  return (running ?? [])
    .filter((turn) => turn.approvals.length === 0)
    .map((turn) => ({
      key: `turn:${turn.turn_id}`, threadId: turn.thread_id, agentId: turn.agent_id, title: turn.title,
      routineName: byThread.get(turn.thread_id) ?? null, startedAt: turn.started_at, href: conversationHref(turn),
    }));
}

// --- routine results ---------------------------------------------------------------------------

// The run states a result shows, with the status and word each gets.
const RESULT_STATES: Partial<Record<RoutineRun["state"], { status: TodayStatus; key: string }>> = {
  completed: { status: "done", key: "today.run.done" },
  failed: { status: "denied", key: "today.run.failed" },
  interrupted: { status: "denied", key: "today.run.interrupted" },
  missed: { status: "denied", key: "today.run.missed" },
  needs_input: { status: "waiting", key: "today.run.needsYou" },
};

export function runStatus(state: string): { status: TodayStatus; key: string } | null {
  return RESULT_STATES[state as RoutineRun["state"]] ?? null;
}

// When a run happened: when it ended, else started, else was due, else was made.
export function runTime(run: Pick<RoutineRun, "finished_at" | "started_at" | "scheduled_for" | "created_at">): string {
  return run.finished_at ?? run.started_at ?? run.scheduled_for ?? run.created_at;
}

export type RoutineResult = { key: string; routineId: number; name: string; agentId: number; run: RoutineRun; count: number; at: string; status: TodayStatus; labelKey: string; href: string };

/**
 * Each routine that has a result today (in `timeZone`): its latest finished run (done, failed,
 * interrupted, missed) or one waiting for the person, and how many such runs it had today.
 * Latest first. Runs of routines not in the list (a task's own runs) are left out.
 */
export function routineResults(runs: readonly RoutineRun[] | null, routines: readonly Routine[] | null, today: string, timeZone: string): RoutineResult[] {
  const known = new Map((routines ?? []).map((routine) => [routine.id, routine]));
  const groups = new Map<number, { latest: RoutineRun; count: number }>();
  for (const run of runs ?? []) {
    if (!known.has(run.routine_id) || !runStatus(run.state) || dayKey(runTime(run), timeZone) !== today) continue;
    const group = groups.get(run.routine_id);
    if (!group) groups.set(run.routine_id, { latest: run, count: 1 });
    else {
      group.count += 1;
      if (Date.parse(runTime(run)) > Date.parse(runTime(group.latest))) group.latest = run;
    }
  }
  return [...groups.entries()]
    .map(([routineId, { latest, count }]): RoutineResult => {
      const routine = known.get(routineId) as Routine;
      const state = runStatus(latest.state) as { status: TodayStatus; key: string };
      return {
        key: `routine:${routineId}`, routineId, name: routine.name, agentId: routine.agent_id, run: latest, count,
        at: runTime(latest), status: state.status, labelKey: state.key,
        href: latest.thread_id !== null ? `/chat?thread=${latest.thread_id}` : routineHref(routineId),
      };
    })
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || a.routineId - b.routineId);
}

/** False when the runs read may stop short of today's start: the list is full and its oldest
 * run is still from today. */
export function runsCoverToday(runs: readonly RoutineRun[], limit: number, today: string, timeZone: string): boolean {
  if (runs.length < limit) return true;
  const oldest = runs.reduce((min, run) => (Date.parse(run.created_at) < Date.parse(min.created_at) ? run : min), runs[0]);
  const day = dayKey(oldest.created_at, timeZone);
  return day !== null && day < today;
}

// --- due tasks ---------------------------------------------------------------------------------

export type DueTask = {
  key: string;
  item: WorkItem;
  done: boolean;
  // Its due time or day has passed and it is not done.
  overdue: boolean;
  // When it is due, as the row says it: a time today, "Today", or the day it was due.
  when: { kind: "time"; at: string } | { kind: "today" } | { kind: "date"; day: string };
  // For ordering: whether it is past due (done or not, so a ticked task keeps its place), and the
  // due instant, or the due day's start in UTC.
  late: boolean;
  sortAt: number;
};

/**
 * Tasks due today or earlier that are not done, overdue first, then by when they are due. A task
 * with a due time is placed by that time in `timeZone`; one with a due day by that day in its own
 * time zone. `keep` holds tasks just ticked off here: they stay in the list, in their place, shown done.
 */
export function dueTasks(items: readonly WorkItem[] | null, doneColumnId: number | null, now: Date, timeZone: string, keep: ReadonlySet<number> = new Set()): DueTask[] {
  const today = dayKey(now, timeZone);
  const out: DueTask[] = [];
  for (const item of items ?? []) {
    if (item.archived) continue;
    const done = doneColumnId !== null && item.column_id === doneColumnId;
    if (done && !keep.has(item.id)) continue;
    if (item.due_at) {
      const due = Date.parse(item.due_at);
      const day = dayKey(item.due_at, timeZone);
      if (Number.isNaN(due) || day === null || today === null || day > today) continue;
      const late = due < now.getTime();
      out.push({
        key: `task:${item.id}`, item, done, overdue: !done && late, late,
        when: day === today ? { kind: "time", at: item.due_at } : { kind: "date", day }, sortAt: due,
      });
    } else if (item.due_date) {
      const own = dayKey(now, item.timezone || timeZone);
      if (own === null || item.due_date > own) continue;
      const late = item.due_date < own;
      out.push({
        key: `task:${item.id}`, item, done, overdue: !done && late, late,
        when: item.due_date === own ? { kind: "today" } : { kind: "date", day: item.due_date },
        sortAt: Date.parse(`${item.due_date}T00:00:00Z`),
      });
    }
  }
  return out.sort((a, b) => Number(b.late) - Number(a.late) || a.sortAt - b.sortAt || a.item.id - b.item.id);
}

// --- the calendar card -------------------------------------------------------------------------

// A field of the event as the calendar sent it (needs_you.collect_providers keeps these).
const field = (row: BriefRow, name: string): string | null => {
  const value = row.source_record?.[name];
  return typeof value === "string" && value ? value : null;
};
const instant = (value: string | null): number | null => {
  if (value === null) return null;
  const at = Date.parse(value);
  return Number.isNaN(at) ? null : at;
};

// Where an event goes in the day: all-day events first, then by start, then those without a time.
function startOrder(row: BriefRow): [number, number] {
  const day = field(row, "start_date");
  if (day !== null) return [0, instant(`${day}T00:00:00Z`) ?? 0];
  const start = instant(field(row, "start_dateTime"));
  return start === null ? [2, 0] : [1, start];
}

/** Today's events from the brief (the lead's primary calendar, when it may read it), in the
 * order of the day: all-day events first, then by start time, then by key. (The brief lists
 * them by when each was last edited.) */
export function calendarRows(brief: readonly BriefRow[] | null): BriefRow[] {
  return (brief ?? [])
    .filter((row) => row.kind === "calendar_event")
    .map((row) => ({ row, order: startOrder(row) }))
    .sort((a, b) => a.order[0] - b.order[0] || a.order[1] - b.order[1] || (a.row.key < b.row.key ? -1 : a.row.key > b.row.key ? 1 : 0))
    .map(({ row }) => row);
}

export type CalendarEvent = {
  key: string;
  row: BriefRow;
  // The event's own title, without the server's English "Cancelled: ".
  title: string;
  cancelled: boolean;
  // When it is: all day; from a start to an end (ISO instants; no end when the calendar gave
  // none); no time given; or only the server's own line, for a row without the calendar's fields.
  when: { kind: "allDay" } | { kind: "time"; start: string; end: string | null } | { kind: "none" } | { kind: "detail"; text: string | null };
  // It overlaps another timed event of the day, neither cancelled.
  conflict: boolean;
};

const CANCELLED_PREFIX = "Cancelled: ";

/** Each event as the card writes it, in the page's language and time format: built from the
 * calendar's own fields rather than the brief's English line. A conflict follows the server's
 * rule: two timed events, neither cancelled, that overlap. */
export function calendarEvents(rows: readonly BriefRow[]): CalendarEvent[] {
  const timed = rows.flatMap((row) => {
    const start = instant(field(row, "start_dateTime"));
    const end = instant(field(row, "end_dateTime"));
    return field(row, "status") !== "cancelled" && start !== null && end !== null && end > start ? [{ key: row.key, start, end }] : [];
  });
  const conflicts = new Set(timed.filter((a) => timed.some((b) => a.key !== b.key && a.start < b.end && b.start < a.end)).map((a) => a.key));
  return rows.map((row): CalendarEvent => {
    const cancelled = field(row, "status") === "cancelled";
    const title = cancelled && row.title.startsWith(CANCELLED_PREFIX) ? row.title.slice(CANCELLED_PREFIX.length) : row.title;
    const start = field(row, "start_dateTime");
    const end = field(row, "end_dateTime");
    let when: CalendarEvent["when"];
    if (!row.source_record) when = { kind: "detail", text: row.detail };
    else if (field(row, "start_date") !== null) when = { kind: "allDay" };
    else if (instant(start) !== null) when = { kind: "time", start: start as string, end: instant(end) !== null ? end : null };
    else when = { kind: "none" };
    return { key: row.key, row, title, cancelled, when, conflict: conflicts.has(row.key) };
  });
}

/** What the calendar card says about its source: nothing when the calendar is not connected;
 * "none" when it was checked and is clear; a warning when it could not be read in full. */
export function calendarNote(source: string | undefined, events: number): "none" | "failed" | "partial" | null {
  if (source === "failed") return "failed";
  if (source === "partial") return "partial";
  if ((source === "available" || source === "quiet") && events === 0) return "none";
  return null;
}
