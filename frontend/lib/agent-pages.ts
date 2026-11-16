// Addresses of the agent pages. Static export: query strings, never [id] folders, and a trailing
// slash on every path (next.config.ts trailingSlash). Settings live at /agents/edit/ rather than
// /agents/settings/ so the onboarding rule for /settings/ pages (lib/settings-nav.ts) does not apply.
// No runtime imports, so node tests can load it.

export const AGENT_TABS = ["profile", "soul", "skills", "tools", "memory", "computer"] as const;
export type AgentTab = (typeof AGENT_TABS)[number];

export const AGENTS_HREF = "/agents/";
export const BLUEPRINTS_HREF = "/agents/blueprints/";

export function newAgentHref(blueprintId?: string | null): string {
  return blueprintId ? `/agents/new/?blueprint=${encodeURIComponent(blueprintId)}` : "/agents/new/";
}

export function editAgentHref(agentId: number, tab: AgentTab = "profile"): string {
  return tab === "profile" ? `/agents/edit/?id=${agentId}` : `/agents/edit/?id=${agentId}&tab=${tab}`;
}

/** The agent id from ?id=, or null for anything that is not a positive whole number. */
export function parseAgentId(value: string | null | undefined): number | null {
  if (!value || !/^\d{1,9}$/.test(value)) return null;
  const id = Number(value);
  return id > 0 ? id : null;
}

export function parseAgentTab(value: string | null | undefined): AgentTab {
  return (AGENT_TABS as readonly string[]).includes(value ?? "") ? (value as AgentTab) : "profile";
}

/** Where Chat goes for an agent: its latest live conversation, or a new chat started with it. */
export function agentChatHref(threads: readonly { id: number; agent_id?: number | null; archived_at: string | null; updated_at: string }[] | null, agentId: number): string {
  let best: { id: number; updated_at: string } | null = null;
  for (const thread of threads ?? []) {
    if (thread.agent_id !== agentId || thread.archived_at !== null) continue;
    if (best === null || Date.parse(thread.updated_at) > Date.parse(best.updated_at)) best = thread;
  }
  return best ? `/chat/?thread=${best.id}` : `/chat/?agent=${agentId}`;
}
