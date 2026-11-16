// Rules for the Agents roster page (/agents/): which agents show, in what order, what status a
// card may claim, and the engine line. Only plain lib imports, so node tests can load it.
import { modelLabel } from "./agents.ts";
import { waitingRows } from "./sidebar.ts";

type AgentLike = { id: number; name: string; pinned?: boolean; archived_at: string | null };
type ModelLike = { id: string; label: string; default: boolean };
type EngineLike = { id: string; label: string; available: boolean; reason?: string | null; default_model: string | null; models: readonly ModelLike[] };
type TeamAgentLike = { id: number; state: string };
type ThreadLike = { id: number; agent_id?: number | null };
type AttentionLike = { kind: string; title: string; thread_id: number | null };
type ClientLike = { id: string; agent_ids: readonly number[] };

// The pill colours of the status language: blue working, amber waiting for you, grey idle.
export type RosterStatus = "running" | "waiting" | "idle";

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" });

/** Live agents (pinned first, then by name) and archived ones (by name), apart. */
export function splitRoster<T extends AgentLike>(agents: readonly T[] | null): { live: T[]; archived: T[] } {
  const live: T[] = [];
  const archived: T[] = [];
  for (const agent of agents ?? []) (agent.archived_at === null ? live : archived).push(agent);
  live.sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || byName(a, b));
  archived.sort(byName);
  return { live, archived };
}

/** GET /team's per-agent state as a pill, or null for a state it does not know. */
export function teamStatus(state: string | null | undefined): RosterStatus | null {
  if (state === "working") return "running";
  if (state === "waiting_on_you") return "waiting";
  if (state === "idle") return "idle";
  return null;
}

/** Agents with an approval or a question waiting on the person, found through the threads the
 * attention rows name. Rows for threads not in the list (rooms, jobs) cannot be placed and are skipped. */
export function waitingAgentIds(attention: readonly AttentionLike[] | null | undefined, threads: readonly ThreadLike[] | null | undefined): Set<number> {
  const agentOf = new Map<number, number>();
  for (const thread of threads ?? []) if (thread.agent_id != null) agentOf.set(thread.id, thread.agent_id);
  const ids = new Set<number>();
  for (const row of waitingRows(attention)) {
    const agentId = row.thread_id === null ? undefined : agentOf.get(row.thread_id);
    if (agentId !== undefined) ids.add(agentId);
  }
  return ids;
}

/** The status a card may show, or null when nothing reports one. Only team members have a live
 * state (GET /team); anyone else shows waiting only when an attention row belongs to them. Waiting
 * outranks working: only the person can move it on. */
export function agentStatus(agentId: number, teamAgents: readonly TeamAgentLike[] | null | undefined, waiting: ReadonlySet<number>): RosterStatus | null {
  if (waiting.has(agentId)) return "waiting";
  const member = teamAgents?.find((agent) => agent.id === agentId);
  return member ? teamStatus(member.state) : null;
}

/** The engine line: the engine's name and the model the agent really uses. A null model is the
 * engine's default, named when the engine says which one it is. */
export function engineSummary(
  agent: { provider: string; model: string | null },
  engines: readonly EngineLike[] | null | undefined,
): { engine: string; model: string | null; available: boolean | null; reason: string | null } {
  const engine = engines?.find((item) => item.id === agent.provider);
  if (!engine) return { engine: agent.provider, model: agent.model === null ? null : modelLabel(agent.model), available: null, reason: null };
  const modelId = agent.model ?? engine.default_model ?? engine.models.find((model) => model.default)?.id ?? null;
  const known = modelId === null ? undefined : engine.models.find((model) => model.id === modelId);
  return {
    engine: engine.label,
    model: known ? known.label : modelId === null ? null : modelLabel(modelId),
    available: engine.available,
    reason: engine.reason ?? null,
  };
}

/** The agent ids one client covers, or null for "all clients" (or a client that is gone). */
export function clientAgentIds(clients: readonly ClientLike[] | null | undefined, clientId: string): Set<number> | null {
  if (!clientId) return null;
  const client = clients?.find((item) => item.id === clientId);
  return client ? new Set(client.agent_ids) : null;
}

/** How many clients have at least one of these agents. */
export function clientsCovering(clients: readonly ClientLike[] | null | undefined, agentIds: ReadonlySet<number>): number {
  return (clients ?? []).filter((client) => client.agent_ids.some((id) => agentIds.has(id))).length;
}

/** How many nodes of at least `min` px fit side by side in `width` px with `gap` between them
 * (at least one, at most `count`). Before the first measure (width 0) everything is one row. */
export function fitColumns(width: number, count: number, min: number, gap: number): number {
  if (count <= 0) return 1;
  if (width <= 0) return count;
  return Math.max(1, Math.min(count, Math.floor((width + gap) / (min + gap))));
}

/** Items in rows of `size`. */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  const step = Math.max(1, Math.floor(size));
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += step) rows.push(items.slice(i, i + step));
  return rows;
}
