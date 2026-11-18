// The New agent wizard's plain logic (components/agents/NewAgentWizard.tsx): the blueprint seed, the
// preview's engine line, the approval choices a device may make, and the follow-up requests that run
// after POST /agents (connected apps, tool grants, soul, client, template skills). No runtime imports
// beyond plain libs, so node tests can load it.

import type { ApprovalMode } from "./api";
import type { Blueprint } from "./blueprints.ts";
import type { TemplateSkill } from "./templates.ts";
import type { AccountScopes, Scopes } from "./connected-apps.ts";
import { OWNER_ONLY_MODES, approvalModesForProvider } from "./agents.ts";
import { accountScopesToSend, scopesToSend } from "./connected-apps.ts";
import { uniqueAgentName } from "./templates.ts";

export const NAME_MAX = 80;
export const ROLE_MAX = 200;
export const DESCRIPTION_MAX = 4000;
// Characters. With the heading added by soulFromPurpose it stays inside the 24 KiB SOUL.md limit,
// whatever the script (at most 3 UTF-8 bytes per UTF-16 unit).
export const PURPOSE_MAX = 8000;
// The backend caps instructions in UTF-8 bytes, not characters.
export const INSTRUCTIONS_MAX_BYTES = 24_000;

export function utf8Bytes(text: string): number {
  return new TextEncoder().encode(text).length;
}

// The engines whose turns receive granted MCP tools (the same list as AgentToolsSection).
export const TOOL_ENGINES: readonly string[] = ["claude", "codex", "openai_compat", "openrouter"];

export function supportsToolGrants(provider: string): boolean {
  return TOOL_ENGINES.includes(provider);
}

/** The first draft of the person's part of SOUL.md, from "What is this agent for?". Null when empty.
 *  Same headings as the Soul tab's starter, so the soul reads the same however it was begun. */
export function soulFromPurpose(name: string, purpose: string): string | null {
  const text = purpose.trim();
  if (!text) return null;
  return `# Soul of ${name.trim()}\n\n## Role\n${text}\n`;
}

export type Seed = { name: string; title: string; purpose: string };

/** What a blueprint fills in: its name (made unique among the live agents), its category as the role,
 *  and its one-line job as what the agent is for. Empty without a blueprint. */
export function blueprintSeed(blueprint: Pick<Blueprint, "name" | "category" | "job"> | null, takenNames: Iterable<string>): Seed {
  if (!blueprint) return { name: "", title: "", purpose: "" };
  return { name: uniqueAgentName(blueprint.name, takenNames, NAME_MAX), title: blueprint.category, purpose: blueprint.job };
}

type EngineLike = { id: string; label: string; default_model: string | null; models: readonly { id: string; label: string }[] };

/** "Claude · Opus": the engine and the model a new conversation will use (the engine's default when
 *  none is chosen). The bare provider id while the engines are unknown. */
export function engineModelText(engines: readonly EngineLike[] | null, provider: string, model: string | null): string {
  const engine = engines?.find((item) => item.id === provider);
  if (!engine) return provider;
  const id = model?.trim() || engine.default_model;
  if (!id) return engine.label;
  return `${engine.label} · ${engine.models.find((item) => item.id === id)?.label ?? id}`;
}

/** The approval modes this engine offers that this device may choose: a device without admin rights
 *  cannot create an agent that accepts edits or has full access (the backend answers 403
 *  field_requires_admin). */
export function approvalChoices(provider: string, admin: boolean): ApprovalMode[] {
  return approvalModesForProvider(provider).map((mode) => mode.value).filter((mode) => admin || !OWNER_ONLY_MODES.includes(mode));
}

/** The mode kept after an engine change: the same one if still offered, otherwise "ask". */
export function fitApprovalMode(mode: ApprovalMode, provider: string, admin: boolean): ApprovalMode {
  return approvalChoices(provider, admin).includes(mode) ? mode : "ask";
}

/** The clients list with the agent added to one client, or null when that client no longer exists.
 *  The list is saved whole (PUT /clients), so every other client is returned unchanged. */
export function withAgentInClient<T extends { id: string; agent_ids: number[] }>(clients: readonly T[], clientId: string, agentId: number): T[] | null {
  if (!clients.some((client) => client.id === clientId)) return null;
  return clients.map((client) => (client.id === clientId && !client.agent_ids.includes(agentId) ? { ...client, agent_ids: [...client.agent_ids, agentId] } : client));
}

/** The grant body for the tools picked on one server, against the server's current tool list (fresh
 *  schema digests). A PUT replaces the server's grants for the agent, so grants it already has (`keep`)
 *  are sent again. Picks the server no longer offers are returned in `missing`. */
export function grantsFor(
  picked: readonly string[],
  tools: readonly { name: string; schema_digest: string }[],
  keep: readonly string[] = [],
): { grants: { name: string; schema_digest: string }[]; missing: string[] } {
  const byName = new Map(tools.map((tool) => [tool.name, tool.schema_digest]));
  const grants: { name: string; schema_digest: string }[] = [];
  const missing: string[] = [];
  const wanted = new Set(picked);
  for (const name of [...new Set([...picked, ...keep])].sort()) {
    const digest = byName.get(name);
    if (digest !== undefined) grants.push({ name, schema_digest: digest });
    else if (wanted.has(name)) missing.push(name);
  }
  return { grants, missing };
}

/** Tool picks per server without empty servers and in a stable order, for saving and for comparing. */
export function normalizePicks(picks: Record<string, readonly string[]>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const id of Object.keys(picks).sort()) {
    const names = [...new Set(picks[id])].sort();
    if (names.length) out[id] = names;
  }
  return out;
}

export function pickCount(picks: Record<string, readonly string[]>): number {
  return Object.values(normalizePicks(picks)).reduce((sum, names) => sum + names.length, 0);
}

export type FollowUp =
  | { kind: "apps"; key: "apps"; scopes: Scopes; accountScopes: AccountScopes }
  | { kind: "tools"; key: string; connectionId: string; connectionName: string; tools: string[] }
  | { kind: "soul"; key: "soul"; text: string }
  | { kind: "client"; key: "client"; clientId: string; clientName: string }
  | { kind: "skills"; key: "skills"; templateId: string; skills: TemplateSkill[] };

export type PlanInput = {
  admin: boolean;
  provider: string;
  name: string;
  purpose: string;
  scopes: Scopes;
  accountScopes: AccountScopes;
  picks: Record<string, readonly string[]>;
  servers: readonly { id: string; name: string }[];
  clientId: string;
  clients: readonly { id: string; name: string }[];
  template: { id: string; skills: readonly TemplateSkill[] } | null;
  skillChoices: readonly string[];
};

/** What runs after POST /agents returns, in order. Every follow-up endpoint (connector scopes, tool
 *  grants, PUT soul, PUT /clients, template skills) needs the admin scope: a `manage` device may only
 *  POST and PATCH /agents (backend app/auth/policy.py MANAGE_ROUTES), so a device without admin rights
 *  plans none. Apps and tools are left out for engines that cannot use them (the engine may have
 *  changed after they were picked). */
export function followUpPlan(input: PlanInput): FollowUp[] {
  const plan: FollowUp[] = [];
  if (!input.admin) return plan;
  const scopes = scopesToSend(input.scopes, input.provider);
  if (scopes) plan.push({ kind: "apps", key: "apps", scopes, accountScopes: accountScopesToSend(input.accountScopes, input.scopes, input.provider) });
  if (supportsToolGrants(input.provider)) {
    const picks = normalizePicks(input.picks);
    for (const server of input.servers) {
      const tools = picks[server.id];
      if (tools) plan.push({ kind: "tools", key: `tools:${server.id}`, connectionId: server.id, connectionName: server.name, tools });
    }
  }
  const soul = soulFromPurpose(input.name, input.purpose);
  if (soul) plan.push({ kind: "soul", key: "soul", text: soul });
  if (input.clientId) {
    const client = input.clients.find((item) => item.id === input.clientId);
    if (client) plan.push({ kind: "client", key: "client", clientId: client.id, clientName: client.name });
  }
  if (input.template) {
    const skills = input.template.skills.filter((skill) => input.skillChoices.includes(skill.name));
    if (skills.length) plan.push({ kind: "skills", key: "skills", templateId: input.template.id, skills });
  }
  return plan;
}

// `note`: something worth saying about a step that did finish (a picked tool the server dropped).
export type FollowUpState = { status: "queued" | "running" | "done" | "failed"; error: string | null; note?: string | null };

/** Where the run stands: still going, everything done, or done with some steps to retry. */
export function runOutcome(plan: readonly FollowUp[], states: Record<string, FollowUpState>): "running" | "done" | "partial" {
  const all = plan.map((item) => states[item.key]?.status ?? "queued");
  if (all.some((status) => status === "queued" || status === "running")) return "running";
  return all.includes("failed") ? "partial" : "done";
}

/** 409 agent_name_taken from POST /agents: another live agent has this name. */
export function isNameTaken(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: unknown }).code === "agent_name_taken";
}

/** A comparable key for the form: object keys sorted, so the same values always give the same key. */
export function formKey(value: unknown): string {
  return JSON.stringify(value, (_key, inner) =>
    inner && typeof inner === "object" && !Array.isArray(inner)
      ? Object.fromEntries(Object.entries(inner as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
      : inner,
  );
}
