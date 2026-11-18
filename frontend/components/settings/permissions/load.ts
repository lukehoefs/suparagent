// Reads everything the permissions matrix shows, through the routes the agent's Tools and Skills tabs
// already use: the agents, each owner-added MCP server and each plugin (their tools and every agent's
// grants), the cloud computers (which servers are a computer's gateway), the connected apps and accounts,
// the skill library against every agent's saved skills, and the clients for the client filter. Nothing
// here writes.
import { api, type Agent, type PortalClient } from "@/lib/api";
import { agentAppOptions, supportsConnectedApps, type ComposioAccount } from "@/lib/connected-apps";
import type { CustomMcpConnection } from "@/lib/custom-mcp";
import { customServerState, pluginNeedsToken } from "@/lib/agent-tools";
import { LIBRARY_CATEGORIES, SKILL_LIBRARY } from "@/lib/skill-library";
import { listRemoteComputers } from "@/lib/remote-computers";
import { createLimiter } from "@/lib/roster-counts";
import {
  APPS_GROUP, SKILLS_GROUP, appsSource, grantKey, pairKey, pluginGroup, serverGroup, serverSources, skillSource, toolSource,
  type AppAccess, type Lock, type MatrixSource, type MatrixState, type ServerColumn,
} from "@/lib/permissions-matrix";

// Requests in flight at once for the whole page (the roster uses the same limit).
const MAX_IN_FLIGHT = 6;

// A server or plugin that can't be a column right now, and why.
export type SourceNote = {
  kind: "server" | "plugin";
  id: string;
  name: string;
  reason: "needs_sign_in" | "not_tested" | "unreachable" | "private" | "needs_token" | "load_failed";
  person?: string | null;
  error?: unknown;
};

// A part of the page that could not be read at all.
export type Problem = "servers" | "plugins" | "apps";

export type Snapshot = {
  agents: Agent[];
  sources: MatrixSource[];
  notes: SourceNote[];
  problems: Problem[];
  saved: MatrixState;
  locks: Map<string, Lock>;
  // Skills each agent has that are not from the library: they count toward its limit.
  otherSkills: Map<number, number>;
  clients: PortalClient[];
  // Connected accounts, for the app cells' account choices; null when apps are not set up or unreadable.
  accounts: ComposioAccount[] | null;
  // Apps (Composio) have no key yet, so the Apps page is where to start.
  appsNotSetUp: boolean;
  // What a tool grant save sends: the server's revision and each tool's schema digest.
  revisions: Map<string, number>;
  digests: Map<string, Map<string, string>>;
};

export async function loadSnapshot(): Promise<Snapshot> {
  const limit = createLimiter(MAX_IN_FLIGHT);
  // The agents list is the page: if it fails, the page says so.
  const agents = (await api.listAgents()).filter((agent) => !agent.archived_at);
  const [customList, pluginList, composio, clientList, computerList] = await Promise.allSettled([
    limit(() => api.listCustomMcp()),
    limit(() => api.listMarketplaceConnections()),
    limit(() => api.getComposioStatus()),
    limit(() => api.getClients()),
    limit(() => listRemoteComputers()),
  ]);
  // The computer each gateway server belongs to. Unreadable, every server is simply its own source.
  const computerOf = new Map(computerList.status === "fulfilled"
    ? computerList.value.map((computer) => [computer.mcp_connection_id, computer.name] as const)
    : []);

  const grants = new Set<string>();
  const locks = new Map<string, Lock>();
  const notes: SourceNote[] = [];
  const problems: Problem[] = [];
  const revisions = new Map<string, number>();
  const digests = new Map<string, Map<string, string>>();

  // Every agent's grants on one connection; a pair that can't be read is locked rather than shown empty.
  const readGrants = async (group: string, known: ReadonlySet<string>, read: (agentId: number) => Promise<{ tool_names: string[] }>) => {
    await Promise.all(agents.map(async (agent) => {
      try {
        const { tool_names } = await limit(() => read(agent.id));
        // A grant for a tool the server no longer lists means nothing; the next save drops it.
        for (const name of tool_names) if (known.has(name)) grants.add(grantKey(group, name, agent.id));
      } catch {
        locks.set(pairKey(group, agent.id), "load_failed");
      }
    }));
  };

  const readServer = async (conn: CustomMcpConnection): Promise<ServerColumn | null> => {
    const state = customServerState(conn);
    if (state === "private") {
      notes.push({ kind: "server", id: conn.id, name: conn.name, reason: "private", person: conn.added_by });
      return null;
    }
    if (state === "needs_sign_in" || state === "not_tested" || state === "unreachable") {
      notes.push({ kind: "server", id: conn.id, name: conn.name, reason: state });
      return null;
    }
    // Ready, or tested and switched off: the tools seen by its last test (no call to the server).
    let tools;
    try {
      tools = await limit(() => api.getCustomMcpTools(conn.id));
    } catch (error) {
      notes.push({ kind: "server", id: conn.id, name: conn.name, reason: "load_failed", error });
      return null;
    }
    const group = serverGroup(conn.id);
    revisions.set(conn.id, conn.revision);
    digests.set(group, new Map(tools.map((tool) => [tool.name, tool.schema_digest])));
    await readGrants(group, new Set(tools.map((tool) => tool.name)), (agentId) => api.getCustomMcpGrants(conn.id, agentId));
    // A switched-off server keeps its grants but refuses new ones until it is on again.
    return { connection: conn, tools, readOnly: state === "off" ? "server_off" : null, computer: computerOf.get(conn.id) ?? null };
  };

  const readPlugin = async (conn: { id: string; name: string; manifest: { auth_mode: string }; credential_configured: boolean }): Promise<MatrixSource[]> => {
    if (pluginNeedsToken(conn)) {
      notes.push({ kind: "plugin", id: conn.id, name: conn.name, reason: "needs_token" });
      return [];
    }
    let tools;
    try {
      // A live call: discovery also drops grants whose tool changed, so the grants read next are current.
      tools = await limit(() => api.discoverMarketplaceTools(conn.id));
    } catch (error) {
      notes.push({ kind: "plugin", id: conn.id, name: conn.name, reason: "load_failed", error });
      return [];
    }
    const group = pluginGroup(conn.id);
    digests.set(group, new Map(tools.map((tool) => [tool.name, tool.schema_digest])));
    await readGrants(group, new Set(tools.map((tool) => tool.name)), (agentId) => api.getMarketplaceAgentGrants(conn.id, agentId));
    const source = toolSource("plugin", conn, tools);
    return source ? [source] : [];
  };

  // Library skills each agent has, and how many others it has.
  const libraryNames = new Set(SKILL_LIBRARY.map((skill) => skill.name));
  const otherSkills = new Map<number, number>();
  const readSkills = Promise.all(agents.map(async (agent) => {
    try {
      const skills = await limit(() => api.listSkills(agent.id));
      let other = 0;
      for (const skill of skills) {
        if (libraryNames.has(skill.name)) grants.add(grantKey(SKILLS_GROUP, skill.name, agent.id));
        else other += 1;
      }
      otherSkills.set(agent.id, other);
    } catch {
      locks.set(pairKey(SKILLS_GROUP, agent.id), "load_failed");
    }
  }));

  // Connected apps: their accounts when apps are set up. An agent's access is on the agent itself.
  const apps = new Map<number, AppAccess>(agents.map((agent) => [agent.id, {
    scopes: { ...(agent.connector_scopes ?? {}) },
    accounts: { ...(agent.connector_account_scopes ?? {}) },
  }]));
  const anyAccess = agents.some((agent) => Object.keys(agent.connector_scopes ?? {}).length > 0);
  const readApps = (async (): Promise<{ source: MatrixSource | null; accounts: ComposioAccount[] | null }> => {
    // Every app any agent is allowed, so one that was disconnected stays visible and can be turned off.
    const allScopes = Object.assign({}, ...agents.map((agent) => agent.connector_scopes ?? {}));
    if (composio.status === "rejected") {
      problems.push("apps");
      return { source: anyAccess ? appsSource(agentAppOptions(null, allScopes), "accounts_failed") : null, accounts: null };
    }
    const labels = Object.fromEntries(composio.value.apps.map((app) => [app.slug, app.label]));
    if (!composio.value.configured) {
      // Not set up: nothing can be granted, but access an agent still has is shown.
      return { source: anyAccess ? appsSource(agentAppOptions(null, allScopes, labels), "apps_not_set_up") : null, accounts: null };
    }
    try {
      const accounts = await limit(() => api.listComposioAccounts());
      return { source: appsSource(agentAppOptions(accounts, allScopes, labels)), accounts };
    } catch {
      return { source: appsSource(agentAppOptions(null, allScopes, labels), "accounts_failed"), accounts: null };
    }
  })();
  for (const agent of agents) if (!supportsConnectedApps(agent.provider)) locks.set(pairKey(APPS_GROUP, agent.id), "engine");

  const servers = customList.status === "fulfilled" ? customList.value : [];
  if (customList.status === "rejected") problems.push("servers");
  const plugins = pluginList.status === "fulfilled" ? pluginList.value : [];
  if (pluginList.status === "rejected") problems.push("plugins");

  const [serverColumns, pluginSources, app] = await Promise.all([
    Promise.all(servers.map(readServer)),
    Promise.all(plugins.map(readPlugin)),
    readApps,
    readSkills,
  ]);

  const skills = skillSource(SKILL_LIBRARY, LIBRARY_CATEGORIES);
  const sources = [
    // Every computer's gateway is one Computer source, where the first one was.
    ...serverSources(serverColumns.filter((column): column is ServerColumn => column !== null)),
    ...pluginSources.flat(),
    ...(app.source ? [app.source] : []),
    ...(skills ? [skills] : []),
  ];
  // Servers answer in any order; the notes read the same every time (servers, then plugins, by name).
  notes.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "server" ? -1 : 1) || a.name.localeCompare(b.name));
  return {
    agents,
    sources,
    notes,
    problems,
    saved: { grants, apps },
    locks,
    otherSkills,
    clients: clientList.status === "fulfilled" ? clientList.value.clients : [],
    accounts: app.accounts,
    appsNotSetUp: composio.status === "fulfilled" && !composio.value.configured,
    revisions,
    digests,
  };
}
