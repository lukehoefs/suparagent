// Agent groups in the sidebar's pinned grid (design: Main.html, README "Pinned agents and groups"):
// which tiles the grid shows, a stack's one status dot, and what each grouping gesture asks the
// backend to do. No runtime imports, so node tests can load it.

export type AgentGroup = {
  id: number;
  name: string;
  pinned: boolean;
  position: number;
  created_at: string;
  // The group's live agents, by name (backend/app/routers/agent_groups.py).
  agent_ids: number[];
};

type AgentLike = { id: number; name: string; pinned?: boolean; archived_at: string | null };
export type Activity = "working" | "waiting" | null;

export type GridTile<A> = { kind: "agent"; agent: A } | { kind: "group"; group: AgentGroup; members: A[] };

// How many tiles the grid shows (two rows of three); "All agents" reaches the rest.
export const GRID_LIMIT = 6;
// A stack shows this many of its members' faces.
export const STACK_FACES = 3;
// A room takes 1 to 12 members (backend/app/rooms/service.py); "Message all" needs two at least.
export const ROOM_MAX_MEMBERS = 12;

/**
 * The pinned grid: pinned agents that are not inside a shown stack, then the pinned groups that
 * have a live member, by position. With nothing pinned at all, the first agents of the list.
 * `listed` is the sidebar's agent list (live agents, pinned first, then by name).
 */
export function pinnedTiles<A extends AgentLike>(listed: readonly A[], groups: readonly AgentGroup[] | null, limit = GRID_LIMIT): { tiles: GridTile<A>[]; pinned: boolean } {
  const byId = new Map(listed.map((agent) => [agent.id, agent]));
  const stacks = [...(groups ?? [])]
    .filter((group) => group.pinned)
    .sort((a, b) => a.position - b.position || a.id - b.id)
    .map((group) => ({ group, members: group.agent_ids.map((id) => byId.get(id)).filter((agent): agent is A => agent !== undefined) }))
    .filter((stack) => stack.members.length > 0);
  const stacked = new Set(stacks.flatMap((stack) => stack.members.map((agent) => agent.id)));
  const agents = listed.filter((agent) => agent.pinned && !stacked.has(agent.id));
  if (agents.length + stacks.length > 0) {
    const tiles: GridTile<A>[] = [
      ...agents.map((agent) => ({ kind: "agent" as const, agent })),
      ...stacks.map((stack) => ({ kind: "group" as const, ...stack })),
    ];
    return { tiles: tiles.slice(0, limit), pinned: true };
  }
  return { tiles: listed.slice(0, limit).map((agent) => ({ kind: "agent" as const, agent })), pinned: false };
}

// The one dot a stack shows: the most urgent status inside. Waiting on the person beats working.
export function groupActivity(activities: readonly Activity[]): Activity {
  if (activities.includes("waiting")) return "waiting";
  if (activities.includes("working")) return "working";
  return null;
}

// How many members share each status, for the stack's spoken label.
export function activityCounts(activities: readonly Activity[]): { waiting: number; working: number } {
  return {
    waiting: activities.filter((a) => a === "waiting").length,
    working: activities.filter((a) => a === "working").length,
  };
}

export function groupOf(groups: readonly AgentGroup[] | null, agentId: number): AgentGroup | null {
  return (groups ?? []).find((group) => group.agent_ids.includes(agentId)) ?? null;
}

export type GroupOp =
  | { op: "create"; agentIds: number[] }
  | { op: "members"; groupId: number; agentIds: number[] }
  | { op: "delete"; groupId: number };

export type GroupTarget = { kind: "agent"; id: number } | { kind: "group"; id: number };

/**
 * Put `agentId` with `target`: dropped on (or "Group with…") another agent, that agent's group,
 * or a new group of the two when it has none; dropped on a stack or into a tray, that group.
 * The group it leaves goes when it was the last one in it. Nothing to do: an empty list.
 */
export function planGroupWith(groups: readonly AgentGroup[] | null, agentId: number, target: GroupTarget): GroupOp[] {
  if (target.kind === "agent" && target.id === agentId) return [];
  const from = groupOf(groups, agentId);
  const into = target.kind === "group" ? (groups ?? []).find((group) => group.id === target.id) ?? null : groupOf(groups, target.id);
  if (target.kind === "group" && into === null) return [];
  if (into !== null && from !== null && into.id === from.id) return [];
  const ops: GroupOp[] = into !== null
    ? [{ op: "members", groupId: into.id, agentIds: [...into.agent_ids, agentId] }]
    : [{ op: "create", agentIds: [target.id, agentId] }];
  if (from !== null && from.agent_ids.every((id) => id === agentId)) ops.push({ op: "delete", groupId: from.id });
  return ops;
}

// Take `agentId` out of its group ("Remove from group", or dragged out of the tray). The last
// member leaving ends the group.
export function planRemove(groups: readonly AgentGroup[] | null, agentId: number): GroupOp[] {
  const from = groupOf(groups, agentId);
  if (from === null) return [];
  const rest = from.agent_ids.filter((id) => id !== agentId);
  return rest.length > 0 ? [{ op: "members", groupId: from.id, agentIds: rest }] : [{ op: "delete", groupId: from.id }];
}

// What "Group with…" offers an agent: the groups it is not in, then the agents in no group.
export function groupChoices<A extends AgentLike>(listed: readonly A[], groups: readonly AgentGroup[] | null, agentId: number): { groups: AgentGroup[]; agents: A[] } {
  const own = groupOf(groups, agentId);
  const live = new Set(listed.map((agent) => agent.id));
  return {
    groups: [...(groups ?? [])]
      .filter((group) => group.id !== own?.id && group.agent_ids.some((id) => live.has(id)))
      .sort((a, b) => a.position - b.position || a.id - b.id),
    agents: listed.filter((agent) => agent.id !== agentId && groupOf(groups, agent.id) === null),
  };
}

// Recent, while a tray is open: only the conversations of the group's agents.
export function groupThreads<T extends { agent_id?: number | null }>(threads: readonly T[], group: AgentGroup | null): T[] {
  if (group === null) return [...threads];
  const members = new Set(group.agent_ids);
  return threads.filter((thread) => thread.agent_id != null && members.has(thread.agent_id));
}

type RoomLike = { id: number; name: string; members: { agent_id: number }[] };

// "Message all" opens a room with exactly the group's agents: one that exists, else a new one.
export function canMessageAll(memberIds: readonly number[]): boolean {
  return memberIds.length >= 2 && memberIds.length <= ROOM_MAX_MEMBERS;
}

// The newest room whose members are exactly these agents, or null.
export function roomForGroup<R extends RoomLike>(rooms: readonly R[], memberIds: readonly number[]): R | null {
  const wanted = new Set(memberIds);
  const matches = rooms.filter((room) => room.members.length === wanted.size && room.members.every((member) => wanted.has(member.agent_id)));
  return matches.sort((a, b) => b.id - a.id)[0] ?? null;
}

// A room name no live room uses yet: the group's name, else "name 2", "name 3"… (rooms are unique by name).
export function freeRoomName(rooms: readonly RoomLike[], name: string, limit = 80): string {
  const taken = new Set(rooms.map((room) => room.name));
  const base = name.trim().slice(0, limit) || name;
  if (!taken.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const suffix = ` ${n}`;
    const candidate = `${base.slice(0, limit - suffix.length)}${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
}

// What a drag carries between tiles. `from`: the group whose tray it was dragged out of, or null.
export type DragItem = { agentId: number; from: number | null };
export const DRAG_TYPE = "application/x-lukethomas-agent";

export function encodeDrag(item: DragItem): string {
  return JSON.stringify(item);
}

export function decodeDrag(raw: string | null | undefined): DragItem | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<DragItem>;
    if (typeof value.agentId !== "number" || !Number.isSafeInteger(value.agentId)) return null;
    const from = typeof value.from === "number" && Number.isSafeInteger(value.from) ? value.from : null;
    return { agentId: value.agentId, from };
  } catch {
    return null;
  }
}

// A group name as the backend takes it: one line, 1 to 80 characters. null: not a usable name.
export function cleanGroupName(raw: string): string | null {
  const name = raw.trim();
  if (!name || name.length > 80 || /[\u0000-\u001f\u007f]/.test(name)) return null;
  return name;
}
