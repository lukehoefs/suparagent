"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type ClaudeAccount, type Engine, type PortalClient } from "@/lib/api";
import type { ComposioAccount } from "@/lib/connected-apps";
import type { CustomMcpConnection, CustomMcpTool } from "@/lib/custom-mcp";

// One switched-on MCP server and the tools its last test saw (null with `error` when they could not be read).
export type ToolServer = { conn: CustomMcpConnection; tools: CustomMcpTool[] | null; error: string | null };

export type NewAgentData = {
  engines: Engine[] | null;
  enginesError: string | null;
  reloadEngines: () => void;
  // Owner only (the endpoints answer 403 to anyone else); null while loading or when not asked for.
  clients: PortalClient[] | null;
  claudeAccounts: ClaudeAccount[];
  appAccounts: ComposioAccount[] | null;
  toolServers: ToolServer[] | null;
  toolsError: string | null;
  reloadTools: () => void;
};

const messageOf = (err: unknown) => (err instanceof Error && err.message ? err.message : null);

// What the New agent wizard reads besides the shell's lists. Loaded once on arrival; nothing here is saved.
export function useNewAgentData(admin: boolean): NewAgentData {
  const [engines, setEngines] = useState<Engine[] | null>(null);
  const [enginesError, setEnginesError] = useState<string | null>(null);
  const [engineTick, setEngineTick] = useState(0);
  const [clients, setClients] = useState<PortalClient[] | null>(null);
  const [claudeAccounts, setClaudeAccounts] = useState<ClaudeAccount[]>([]);
  const [appAccounts, setAppAccounts] = useState<ComposioAccount[] | null>(null);
  const [toolServers, setToolServers] = useState<ToolServer[] | null>(null);
  const [toolsError, setToolsError] = useState<string | null>(null);
  const [toolTick, setToolTick] = useState(0);

  useEffect(() => {
    let alive = true;
    api.getEngines()
      .then((list) => { if (alive) { setEngines(list); setEnginesError(null); } })
      .catch((err: unknown) => { if (alive) { setEngines([]); setEnginesError(messageOf(err) ?? ""); } });
    return () => { alive = false; };
  }, [engineTick]);

  useEffect(() => {
    if (!admin) return;
    let alive = true;
    // A client is optional: when the list cannot be read the field is simply not offered.
    api.getClients().then((value) => { if (alive) setClients(value.clients); }).catch(() => { if (alive) setClients([]); });
    api.listClaudeAccounts().then((list) => { if (alive) setClaudeAccounts(list); }).catch(() => {});
    api.getComposioStatus()
      .then((status) => (status.configured ? api.listComposioAccounts() : []))
      .then((list) => { if (alive) setAppAccounts(list); })
      .catch(() => { if (alive) setAppAccounts([]); });
    return () => { alive = false; };
  }, [admin]);

  useEffect(() => {
    if (!admin) return;
    let alive = true;
    api.listCustomMcp()
      .then((conns) => Promise.all(conns.filter((conn) => conn.enabled).map(async (conn): Promise<ToolServer> => {
        try {
          return { conn, tools: await api.getCustomMcpTools(conn.id), error: null };
        } catch (err) {
          return { conn, tools: null, error: messageOf(err) ?? "" };
        }
      })))
      .then((list) => { if (alive) { setToolServers(list); setToolsError(null); } })
      .catch((err: unknown) => { if (alive) { setToolServers([]); setToolsError(messageOf(err) ?? ""); } });
    return () => { alive = false; };
  }, [admin, toolTick]);

  const reloadEngines = useCallback(() => {
    setEngines(null);
    setEnginesError(null);
    setEngineTick((n) => n + 1);
  }, []);

  const reloadTools = useCallback(() => {
    setToolServers(null);
    setToolsError(null);
    setToolTick((n) => n + 1);
  }, []);

  return { engines, enginesError, reloadEngines, clients, claudeAccounts, appAccounts, toolServers, toolsError, reloadTools };
}
