// The Results page (design: Results.html): what agents produced, gathered from three existing
// sources. Tasks on the board's Review column (they wait for you to approve them) and finished
// agent work in Done; routine runs (scheduled agent work); delegated team work (asked for in a
// chat). Pure and free of runtime imports, so node tests can load it.
import type { Routine, RoutineRun } from "./api";
import type { TeamJob } from "./collaboration";
import type { WorkBoard, WorkItem, WorkRun } from "./planner-api";

// Addresses (static export: query strings and a trailing slash, never [id] folders).
export const RESULTS_HREF = "/results/";

/** The Results page, optionally opened on one filter: /results/?filter=review for what needs you. */
export function resultsHref(filter?: ResultFilter | null): string {
  return filter && filter !== "all" ? `${RESULTS_HREF}?filter=${filter}` : RESULTS_HREF;
}

/** A task opened on the Tasks board (lib/tasks-board.ts taskHref: the board reads ?task=). */
export function boardTaskHref(taskId: number): string {
  return `/tasks/?task=${taskId}`;
}

/** A routine's runs on the Routines page (lib/routines-page.ts routineHref). */
export function routineHref(routineId: number): string {
  return `/routines/?id=${routineId}&tab=runs`;
}

export type ResultSource = "task" | "routine" | "chat";
// review: a task in the Review column; waiting: a run or job paused on a question for you;
// running: an agent is working on it; done: finished.
export type ResultStatus = "review" | "waiting" | "running" | "done";
export type ResultFilter = "all" | "review" | "routines" | "chats" | "tasks";
export const RESULT_FILTERS: readonly ResultFilter[] = ["all", "review", "routines", "chats", "tasks"];

export type ResultRow = {
  // Unique across sources: "task:12", "run:44", "job:9".
  key: string;
  source: ResultSource;
  status: ResultStatus;
  title: string;
  // Who produced it. A task assigned to a team shows the team's lead, and the team's name when known.
  agentId: number | null;
  teamId: number | null;
  teamName: string | null;
  // When it last changed state: finished, moved to Review, or started.
  at: string;
  // The conversation "Open in chat" goes to: the task's or run's own, or the chat a job was asked in.
  threadId: number | null;
  // Delegated work only: the working agent's own conversation, when it is not threadId.
  workThreadId: number | null;
  // The output when the listing already carries it (routine runs); else read on demand.
  text: string | null;
  // The task's own text, shown when it has no output yet.
  description: string | null;
  taskId: number | null;
  revision: number | null;
  routineId: number | null;
  runId: number | null;
  jobId: number | null;
};

type TaskItem = Pick<WorkItem, "id" | "column_id" | "title" | "description" | "agent_id" | "team_id" | "thread_id" | "archived" | "completed_at" | "updated_at" | "revision"> & {
  execution_state?: string | null;
  execution_thread_id?: number | null;
};
type TeamInfo = { id: number; name: string; lead_agent_id: number | null } | null | undefined;

const empty = { teamId: null, teamName: null, workThreadId: null, text: null, description: null, taskId: null, revision: null, routineId: null, runId: null, jobId: null } as const;

/** The board's Review and Done columns (fixed keys in services/work_planner.py), or null. */
export function reviewColumns(board: Pick<WorkBoard, "columns"> | null | undefined): { review: number | null; done: number | null } {
  const find = (key: string) => board?.columns.find((column) => column.key === key)?.id ?? null;
  return { review: find("review"), done: find("done") };
}

/**
 * Board tasks that are results: everything in Review, and what is in Done that an agent or the
 * team worked on (assigned, or started from the board). A personal to-do moved to Done is not.
 */
export function taskRows(board: Pick<WorkBoard, "columns"> | null | undefined, items: readonly TaskItem[], team?: TeamInfo): ResultRow[] {
  const { review, done } = reviewColumns(board);
  const rows: ResultRow[] = [];
  for (const item of items) {
    if (item.archived) continue;
    const inReview = review !== null && item.column_id === review;
    const finished = done !== null && item.column_id === done && !!item.completed_at
      && (item.agent_id != null || item.team_id != null || !!item.execution_state);
    if (!inReview && !finished) continue;
    const ownTeam = item.team_id != null && team && team.id === item.team_id ? team : null;
    rows.push({
      ...empty,
      key: `task:${item.id}`,
      source: "task",
      status: inReview ? "review" : "done",
      title: item.title,
      agentId: item.agent_id ?? ownTeam?.lead_agent_id ?? null,
      teamId: item.team_id ?? null,
      teamName: ownTeam?.name ?? null,
      at: (inReview ? item.updated_at : item.completed_at) ?? item.updated_at,
      threadId: item.execution_thread_id ?? item.thread_id ?? null,
      description: item.description?.trim() ? item.description : null,
      taskId: item.id,
      revision: item.revision,
    });
  }
  return rows;
}

const RUN_STATUS: Partial<Record<string, ResultStatus>> = { completed: "done", queued: "running", running: "running", needs_input: "waiting" };

// A queued run is under way once it started or its time came. The next attempt of a failed run
// waits queued until its retry delay is over (routine_service._queue_retry): nothing runs yet.
function queuedDue(run: Pick<RoutineRun, "started_at" | "scheduled_for">, now: number): boolean {
  if (run.started_at || !run.scheduled_for) return true;
  const at = Date.parse(run.scheduled_for);
  return Number.isNaN(at) || at <= now;
}

/**
 * Routine runs that produced something or are producing it. Left out: runs that failed, were
 * missed or skipped, a quiet routine's "nothing changed" runs, queued runs not yet due (a retry
 * waiting out its delay; Routines lists it), and the hidden routines the board makes to start a
 * task (those show as the task). GET /routines lists only the owner's own. `now` is when the runs
 * were read.
 */
export function routineRows(routines: readonly Pick<Routine, "id" | "name" | "agent_id">[], runs: readonly RoutineRun[], now: number = Date.now()): ResultRow[] {
  const byId = new Map(routines.map((routine) => [routine.id, routine]));
  const rows: ResultRow[] = [];
  for (const run of runs) {
    const routine = byId.get(run.routine_id);
    const status = RUN_STATUS[run.state];
    if (!routine || !status || run.outcome === "no_change") continue;
    if (run.state === "queued" && !queuedDue(run, now)) continue;
    rows.push({
      ...empty,
      key: `run:${run.id}`,
      source: "routine",
      status,
      title: routine.name,
      agentId: routine.agent_id,
      at: run.finished_at ?? run.started_at ?? run.scheduled_for ?? run.created_at,
      threadId: run.thread_id,
      text: run.result?.trim() ? run.result : null,
      routineId: routine.id,
      runId: run.id,
    });
  }
  return rows;
}

const JOB_STATUS: Partial<Record<string, ResultStatus>> = {
  completed: "done", queued: "running", running: "running", waiting: "running", resume: "running", needs_input: "waiting",
};

/**
 * Delegated team work (GET /team/jobs): done, under way, or waiting for you. A job waits for you
 * when a tool use in its agent's chat needs your approval; a question it put to the agent that
 * asked for it is the team's to answer, so that job counts as under way. Failed and cancelled jobs
 * are left out.
 */
export function jobRows(jobs: readonly TeamJob[]): ResultRow[] {
  const rows: ResultRow[] = [];
  for (const job of jobs) {
    const status = job.status === "needs_input" && job.question ? "running" : JOB_STATUS[job.status];
    if (!status || job.kind === "root") continue;
    const threadId = job.requester_thread_id ?? job.assignee_thread_id ?? null;
    rows.push({
      ...empty,
      key: `job:${job.id}`,
      source: "chat",
      status,
      title: jobTitle(job.brief),
      agentId: job.assignee_agent_id,
      at: job.finished_at ?? job.started_at ?? job.created_at,
      threadId,
      workThreadId: job.assignee_thread_id != null && job.assignee_thread_id !== threadId ? job.assignee_thread_id : null,
      text: job.result?.trim() ? job.result : null,
      jobId: job.id,
    });
  }
  return rows;
}

/** Newest first; ties keep a stable order. */
export function sortRows(rows: readonly ResultRow[]): ResultRow[] {
  const time = (row: ResultRow) => {
    const ms = Date.parse(row.at);
    return Number.isNaN(ms) ? 0 : ms;
  };
  return [...rows].sort((a, b) => time(b) - time(a) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

export function needsYou(row: Pick<ResultRow, "status">): boolean {
  return row.status === "review" || row.status === "waiting";
}

export function parseFilter(value: string | null | undefined): ResultFilter {
  return (RESULT_FILTERS as readonly string[]).includes(value ?? "") ? (value as ResultFilter) : "all";
}

export type RowFilter = {
  filter: ResultFilter;
  agentId?: number | null;
  // A client's agents (GET /clients): only their results. null for every client.
  clientAgentIds?: ReadonlySet<number> | null;
  query?: string;
  // The printed name of a row's agent or team, so a search for "Atlas" finds Atlas's work.
  labelOf?: (row: ResultRow) => string | null;
};

export function filterRows(rows: readonly ResultRow[], { filter, agentId = null, clientAgentIds = null, query = "", labelOf }: RowFilter): ResultRow[] {
  const words = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return rows.filter((row) => {
    if (filter === "review" && !needsYou(row)) return false;
    if (filter === "routines" && row.source !== "routine") return false;
    if (filter === "chats" && row.source !== "chat") return false;
    if (filter === "tasks" && row.source !== "task") return false;
    if (agentId !== null && row.agentId !== agentId) return false;
    if (clientAgentIds && (row.agentId === null || !clientAgentIds.has(row.agentId))) return false;
    if (words.length === 0) return true;
    const haystack = [row.title, labelOf?.(row) ?? "", row.teamName ?? "", row.description ?? "", row.text ?? ""].join("\n").toLocaleLowerCase();
    return words.every((word) => haystack.includes(word));
  });
}

export type ResultGroup = { key: "today" | "earlier"; rows: ResultRow[] };

/** Today (since local midnight) and Earlier, each kept in the given order; empty groups left out. */
export function groupRows(rows: readonly ResultRow[], now: number = Date.now()): ResultGroup[] {
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  const today: ResultRow[] = [];
  const earlier: ResultRow[] = [];
  for (const row of rows) (Date.parse(row.at) >= midnight.getTime() ? today : earlier).push(row);
  const groups: ResultGroup[] = [];
  if (today.length) groups.push({ key: "today", rows: today });
  if (earlier.length) groups.push({ key: "earlier", rows: earlier });
  return groups;
}

// Markdown marks at the start of a line, and inline emphasis, so a heading reads as plain words.
function plainLine(line: string): string {
  return line
    .replace(/^\s{0,3}(?:#{1,6}\s+|>\s*|[-*+]\s+|\d+[.)]\s+)/, "")
    .replace(/\*\*|__|`/g, "")
    .trim();
}

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

/** A job's title: the first line of its brief, without markdown, at most `max` characters. */
export function jobTitle(brief: string, max = 90): string {
  const first = brief.split(/\r?\n/).map(plainLine).find(Boolean) ?? "";
  return clip(first, max);
}

/**
 * The first lines of an output, so it can be judged without opening the chat: a short first line
 * becomes the heading, the rest (whitespace folded) the body, clipped to `max` characters.
 */
export function previewOf(text: string | null | undefined, max = 360): { heading: string | null; body: string } | null {
  const lines = (text ?? "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return null;
  const first = plainLine(lines[0]);
  if (lines.length > 1 && first && first.length <= 120) {
    return { heading: first, body: clip(lines.slice(1).map(plainLine).filter(Boolean).join(" "), max) };
  }
  return { heading: null, body: clip(lines.map(plainLine).filter(Boolean).join(" "), max) };
}

/** A file name for Download: the title in lowercase words joined by dashes, then ".md". */
export function downloadName(title: string): string {
  const slug = title.normalize("NFKC").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 60).replace(/-+$/, "");
  return `${slug || "result"}.md`;
}

/**
 * What a task produced (GET /planner/items/{id}/runs): the newest attempt's output, or an earlier
 * one when a later attempt was stopped before it wrote any. null when no attempt has output.
 */
export function latestTaskResult(runs: readonly Pick<WorkRun, "attempt" | "result">[]): string | null {
  let best: Pick<WorkRun, "attempt" | "result"> | null = null;
  for (const run of runs) if (run.result?.trim() && (best === null || run.attempt > best.attempt)) best = run;
  return best?.result ?? null;
}

// What the selected result shows: its output; else what was asked for (a task's text, a job's
// brief); else the question it waits on; else nothing yet.
export type ResultOutput = { kind: "output" | "brief" | "question" | "none"; text: string | null };

const filled = (text: string | null | undefined): text is string => !!text && text.trim() !== "";

export function taskOutput(runs: readonly Pick<WorkRun, "attempt" | "result">[], description: string | null | undefined): ResultOutput {
  const result = latestTaskResult(runs);
  if (filled(result)) return { kind: "output", text: result };
  return filled(description) ? { kind: "brief", text: description } : { kind: "none", text: null };
}

export function jobOutput(job: Pick<TeamJob, "status" | "result" | "brief"> & { question?: string | null }): ResultOutput {
  if (filled(job.result)) return { kind: "output", text: job.result };
  if (job.status === "needs_input" && filled(job.question)) return { kind: "question", text: job.question };
  return filled(job.brief) ? { kind: "brief", text: job.brief } : { kind: "none", text: null };
}

export function rowOutput(row: Pick<ResultRow, "text">): ResultOutput {
  return filled(row.text) ? { kind: "output", text: row.text } : { kind: "none", text: null };
}

/**
 * Who a row names: an agent or team name; a team whose name is not known; nobody (a task with no
 * agent and no team, such as a personal to-do in Review); an agent id missing from the loaded
 * agents (removed); or not known yet, while the agents are not loaded (still loading, or GET
 * /agents failed), so a failed read never reads as a removed agent.
 */
export type RowAgent = { kind: "name"; name: string } | { kind: "team" | "unassigned" | "removed" | "unknown" };

export function rowAgent(row: Pick<ResultRow, "agentId" | "teamId" | "teamName">, names: ReadonlyMap<number, string> | null): RowAgent {
  if (row.teamId !== null) return row.teamName ? { kind: "name", name: row.teamName } : { kind: "team" };
  if (row.agentId === null) return { kind: "unassigned" };
  if (names === null) return { kind: "unknown" };
  const name = names.get(row.agentId);
  return name !== undefined ? { kind: "name", name } : { kind: "removed" };
}

/** Agents that have at least one result, for the agent filter, by name. */
export function agentsWithResults<T extends { id: number; name: string }>(rows: readonly ResultRow[], agents: readonly T[]): T[] {
  const ids = new Set(rows.map((row) => row.agentId).filter((id): id is number => id !== null));
  return agents.filter((agent) => ids.has(agent.id)).sort((a, b) => a.name.localeCompare(b.name));
}
