"use client";

import { useCallback, useRef, useState } from "react";
import { api } from "@/lib/api";
import { countedCustomServers, createLimiter, enabledSkillCount, grantedToolCount, type AgentCounts } from "@/lib/roster-counts";

// At most this many count requests in flight for the whole page.
const MAX_IN_FLIGHT = 4;

export type CountState = { loading: true } | ({ loading: false } & AgentCounts);

type Servers = { custom: string[]; community: string[] };

// Skill and tool counts for the roster cards, owner and admin only (every route behind them is).
// A card asks once it scrolls into view; each agent is read once while the page is open, and a
// count that fails stays null so the card leaves it out.
export function useAgentCounts(enabled: boolean): { counts: ReadonlyMap<number, CountState>; request: (agentId: number) => void } {
  const [counts, setCounts] = useState<ReadonlyMap<number, CountState>>(() => new Map());
  const [limit] = useState(() => createLimiter(MAX_IN_FLIGHT));
  const asked = useRef(new Set<number>());
  const servers = useRef<Promise<Servers | null> | null>(null);

  // The servers whose grants count, read once for every agent.
  const readServers = useCallback((): Promise<Servers | null> => {
    servers.current ??= Promise.all([limit(() => api.listCustomMcp()), limit(() => api.listMarketplaceConnections())])
      .then(([custom, community]) => ({ custom: countedCustomServers(custom), community: community.map((connection) => connection.id) }))
      .catch(() => null);
    return servers.current;
  }, [limit]);

  const request = useCallback((agentId: number) => {
    if (!enabled || asked.current.has(agentId)) return;
    asked.current.add(agentId);
    setCounts((prev) => new Map(prev).set(agentId, { loading: true }));
    const skills = limit(() => api.listSkills(agentId)).then(enabledSkillCount, () => null);
    const tools = readServers()
      .then(async (found) => {
        if (!found) return null;
        const grants = await Promise.all([
          ...found.custom.map((id) => limit(() => api.getCustomMcpGrants(id, agentId))),
          ...found.community.map((id) => limit(() => api.getMarketplaceAgentGrants(id, agentId))),
        ]);
        return grantedToolCount(grants);
      })
      .catch(() => null);
    void Promise.all([skills, tools]).then(([skillCount, toolCount]) => {
      setCounts((prev) => new Map(prev).set(agentId, { loading: false, skills: skillCount, tools: toolCount }));
    });
  }, [enabled, limit, readServers]);

  return { counts, request };
}
