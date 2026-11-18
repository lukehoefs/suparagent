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

// What waits for the person in the "Waiting for you" band: tool approvals, questions from agents,
// and tasks that came due for review ("Review the task"). Only the person can move these on.
const WAITING_KINDS = new Set(["approval", "question", "due"]);

export function waitingRows<T extends AttentionRow>(rows: readonly T[] | null | undefined): T[] {
  return (rows ?? []).filter((row) => WAITING_KINDS.has(row.kind));
}

/**
 * Each agent's avatar dot (blue working, amber waiting), from what this page knows for certain:
 * the open conversation's live state, and the conversations the needs-you card says wait on the
 * person (`waitingThreadIds`). Waiting beats working.
 */
export function agentActivities(input: {
  live: { agentId: number | null; working: boolean; waiting: boolean };
  threads: readonly { id: number; agent_id?: number | null }[] | null;
  waitingThreadIds: Iterable<number>;
}): Map<number, "working" | "waiting"> {
  const out = new Map<number, "working" | "waiting">();
  const agentOf = new Map((input.threads ?? []).map((thread) => [thread.id, thread.agent_id ?? null]));
  for (const threadId of input.waitingThreadIds) {
    const agentId = agentOf.get(threadId);
    if (agentId != null) out.set(agentId, "waiting");
  }
  const { agentId, working, waiting } = input.live;
  if (agentId !== null) {
    if (waiting) out.set(agentId, "waiting");
    else if (working && !out.has(agentId)) out.set(agentId, "working");
  }
  return out;
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

// The badge for an agent's cloud computer (GET /agents remote_computer): on while its gateway
// answers, off (slashed) when it is offline, needs its key or is turned off. An agent with no cloud
// computer shows its own computer's badge (a Docker computer on a local install), else none.
export function agentComputerBadge(
  remote: { state: string } | null | undefined,
  localState: string | null | undefined,
): "on" | "off" | null {
  if (remote) return remote.state === "online" ? "on" : "off";
  return computerBadge(localState);
}
