// What a matrix save calls, per kind of cell: the same routes as the agent's Tools and Skills tabs.
// lib/permissions-matrix planSave and runSave decide the calls and report each change's result.
import { api, type Agent } from "@/lib/api";
import { LIBRARY_SOURCE, SKILL_LIBRARY } from "@/lib/skill-library";
import { toolErrorKey } from "@/lib/agent-tools";
import { MAX_AGENT_SKILLS, pluginGroup, serverGroup, type SaveDeps } from "@/lib/permissions-matrix";
import type { Snapshot } from "./load";

const codeOf = (err: unknown) => (err as { code?: unknown } | null)?.code;

export function saveDeps(snapshot: Snapshot, onAgentSaved?: (agent: Agent) => void): SaveDeps {
  // A server's revision moves when a save drops grants for tools it no longer has; the saves after it
  // then need the new one. Kept here so one save run reads it at most once per server.
  const revisions = new Map(snapshot.revisions);
  const toolList = (group: string, names: string[]) => {
    const digests = snapshot.digests.get(group) ?? new Map<string, string>();
    return names.flatMap((name) => {
      const digest = digests.get(name);
      return digest ? [{ name, schema_digest: digest }] : [];
    });
  };

  return {
    saveSkill: async (agentId, name) => {
      const skill = SKILL_LIBRARY.find((s) => s.name === name);
      if (!skill) throw new Error("");
      await api.saveSkill(agentId, skill.name, { description: skill.description, body: skill.body, enabled: true, source: LIBRARY_SOURCE });
    },
    deleteSkill: (agentId, name) => api.deleteSkill(agentId, name),
    saveTools: async (kind, connectionId, agentId, names) => {
      if (kind === "plugin") {
        await api.saveMarketplaceAgentGrants(connectionId, agentId, toolList(pluginGroup(connectionId), names));
        return;
      }
      const tools = toolList(serverGroup(connectionId), names);
      const revision = revisions.get(connectionId) ?? 0;
      try {
        await api.saveCustomMcpGrants(connectionId, agentId, revision, tools);
      } catch (err) {
        if (codeOf(err) !== "connection_changed") throw err;
        // Read the server's current revision once and try again; a real change (a new sign-in, a tool
        // that changed) still fails, with its own reason.
        const current = (await api.listCustomMcp()).find((conn) => conn.id === connectionId);
        if (!current || current.revision === revision) throw err;
        revisions.set(connectionId, current.revision);
        await api.saveCustomMcpGrants(connectionId, agentId, current.revision, tools);
      }
    },
    saveApps: async (agentId, scopes, accounts) => {
      const saved = await api.updateAgent(agentId, { connector_scopes: scopes, connector_account_scopes: accounts });
      onAgentSaved?.(saved);
    },
  };
}

/** The words for a failed save: the tools tab's own wording for known causes, the backend's message
 *  otherwise. */
export function saveErrorText(err: unknown, t: (key: string, params?: Record<string, string | number>) => string): string {
  const code = codeOf(err);
  if (code === "too_many_skills") return t("permissions.error.tooManySkills", { max: MAX_AGENT_SKILLS });
  if (code === "engine_without_connected_apps") return t("permissions.lock.engine");
  const key = toolErrorKey(err);
  if (key) return t(key);
  return err instanceof Error && err.message ? err.message : t("permissions.error.failed");
}
