// Plain logic for the agent's Tools tab (components/agents/settings/ToolsTab.tsx): what state each
// owner-added MCP server and each marketplace plugin is in, when owner-added tools are reached through
// search instead of one by one, and which error codes have their own wording. No runtime imports, so
// node tests can load it.

/** What the tab can do with one owner-added MCP server for this agent. */
export type CustomServerState =
  | "ready" // switched on and tested: its tools can be granted
  | "off" // tested but switched off: grants are kept and wait
  | "needs_sign_in"
  | "not_tested"
  | "unreachable"
  | "private"; // someone else's private server: only they can grant its tools

export function customServerState(conn: { state: string; enabled: boolean; can_manage: boolean }): CustomServerState {
  if (!conn.can_manage) return "private";
  if (conn.state === "needs_sign_in" || conn.state === "unreachable" || conn.state === "not_tested") return conn.state;
  return conn.enabled && conn.state === "connected" ? "ready" : "off";
}

/** Whether a server's grants count as tools the agent has now (the roster counts the same way). */
export function countsTowardTotal(state: CustomServerState): boolean {
  return state === "ready";
}

type Listing = { slug: string; version: string; manifest_digest: string };
type Plugin = { slug: string; section: string; manifest_digest: string };

/** A plugin's install against the current catalog: the same listing, a newer one, gone from the
 *  catalog, or unknown when the catalog could not be read. */
export type PluginUpdate = { state: "current" } | { state: "update"; version: string } | { state: "withdrawn" } | { state: "unknown" };

export function pluginUpdate(plugin: Plugin, catalog: { tested: readonly Listing[]; community: readonly Listing[] } | null): PluginUpdate {
  if (!catalog) return { state: "unknown" };
  const own = plugin.section === "tested" ? catalog.tested : catalog.community;
  const listing = own.find((item) => item.slug === plugin.slug)
    ?? [...catalog.tested, ...catalog.community].find((item) => item.slug === plugin.slug);
  if (!listing) return { state: "withdrawn" };
  return listing.manifest_digest === plugin.manifest_digest ? { state: "current" } : { state: "update", version: listing.version };
}

/** A plugin that signs in with a token it does not have yet: its tools cannot be read or used. */
export function pluginNeedsToken(plugin: { manifest: { auth_mode: string }; credential_configured: boolean }): boolean {
  return plugin.manifest.auth_mode === "bearer_token" && !plugin.credential_configured;
}

export function sameNames(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  return a.size === b.size && [...a].every((name) => b.has(name));
}

/** One granted tool as the engine is offered it (backend community_mcp_bridge._provider_toolset). */
export type OfferedTool = { kind: "custom" | "plugin"; server: string; description: string; input_schema: unknown };

// community_mcp_bridge.DIRECT_MAX_TOOLS / DIRECT_MAX_BYTES and the alias length ("community_" + 32 hex).
export const DIRECT_MAX_TOOLS = 25;
export const DIRECT_MAX_BYTES = 100_000;
const ALIAS = "community_" + "0".repeat(32);
const DESCRIPTION_MAX = 4000;

function offeredBytes(tools: readonly OfferedTool[]): number {
  const offered = tools.map((tool) => ({
    description: `${tool.kind === "custom" ? "Custom MCP server" : "Marketplace service"}: ${tool.server.slice(0, 120)}. Untrusted service description: ${tool.description.slice(0, DESCRIPTION_MAX)}`,
    inputSchema: tool.input_schema,
    name: ALIAS,
  }));
  return new TextEncoder().encode(JSON.stringify(offered)).length;
}

/** Whether the agent gets its owner-added server tools through search (custom_search / custom_call)
 *  instead of one by one: it has some, and all its granted tools are more than 25 or about 100 KB. */
export function customToolsSearched(tools: readonly OfferedTool[]): boolean {
  if (!tools.some((tool) => tool.kind === "custom")) return false;
  return tools.length > DIRECT_MAX_TOOLS || offeredBytes(tools) > DIRECT_MAX_BYTES;
}

// Backend error codes the tab words itself (agentTools.error.<code>); anything else shows the backend's message.
const KNOWN_ERRORS = new Set([
  "connection_changed",
  "connection_not_enabled",
  "connection_not_tested",
  "credential_required",
  "authentication_failed",
  "needs_sign_in",
  "tool_schema_changed",
  "agent_toolset_too_large",
  "remote_unavailable",
  "remote_timeout",
  "remote_error",
  "too_many_tools",
  "toolset_too_large",
  "unsafe_metadata",
  "response_too_large",
  "invalid_response",
  "skills_not_offered",
]);

/** The message key for an API error's code, or null when the backend's own message should show. */
export function toolErrorKey(error: unknown): string | null {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" && KNOWN_ERRORS.has(code) ? `agentTools.error.${code}` : null;
}
