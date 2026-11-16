// Pure rules for the agent settings page (/agents/edit/): size limits, client membership, team
// member changes, which approval modes a device may pick, the memory switches, and which tabs a
// person may open. No runtime imports, so node tests can load it.

/** Standing instructions are capped in UTF-8 bytes (backend schemas/agent.py INSTRUCTIONS_MAX_BYTES). */
export const INSTRUCTIONS_MAX_BYTES = 24_000;
/** The person's part of SOUL.md is refused above this (services/agent_soul.py MAX_USER_BYTES). */
export const SOUL_MAX_BYTES = 24 * 1024;
/** Only this much of SOUL.md reaches a conversation (services/agent_soul.py MAX_PROMPT_BYTES). */
export const SOUL_PROMPT_BYTES = 16 * 1024;

export function utf8Bytes(text: string): number {
  return new TextEncoder().encode(text).length;
}

type ClientLike = { id: string; agent_ids: number[] };

/** The clients an agent works for (clients.json is many-to-many). */
export function clientIdsOf(clients: readonly ClientLike[] | null | undefined, agentId: number): string[] {
  return (clients ?? []).filter((client) => client.agent_ids.includes(agentId)).map((client) => client.id);
}

/** Order-insensitive equality of two id lists. */
export function sameIds<T>(a: readonly T[], b: readonly T[]): boolean {
  const left = new Set(a);
  const right = new Set(b);
  return left.size === right.size && [...left].every((id) => right.has(id));
}

/**
 * The whole client list with one agent's membership set to `chosen`: added where chosen and missing,
 * removed where not chosen. Other agents' ids are untouched; unchanged clients keep their object.
 */
export function withAgentClients<T extends ClientLike>(clients: readonly T[], agentId: number, chosen: readonly string[]): T[] {
  const want = new Set(chosen);
  return clients.map((client) => {
    const has = client.agent_ids.includes(agentId);
    if (want.has(client.id) === has) return client;
    return {
      ...client,
      agent_ids: has ? client.agent_ids.filter((id) => id !== agentId) : [...client.agent_ids, agentId],
    };
  });
}

/**
 * Team calls for a lead's ticked agents: who to add and who to remove, compared with the team's
 * current members. The lead itself is never a member of its own list.
 */
export function teamChanges(choices: Readonly<Record<number, boolean>>, members: readonly number[], leadId: number): { add: number[]; remove: number[] } {
  const add: number[] = [];
  const remove: number[] = [];
  for (const [key, included] of Object.entries(choices)) {
    const id = Number(key);
    if (id === leadId) continue;
    const member = members.includes(id);
    if (included && !member) add.push(id);
    else if (!included && member) remove.push(id);
  }
  return { add, remove };
}

/**
 * The approval modes this device may choose. Only the owner may move an agent to "accept_edits"
 * (a restricted device gets 403); a device may keep it when the agent already has it.
 */
export function approvalChoices<T extends { value: string }>(modes: readonly T[], saved: string, admin: boolean): T[] {
  return modes.filter((mode) => admin || mode.value !== "accept_edits" || saved === "accept_edits");
}

export type MemoryFlag = "memory_enabled" | "recall_enabled" | "memory_upkeep";

/**
 * The three memory switches. Recall and memory upkeep only act while the notes are on (the backend
 * checks both), so they are shown disabled then, keeping their own saved value.
 */
export function memorySwitches(agent: { memory_enabled?: boolean; recall_enabled?: boolean; memory_upkeep?: boolean }) {
  const notes = agent.memory_enabled ?? true;
  return {
    notes,
    recall: agent.recall_enabled ?? true,
    upkeep: agent.memory_upkeep ?? true,
    dependentsDisabled: !notes,
  };
}

/** Whether any of the page's tabs holds unsaved work. */
export function anyDirty(flags: Readonly<Record<string, boolean>>): boolean {
  return Object.values(flags).some(Boolean);
}

/**
 * The tabs a person who may manage agents but is not an admin can use. Their device may only PATCH
 * the agent (backend auth/policy.py MANAGE_ROUTES): SOUL.md, skills, custom MCP tools, the notes
 * files and computers are admin-only routes, so those tabs would only meet 403s. So are routines,
 * the always-allow rules and the daily logs, so the Routines tab is the owner's too. The memory
 * switches are agent fields, so the Memory tab stays, with its switches only.
 */
export const MEMBER_TABS: readonly string[] = ["profile", "memory"];

/** The tabs to show, in page order. */
export function visibleTabs<T extends string>(all: readonly T[], admin: boolean): T[] {
  return admin ? [...all] : all.filter((tab) => MEMBER_TABS.includes(tab));
}

/** The tab to open: the one asked for when it is shown, otherwise the first shown tab. */
export function openTab<T extends string>(asked: T, shown: readonly T[]): T {
  return shown.includes(asked) || shown.length === 0 ? asked : shown[0];
}
