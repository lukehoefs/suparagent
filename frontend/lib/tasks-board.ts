// The Tasks board (design: Tasks.html): the lanes over the backend's columns, what each lane and
// card says, which one action a card offers, filtering, and moving a card between columns. Pure
// and free of runtime imports except relative-time, so node tests load it; the page translates
// the keys it returns.
import type { WorkColumn, WorkItem } from "./planner-api";
import { relativeTime, startOfDay } from "./relative-time.ts";

// The status language of ui/StatusPill: colour means status only, and every status has a word.
export type BoardStatus = "done" | "waiting" | "denied" | "running" | "idle";
export type BadgeTone = "neutral" | "success" | "warning" | "running";

export const TASKS_HREF = "/tasks/";

// The default board's columns (backend services/work_planner.py COLUMNS), by their stable key.
const COLUMN_KEYS = ["backlog", "ready", "doing", "waiting", "review", "done"] as const;
type ColumnKey = (typeof COLUMN_KEYS)[number];
const isColumnKey = (key: string): key is ColumnKey => (COLUMN_KEYS as readonly string[]).includes(key);

/** The message key for a known column, or null for a column the backend named itself. */
export function columnLabelKey(column: Pick<WorkColumn, "key">): string | null {
  return isColumnKey(column.key) ? `tasks.column.${column.key}` : null;
}

// The order the board lists its columns in (the card menu's Move to): what needs you first, then
// work under way, then what is still to start, and Done last. Moving a card still goes by column id.
const DISPLAY_ORDER: readonly ColumnKey[] = ["waiting", "review", "doing", "ready", "backlog", "done"];

/** The columns in display order; a column the backend named itself follows, in the backend's order. */
export function displayColumns<T extends Pick<WorkColumn, "key">>(columns: readonly T[]): T[] {
  const rank = (column: T) => {
    const index = (DISPLAY_ORDER as readonly string[]).indexOf(column.key);
    return index === -1 ? DISPLAY_ORDER.length : index;
  };
  // Array sort is stable, so columns of the same rank keep the backend's order.
  return [...columns].sort((a, b) => rank(a) - rank(b));
}

// The board shows four lanes over the backend's six columns (design: Tasks.html): Waiting for you
// (waiting and review), Running (doing), To do (ready and backlog) and Done. Each card keeps its
// real column; `columns` is the order a lane lists its cards in, and `drop` the column a card
// dropped on the lane is filed in.
const LANES: readonly { key: string; labelKey: string; columns: readonly ColumnKey[]; drop: ColumnKey }[] = [
  { key: "attention", labelKey: "tasks.lane.attention", columns: ["waiting", "review"], drop: "waiting" },
  { key: "running", labelKey: "tasks.lane.running", columns: ["doing"], drop: "doing" },
  { key: "todo", labelKey: "tasks.lane.todo", columns: ["ready", "backlog"], drop: "backlog" },
  { key: "done", labelKey: "tasks.lane.done", columns: ["done"], drop: "done" },
];

export type BoardLane<T> = {
  key: string;
  // The heading's message key, or null for a column the backend named itself (`name` then).
  labelKey: string | null;
  name: string;
  columns: T[];
  // Where a card dropped on the lane is filed.
  target: T;
};

/**
 * The lanes the board shows, in order. A lane is left out when the board has none of its columns,
 * and a column the backend named itself follows as a lane of its own, in the backend's order.
 */
export function boardLanes<T extends Pick<WorkColumn, "id" | "key" | "name">>(columns: readonly T[]): BoardLane<T>[] {
  const lanes: BoardLane<T>[] = [];
  for (const lane of LANES) {
    const own = lane.columns.flatMap((key) => columns.filter((column) => column.key === key));
    if (own.length === 0) continue;
    const target = columns.find((column) => column.key === lane.drop) ?? own[0];
    lanes.push({ key: lane.key, labelKey: lane.labelKey, name: "", columns: own, target });
  }
  for (const column of columns) {
    if (!isColumnKey(column.key)) lanes.push({ key: `column:${column.id}`, labelKey: null, name: column.name, columns: [column], target: column });
  }
  return lanes;
}

/** The lane's cards: each of its columns' cards in turn, in board order (groupByColumn). */
export function laneCards<C extends Pick<WorkColumn, "id">, T>(lane: Pick<BoardLane<C>, "columns">, groups: ReadonlyMap<number, readonly T[]>): T[] {
  return lane.columns.flatMap((column) => groups.get(column.id) ?? []);
}

/** True when the column is one of the lane's: a card dropped on its own lane stays where it is. */
export function inLane<C extends Pick<WorkColumn, "id">>(lane: Pick<BoardLane<C>, "columns">, columnId: number): boolean {
  return lane.columns.some((column) => column.id === columnId);
}

/**
 * The tint of a column's count: amber where you are needed, blue in progress, green done. An empty
 * column is grey whatever it is: an amber "0" would say you are needed when nothing is there.
 */
export function columnTone(column: Pick<WorkColumn, "key">, count: number): BadgeTone {
  if (count === 0) return "neutral";
  switch (column.key) {
    case "done": return "success";
    case "waiting": case "review": return "warning";
    case "doing": return "running";
    default: return "neutral";
  }
}

export type CardStatus = { status: BoardStatus; key: string } | { status: BoardStatus; label: string };

// Where the card sits on the board, when no agent attempt says more.
function columnStatus(column: Pick<WorkColumn, "key" | "name">): CardStatus {
  switch (column.key) {
    case "done": return { status: "done", key: "tasks.state.done" };
    case "review": return { status: "waiting", key: "tasks.state.review" };
    case "waiting": return { status: "waiting", key: "tasks.state.waiting" };
    case "doing": return { status: "running", key: "tasks.state.inProgress" };
    case "ready": return { status: "idle", key: "tasks.state.ready" };
    case "backlog": return { status: "idle", key: "tasks.state.toDo" };
    default: return { status: "idle", label: column.name };
  }
}

/**
 * The conversation of the card that holds an approval waiting for you (the shell's needs-you rows,
 * GET /needs-you, kind "approval"): the agent attempt's own, else the linked one. Null when there
 * is none, or the card is archived or done.
 */
export function approvalThread(
  item: Pick<WorkItem, "execution_thread_id" | "thread_id" | "archived">,
  column: Pick<WorkColumn, "key">,
  waiting: ReadonlySet<number>,
): number | null {
  if (item.archived || column.key === "done") return null;
  for (const thread of [item.execution_thread_id, item.thread_id]) {
    if (thread != null && waiting.has(thread)) return thread;
  }
  return null;
}

/** The conversations with an approval waiting for you, from the shell's needs-you rows. */
export function approvalThreads(rows: readonly { kind: string; thread_id: number | null }[] | null | undefined): Set<number> {
  const threads = new Set<number>();
  for (const row of rows ?? []) {
    if (row.kind === "approval" && row.thread_id !== null) threads.add(row.thread_id);
  }
  return threads;
}

/**
 * The card's state as a word and a dot. The latest agent attempt (execution_state) wins while it
 * says something about now; then an approval waiting in the card's conversation (`approval`);
 * then the column's own state.
 */
export function cardStatus(item: Pick<WorkItem, "execution_state">, column: Pick<WorkColumn, "key" | "name">, approval = false): CardStatus {
  switch (item.execution_state) {
    case "needs_input": return { status: "waiting", key: "tasks.state.needsApproval" };
    case "running": case "claimed": return { status: "running", key: "tasks.state.working" };
    case "queued": return { status: "idle", key: "tasks.state.queued" };
    case "scheduled": return { status: "idle", key: "tasks.state.scheduled" };
    case "failed": return { status: "denied", key: "tasks.state.failed" };
    case "interrupted": return { status: "denied", key: "tasks.state.interrupted" };
    case "missed": return { status: "denied", key: "tasks.state.missed" };
    // Finished work stays in its column until you review it (WorkExecutionPanel).
    case "completed": return column.key === "done" ? { status: "done", key: "tasks.state.done" } : { status: "waiting", key: "tasks.state.readyForReview" };
    default: return approval && column.key !== "done" ? { status: "waiting", key: "tasks.state.needsApproval" } : columnStatus(column);
  }
}

// Column states that only repeat the heading of the lane the card sits in (Waiting in Waiting for
// you, In progress in Running, To do in To do, Done in Done).
const LANE_WORDS = new Set(["tasks.state.waiting", "tasks.state.inProgress", "tasks.state.toDo", "tasks.state.done"]);

/**
 * The state the card's meta line shows, or null when it would only repeat its lane's heading
 * (design: Tasks.html, "Atlas · needs an approval", "Fleet · due today"). An agent attempt or a
 * waiting approval shows, except Working in the Running lane (the In progress column); of the
 * column states only Needs your review and Ready do, which tell a card apart from the others in
 * its lane.
 */
export function cardMetaStatus(item: Pick<WorkItem, "execution_state">, column: Pick<WorkColumn, "key" | "name">, approval = false): CardStatus | null {
  const state = cardStatus(item, column, approval);
  // A column the backend named itself is a lane of its own: its name is the heading.
  if (!("key" in state) || LANE_WORDS.has(state.key)) return null;
  return state.key === "tasks.state.working" && column.key === "doing" ? null : state;
}

export type CardAction =
  | { kind: "review"; threadId: number }
  | { kind: "open"; threadId: number }
  | { kind: "stop" }
  | { kind: "cancel" }
  | { kind: "history" };

/**
 * The one action a card shows beside its title, or null (the menu has the rest). `approval` is
 * the conversation with an approval waiting for you (approvalThread).
 */
export function cardAction(
  item: Pick<WorkItem, "execution_state" | "execution_thread_id" | "thread_id" | "archived">,
  column: Pick<WorkColumn, "key">,
  approval: number | null = null,
): CardAction | null {
  if (item.archived) return null;
  const run = item.execution_thread_id ?? null;
  switch (item.execution_state) {
    case "needs_input": return run !== null ? { kind: "review", threadId: run } : { kind: "history" };
    case "running": case "claimed": return { kind: "stop" };
    case "queued": case "scheduled": return { kind: "cancel" };
    case "completed": if (column.key !== "done" && run !== null) return { kind: "review", threadId: run }; break;
  }
  if (approval !== null && column.key !== "done") return { kind: "review", threadId: approval };
  // A card waiting for you or for your review: its conversation, else its run and history.
  if (column.key === "waiting" || column.key === "review") {
    const thread = run ?? item.thread_id ?? null;
    return thread !== null ? { kind: "review", threadId: thread } : { kind: "history" };
  }
  if (column.key === "done") {
    const thread = run ?? item.thread_id ?? null;
    if (thread !== null) return { kind: "open", threadId: thread };
  }
  return null;
}

// The attempt states that can still be stopped or cancelled (WorkExecutionPanel activeStates).
export const ACTIVE_RUN_STATES = ["scheduled", "queued", "claimed", "running", "needs_input"] as const;

/** The newest attempt that is still active, from GET /planner/items/{id}/runs (newest first). */
export function activeRun<T extends { state: string; attempt: number }>(runs: readonly T[]): T | null {
  let found: T | null = null;
  for (const run of runs) {
    if ((ACTIVE_RUN_STATES as readonly string[]).includes(run.state) && (found === null || run.attempt > found.attempt)) found = run;
  }
  return found;
}

export type TimeLine = { key: string; params: Record<string, string | number>; when?: { key: string; n: number } };

const DAY = 86_400_000;
// 24-hour time, as Today and Routines show it (lib/today.ts, lib/routines.ts): "finished 07:35".
const time = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const date = (ms: number, now: number) =>
  new Date(ms).toLocaleDateString([], new Date(ms).getFullYear() === new Date(now).getFullYear() ? { month: "short", day: "numeric" } : { year: "numeric", month: "short", day: "numeric" });

/**
 * The card's time: its deadline while it is open, when it finished once done, else when it last
 * changed. Date-only deadlines are due through the whole local day (lib/planner.ts isOverdue).
 */
export function cardTime(
  item: Pick<WorkItem, "due_date" | "due_at" | "completed_at" | "archived" | "updated_at">,
  now: number = Date.now(),
): TimeLine | null {
  if (item.completed_at) {
    const at = Date.parse(item.completed_at);
    if (!Number.isNaN(at)) {
      return startOfDay(at) === startOfDay(now) ? { key: "tasks.time.finishedAt", params: { time: time(at) } } : { key: "tasks.time.finishedOn", params: { date: date(at, now) } };
    }
  }
  const dueAt = item.due_at ? Date.parse(item.due_at) : NaN;
  const dueDay = item.due_date ? new Date(`${item.due_date}T12:00`).getTime() : NaN;
  if (!Number.isNaN(dueAt) || !Number.isNaN(dueDay)) {
    const at = Number.isNaN(dueAt) ? dueDay : dueAt;
    const days = Math.round((startOfDay(at) - startOfDay(now)) / DAY);
    const overdue = !item.archived && (Number.isNaN(dueAt) ? days < 0 : dueAt < now);
    if (overdue) return { key: "tasks.time.overdue", params: { date: days === 0 ? time(at) : date(at, now) } };
    if (days === 0) return Number.isNaN(dueAt) ? { key: "tasks.time.dueToday", params: {} } : { key: "tasks.time.dueTodayAt", params: { time: time(at) } };
    if (days === 1) return { key: "tasks.time.dueTomorrow", params: {} };
    return { key: "tasks.time.dueOn", params: { date: date(at, now) } };
  }
  const changed = relativeTime(item.updated_at, now);
  if (!changed) return null;
  if ("date" in changed) return { key: "tasks.time.updatedOn", params: { date: changed.date } };
  // "Updated {when}", where {when} is the shared relative time ("5 min ago"), translated first.
  return { key: "tasks.time.updated", params: {}, when: { key: changed.key, n: "n" in changed ? changed.n : 0 } };
}

/** True when the card's time line reads as overdue (shown in the denied colour, with the word). */
export function isOverdueLine(line: TimeLine | null): boolean {
  return line?.key === "tasks.time.overdue";
}

// "" all, "unassigned", "agent:<id>" or "team:<id>": the same values as WorkItemEditor's assignee.
export type AssigneeFilter = string;

export function matchesFilters(
  item: Pick<WorkItem, "title" | "description" | "agent_id" | "team_id">,
  query: string,
  assignee: AssigneeFilter,
): boolean {
  const words = query.trim().toLowerCase();
  if (words && !`${item.title}\n${item.description}`.toLowerCase().includes(words)) return false;
  if (!assignee) return true;
  if (assignee === "unassigned") return item.agent_id === null && item.team_id === null;
  const [kind, raw] = assignee.split(":");
  const id = Number(raw);
  if (kind === "agent") return item.agent_id === id;
  if (kind === "team") return item.team_id === id;
  return true;
}

/** Each column's cards in board order (position, then id). Cards of an unknown column are left out. */
export function groupByColumn<T extends Pick<WorkItem, "id" | "column_id" | "position">>(columns: readonly Pick<WorkColumn, "id">[], items: readonly T[]): Map<number, T[]> {
  const groups = new Map<number, T[]>(columns.map((column) => [column.id, []]));
  for (const item of items) groups.get(item.column_id)?.push(item);
  for (const list of groups.values()) list.sort((a, b) => a.position - b.position || a.id - b.id);
  return groups;
}

/**
 * The board with one card moved to the end of another column, as the backend files it
 * (services/work_planner.py: a new column means the next position there). Unchanged when the card
 * is missing or already in that column.
 */
export function moveCard<T extends Pick<WorkItem, "id" | "column_id" | "position">>(items: readonly T[], id: number, columnId: number): T[] {
  const card = items.find((item) => item.id === id);
  if (!card || card.column_id === columnId) return items as T[];
  const last = items.reduce((max, item) => (item.column_id === columnId && item.id !== id ? Math.max(max, item.position) : max), 0);
  return items.map((item) => (item.id === id ? { ...item, column_id: columnId, position: last + 1 } : item));
}

/** The task named by ?task=, or null for anything that is not a positive whole number. */
export function parseTaskId(value: string | null | undefined): number | null {
  if (!value || !/^[1-9]\d{0,14}$/.test(value)) return null;
  return Number(value);
}

export function taskHref(id: number): string {
  return `${TASKS_HREF}?task=${id}`;
}
