// The /agent-groups routes (backend/app/routers/agent_groups.py): the sidebar's stacks of agents.
import { request } from "./api.ts";
import type { AgentGroup, GroupOp } from "./agent-groups.ts";

const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });

export const agentGroups = {
  list: () => request<AgentGroup[]>("/agent-groups"),
  create: (name: string, agentIds: number[] = []) => request<AgentGroup>("/agent-groups", json("POST", { name, agent_ids: agentIds })),
  update: (id: number, change: { name?: string; pinned?: boolean; position?: number }) =>
    request<AgentGroup>(`/agent-groups/${id}`, json("PATCH", change)),
  remove: (id: number) => request<void>(`/agent-groups/${id}`, { method: "DELETE" }),
  setMembers: (id: number, agentIds: number[]) => request<AgentGroup>(`/agent-groups/${id}/members`, json("PUT", { agent_ids: agentIds })),
};

/**
 * Carry out a plan from lib/agent-groups.ts in order. A new group is named `newName`.
 * Returns the group created, if one was.
 */
export async function runGroupOps(ops: readonly GroupOp[], newName: string): Promise<AgentGroup | null> {
  let created: AgentGroup | null = null;
  for (const op of ops) {
    if (op.op === "create") created = await agentGroups.create(newName, op.agentIds);
    else if (op.op === "members") await agentGroups.setMembers(op.groupId, op.agentIds);
    else await agentGroups.remove(op.groupId);
  }
  return created;
}
