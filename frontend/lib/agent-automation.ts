// Pure rules for what an agent does on its own, on the agent settings page: the Routines tab
// (its routines, the commands always allowed for it, the rooms it is in) and the memory extras
// (daily logs, a proposed note edited before it is accepted). Words come back as message keys
// (lib/locales/agents-automation-extra.ts) for the caller to translate; dates are formatted with
// Intl in the reader's language. Type-only and pure imports, so node tests can load it.
import type { ApprovalRule, MemoryProposal, Routine, RoutineRun } from "./api";
import { pluralForm } from "./blueprint-browse.ts";
import { isTopicName, topicFileName } from "./memory.ts";
import { routineStatus } from "./routines.ts";

export type Words = { key: string; params?: Record<string, string | number> };
/** The status language of components/ui/StatusPill: a dot and a word, colour for status only. */
export type Tone = "done" | "waiting" | "denied" | "running" | "idle";

/** The Routines view in chat. It lists every routine; editing and creating happen there. */
export const ROUTINES_VIEW_HREF = "/chat/?view=routines";
/** The Routines view opened on one routine's runs (the view reads ?routine= and opens its history). */
export function routineRunsHref(routineId: number): string {
  return `/chat/?view=routines&routine=${routineId}`;
}
export const APPROVALS_SETTINGS_HREF = "/settings/approvals/";

// --- routines ---------------------------------------------------------------------------

/** One agent's routines, by name. */
export function agentRoutines<T extends Pick<Routine, "id" | "agent_id" | "name">>(routines: readonly T[], agentId: number): T[] {
  return routines
    .filter((routine) => routine.agent_id === agentId)
    .sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id);
}

export type RoutineState = "on" | "paused" | "finished";

/** On (it runs on its schedule or webhook), paused, or finished (a one-time routine that ran). */
export function routineState(routine: Pick<Routine, "paused" | "next_run_at" | "schedule_kind"> & { status?: string }): RoutineState {
  const status = routineStatus(routine);
  return status === "done" ? "finished" : status === "off" ? "paused" : "on";
}

export function routineStateWords(state: RoutineState): { tone: Tone; key: string } {
  if (state === "on") return { tone: "done", key: "agentAutomation.routine.state.on" };
  if (state === "paused") return { tone: "idle", key: "agentAutomation.routine.state.paused" };
  return { tone: "idle", key: "agentAutomation.routine.state.finished" };
}

const RUN_TONE: Record<RoutineRun["state"], Tone> = {
  queued: "running",
  running: "running",
  needs_input: "waiting",
  completed: "done",
  failed: "denied",
  missed: "denied",
  interrupted: "denied",
  skipped: "idle",
};

/** The word and dot for a run's state; an unknown state reads as neutral. */
export function runStateWords(state: string): { tone: Tone; key: string } {
  const known = state in RUN_TONE ? (state as RoutineRun["state"]) : null;
  return known
    ? { tone: RUN_TONE[known], key: `agentAutomation.run.state.${known}` }
    : { tone: "idle", key: "agentAutomation.run.state.unknown" };
}

/** What a finished run came to, beyond its state; null when the state says it all. */
export function runOutcomeKey(outcome: string | null | undefined): string | null {
  if (outcome === "no_change" || outcome === "report" || outcome === "unknown" || outcome === "source_failed") {
    return `agentAutomation.run.outcome.${outcome}`;
  }
  return null;
}

function validDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** A moment as the reader says it ("Tue, Nov 18, 9:00 AM"), in their own time zone unless one is given. */
export function formatMoment(iso: string | null | undefined, locale: string, timeZone?: string): string {
  const date = validDate(iso);
  if (!date) return "";
  const options: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" };
  try {
    return new Intl.DateTimeFormat(locale, timeZone ? { ...options, timeZone } : options).format(date);
  } catch {
    return date.toISOString();
  }
}

// 2024-01-07 was a Sunday: day d of the week (0 = Sunday, as schedules store it) is 7 + d.
function weekdayName(day: number, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2024, 0, 7 + day)));
  } catch {
    return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][day] ?? String(day);
  }
}

function listOf(items: string[], locale: string): string {
  try {
    return new Intl.ListFormat(locale, { style: "short", type: "conjunction" }).format(items);
  } catch {
    return items.join(", ");
  }
}

/** "09:00" as the reader's language writes a time of day ("9:00 AM" in English). */
export function clockTime(value: unknown, locale: string): string | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  try {
    return new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(new Date(Date.UTC(2024, 0, 1, hours, minutes)));
  } catch {
    return value.trim();
  }
}

/**
 * A routine's schedule in the reader's language, and the routine's time zone when it differs from
 * the reader's (only for kinds that run at a wall-clock time). An unreadable spec says so rather
 * than guessing.
 */
export function scheduleWords(
  routine: Pick<Routine, "schedule_kind" | "schedule_spec" | "timezone">,
  locale: string,
  localZone: string,
): { words: Words; zone: string | null } {
  const spec = routine.schedule_spec ?? {};
  const zone = routine.timezone && routine.timezone !== localZone ? routine.timezone : null;
  const unreadable = { words: { key: "agentAutomation.schedule.unreadable" }, zone: null };
  switch (routine.schedule_kind) {
    case "manual":
      return { words: { key: "agentAutomation.schedule.manual" }, zone: null };
    case "interval": {
      const every = spec.every_minutes;
      if (typeof every !== "number" || !Number.isInteger(every) || every <= 0) return unreadable;
      const [unit, n] = every % 1440 === 0 ? ["days", every / 1440] : every % 60 === 0 ? ["hours", every / 60] : ["minutes", every];
      // "Every day", not "Every 1 day"; counts take the language's plural form.
      const form = n === 1 ? "single" : pluralForm(locale, n);
      return { words: { key: `agentAutomation.schedule.every.${unit}.${form}`, params: { n } }, zone: null };
    }
    case "weekdays": {
      const time = clockTime(spec.time, locale);
      const days = Array.isArray(spec.days)
        ? [...new Set(spec.days.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6))]
        : [];
      if (!time || days.length === 0) return unreadable;
      const set = new Set(days);
      const same = (want: number[]) => want.length === set.size && want.every((d) => set.has(d));
      if (set.size === 7) return { words: { key: "agentAutomation.schedule.daily", params: { time } }, zone };
      if (same([1, 2, 3, 4, 5])) return { words: { key: "agentAutomation.schedule.weekdays", params: { time } }, zone };
      if (same([0, 6])) return { words: { key: "agentAutomation.schedule.weekends", params: { time } }, zone };
      // Monday first; Sunday last.
      const ordered = [...set].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
      return { words: { key: "agentAutomation.schedule.onDays", params: { days: listOf(ordered.map((d) => weekdayName(d, locale)), locale), time } }, zone };
    }
    case "once": {
      const date = validDate(typeof spec.at === "string" ? spec.at : null);
      if (!date) return unreadable;
      let when: string;
      try {
        when = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: routine.timezone || undefined }).format(date);
      } catch {
        when = date.toISOString();
      }
      return { words: { key: "agentAutomation.schedule.once", params: { when } }, zone };
    }
    case "cron":
      return typeof spec.expression === "string" && spec.expression.trim()
        ? { words: { key: "agentAutomation.schedule.cron", params: { expression: spec.expression.trim() } }, zone }
        : unreadable;
    default:
      return unreadable;
  }
}

/** When it runs next, or null when it does not run by itself (paused, finished, by hand only). */
export function nextRunWords(
  routine: Pick<Routine, "paused" | "next_run_at" | "schedule_kind"> & { status?: string },
  locale: string,
): Words | null {
  if (routineState(routine) !== "on" || routine.schedule_kind === "manual") return null;
  const when = formatMoment(routine.next_run_at, locale);
  return when ? { key: "agentAutomation.routine.next", params: { when } } : null;
}

// --- always allowed ---------------------------------------------------------------------

/** Rules tied to the agent's folders first, then the ones for every folder; each by command. */
export function sortRules<T extends Pick<ApprovalRule, "id" | "command" | "workspace">>(rules: readonly T[]): T[] {
  return [...rules].sort(
    (a, b) => Number(a.workspace === null) - Number(b.workspace === null) || a.command.localeCompare(b.command) || a.id - b.id,
  );
}

// --- rooms ------------------------------------------------------------------------------

type RoomLike = { id: number; name: string; members: { agent_id: number; held: boolean }[] };

/** The rooms an agent is a member of, by name, with whether it is held there. */
export function agentRooms<T extends RoomLike>(rooms: readonly T[], agentId: number): { room: T; held: boolean }[] {
  return rooms
    .flatMap((room) => {
      const member = room.members.find((m) => m.agent_id === agentId);
      return member ? [{ room, held: member.held }] : [];
    })
    .sort((a, b) => a.room.name.localeCompare(b.room.name) || a.room.id - b.room.id);
}

// --- daily logs -------------------------------------------------------------------------

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Newest day first (the days are YYYY-MM-DD, so text order is date order). */
export function newestDaysFirst<T extends { day: string }>(logs: readonly T[]): T[] {
  return [...logs].sort((a, b) => b.day.localeCompare(a.day));
}

/** "2026-11-16" as the reader's language writes a date; the day itself when it is not one. */
export function formatLogDay(day: string, locale: string): string {
  const match = DAY.exec(day);
  if (!match) return day;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (date.toISOString().slice(0, 10) !== day) return day;
  try {
    return new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(date);
  } catch {
    return day;
  }
}

/** Size in whole KB, at least 1, for a short line. */
export function sizeKb(bytes: number): number {
  return Math.max(1, Math.round(bytes / 1024));
}

// --- proposed notes ---------------------------------------------------------------------

/** The notes file a proposal goes to unless a topic note is chosen. */
export const NOTES_FILE = "MEMORY.md";
/** The choice in the "Save to" list that names a new topic note. */
export const NEW_TOPIC = "__new_topic__";
/** The backend refuses an edited line longer than this (schemas/agent.py MemoryProposalAcceptRequest). */
export const PROPOSAL_LINE_MAX = 2000;

/** Where a proposal may be saved: the notes, every topic note, and the proposal's own target. */
export function proposalTargets(topics: readonly { name: string }[], proposalTarget: string): string[] {
  const names = [...new Set([...topics.map((topic) => topic.name), proposalTarget])].filter((name) => name !== NOTES_FILE && isTopicName(name));
  return [NOTES_FILE, ...names.sort((a, b) => a.localeCompare(b))];
}

/** The line as the backend saves it: one line, single spaces. */
export function oneLine(text: string): string {
  return text.split(/\s+/).filter(Boolean).join(" ");
}

export type ProposalAcceptance =
  | { ok: true; change: { line?: string; target?: string } }
  | { ok: false; reason: "empty_line" | "too_long" | "bad_topic" };

/**
 * What accepting an edited proposal sends: only the parts that differ from the proposal. A blank
 * line is refused here, because the backend would quietly save the original line instead.
 */
export function proposalAcceptance(
  proposal: Pick<MemoryProposal, "line" | "target">,
  draftLine: string,
  target: string,
  newTopic: string,
): ProposalAcceptance {
  const line = oneLine(draftLine);
  if (!line) return { ok: false, reason: "empty_line" };
  if (line.length > PROPOSAL_LINE_MAX) return { ok: false, reason: "too_long" };
  const file = target === NEW_TOPIC ? topicFileName(newTopic) : target;
  if (!file || (file !== NOTES_FILE && !isTopicName(file))) return { ok: false, reason: "bad_topic" };
  const change: { line?: string; target?: string } = {};
  if (line !== oneLine(proposal.line)) change.line = line;
  if (file !== proposal.target) change.target = file;
  return { ok: true, change };
}
