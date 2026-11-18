// Rules for the sidebar's lists. Its only runtime import is another pure rules file, so node
// tests can load it.

import { toolDisplayName } from "./approval-card.ts";

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
 * the open conversation's live state, the conversations the needs-you card says wait on the
 * person (`waitingThreadIds`), and the conversations with an answer running now
 * (`workingThreadIds`, GET /today/running). Waiting beats working.
 */
export function agentActivities(input: {
  live: { agentId: number | null; working: boolean; waiting: boolean };
  threads: readonly { id: number; agent_id?: number | null }[] | null;
  waitingThreadIds: Iterable<number>;
  workingThreadIds?: Iterable<number>;
}): Map<number, "working" | "waiting"> {
  const out = new Map<number, "working" | "waiting">();
  const agentOf = new Map((input.threads ?? []).map((thread) => [thread.id, thread.agent_id ?? null]));
  for (const threadId of input.waitingThreadIds) {
    const agentId = agentOf.get(threadId);
    if (agentId != null) out.set(agentId, "waiting");
  }
  for (const threadId of input.workingThreadIds ?? []) {
    const agentId = agentOf.get(threadId);
    if (agentId != null && !out.has(agentId)) out.set(agentId, "working");
  }
  const { agentId, working, waiting } = input.live;
  if (agentId !== null) {
    if (waiting) out.set(agentId, "waiting");
    else if (working && !out.has(agentId)) out.set(agentId, "working");
  }
  return out;
}

// An answer running now (GET /today/running) and the tool calls it waits on.
type RunningCall = { id: string; tool: string; summary: string | null };
type RunningLike = { thread_id: number; approvals: readonly RunningCall[] };

// The conversations with an answer running now that waits for nothing: those show as working.
// One that waits on a call is in the needs-you card, and waiting outranks working anyway.
export function workingThreadIds(running: readonly RunningLike[] | null | undefined): Set<number> {
  return new Set((running ?? []).filter((turn) => turn.approvals.length === 0).map((turn) => turn.thread_id));
}

/**
 * The tool an approval row waits on, by the name the person knows ("searxng_web_search", not the
 * MCP alias): the row's own `tool` when the server sends it, else that call among the running
 * answers (matched by the row's key, "approval:<id>"). null for any other row, or when the tool is
 * not known; the row's own title is shown then.
 */
export function waitingTool(
  row: { kind: string; key?: string; title: string; tool?: string | null },
  running: readonly RunningLike[] | null | undefined,
): string | null {
  if (row.kind !== "approval") return null;
  if (row.tool) return toolDisplayName(row.tool, row.title);
  const id = row.key?.startsWith("approval:") ? row.key.slice("approval:".length) : "";
  if (!id) return null;
  for (const turn of running ?? []) {
    const call = turn.approvals.find((item) => item.id === id);
    if (call) return toolDisplayName(call.tool, call.summary);
  }
  return null;
}

export type WaitingLine = { title: string; tool: string | null };

// A conversation's waiting line, from the first row that names it: the tool an approval waits on
// (shown as "Atlas wants to use searxng_web_search" once the agent is known), and the row's title.
export function waitingByThread(
  rows: readonly (AttentionRow & { key?: string; tool?: string | null })[] | null | undefined,
  running?: readonly RunningLike[] | null,
): Map<number, WaitingLine> {
  const map = new Map<number, WaitingLine>();
  for (const row of waitingRows(rows)) {
    if (row.thread_id !== null && !map.has(row.thread_id)) map.set(row.thread_id, { title: row.title, tool: waitingTool(row, running) });
  }
  return map;
}

// True while a scrolled list has more below its visible end (the sidebar then fades its bottom
// edge, so a row cut there reads as "scroll for more" rather than as broken).
export function hasMoreBelow(box: { scrollTop: number; scrollHeight: number; clientHeight: number }): boolean {
  return box.scrollHeight - box.clientHeight - box.scrollTop > 1;
}

export type PersonRole = "owner" | "admin" | "member" | "viewer";
type SessionLike = { kind: string; scopes: readonly string[]; label: string | null; role?: PersonRole | null; display_name?: string | null };

// Whoever is signed in has no name on the session (the owner on this computer, the desktop app):
// the owner's name is in their profile, which an owner or admin may read (as Today's greeting does).
export function wantsProfileName(session: SessionLike | null): boolean {
  if (session?.display_name?.trim()) return false;
  return session === null || session.scopes.includes("admin");
}

/**
 * The person the sidebar footer names: the session's own name, else the owner's profile name,
 * else the session's label; null when none is known (the footer then says "You"). The role is the
 * session's, else the owner's when this computer's owner is acting (no session, or the desktop app
 * or this machine trusted with admin rights and no person behind it).
 */
export function signedInPerson(session: SessionLike | null, profileName: string | null): { name: string | null; role: PersonRole | null } {
  const own = session?.display_name?.trim() || null;
  const profile = wantsProfileName(session) ? profileName?.trim() || null : null;
  const name = own ?? profile ?? (session?.label?.trim() || null);
  const ownerHere = session === null || ((session.kind === "loopback" || session.kind === "desktop") && session.scopes.includes("admin"));
  return { name, role: session?.role ?? (ownerHere ? "owner" : null) };
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
