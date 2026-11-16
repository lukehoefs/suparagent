// Rules for the sidebar's lists, with no runtime imports so node tests can load them.

type ThreadLike = { id: number; agent_id?: number | null; archived_at: string | null; updated_at: string };
type AgentLike = { id: number; name: string; pinned?: boolean; archived_at: string | null };

// Where an agent's row in the sidebar leads: its most recently active conversation that is not
// archived, or a new chat started with it when it has none.
export function agentTarget(threads: readonly ThreadLike[] | null, agentId: number): { kind: "thread"; id: number } | { kind: "new" } {
  let best: ThreadLike | null = null;
  for (const thread of threads ?? []) {
    if (thread.agent_id !== agentId || thread.archived_at !== null) continue;
    if (best === null || Date.parse(thread.updated_at) > Date.parse(best.updated_at)) best = thread;
  }
  return best ? { kind: "thread", id: best.id } : { kind: "new" };
}

// The agents to list: archived ones left out, pinned first, then by name (case-insensitive).
export function sidebarAgents<T extends AgentLike>(agents: readonly T[] | null): T[] {
  return (agents ?? [])
    .filter((agent) => agent.archived_at === null)
    .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

export type RowStatus = "waiting" | "working" | "reset" | "unread" | null;

// What a row shows when several things are true at once. Waiting on the person outranks
// everything because only they can move it on; a conversation that needs a new session is
// next to useless until fixed; unread is the quietest, shown alone only when nothing else is.
export function rowStatus(state: { waiting?: boolean; working?: boolean; brokenSession?: boolean; unread?: boolean }): RowStatus {
  if (state.waiting) return "waiting";
  if (state.working) return "working";
  if (state.brokenSession) return "reset";
  if (state.unread) return "unread";
  return null;
}

// Unread alongside a louder status gets its own small accent dot next to it.
export function showsUnreadDot(status: RowStatus, unread: boolean): boolean {
  return unread && status !== null && status !== "unread";
}

// The short default Recent list: the newest `limit` conversations, plus any that need attention
// (kept by `keep`), in their original order. `showAll` lifts the limit.
export function recentVisible<T extends { id: number }>(threads: readonly T[], limit: number, keep: (thread: T) => boolean, showAll: boolean): T[] {
  if (showAll || threads.length <= limit) return [...threads];
  let plain = 0;
  return threads.filter((thread) => {
    if (keep(thread)) return true;
    plain += 1;
    return plain <= limit;
  });
}

type AttentionRow = { kind: string; title: string; thread_id: number | null };

// The rows that only the person can move on: tool approvals and questions from agents.
export function waitingRows<T extends AttentionRow>(rows: readonly T[] | null | undefined): T[] {
  return (rows ?? []).filter((row) => row.kind === "approval" || row.kind === "question");
}

// A conversation's waiting line ("Atlas wants to use searxng_web_search"), the first that names it.
export function waitingByThread(rows: readonly AttentionRow[] | null | undefined): Map<number, string> {
  const map = new Map<number, string>();
  for (const row of waitingRows(rows)) {
    if (row.thread_id !== null && !map.has(row.thread_id)) map.set(row.thread_id, row.title);
  }
  return map;
}

// The avatar grid: pinned agents; with none pinned, the first agents of the list. At most `limit`.
export function gridAgents<T extends AgentLike>(listed: readonly T[], limit = 6): { agents: T[]; pinned: boolean } {
  const pinned = listed.filter((agent) => agent.pinned);
  return pinned.length > 0 ? { agents: pinned.slice(0, limit), pinned: true } : { agents: listed.slice(0, limit), pinned: false };
}

// The computer badge for an agent: on while its computer runs, off when it has one that is not
// running, none when it has no computer (state "missing" means it was never made).
export function computerBadge(state: string | null | undefined): "on" | "off" | null {
  if (!state || state === "missing" || state === "deleting") return null;
  return state === "running" ? "on" : "off";
}
