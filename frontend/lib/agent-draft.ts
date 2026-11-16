// The agent form's model, shared by the old Agents dialog (components/chat/AgentsPanel.tsx) and the
// /agents pages: a Draft holds what the form shows, toInput turns it into the API body, and
// changedInput keeps only the fields that differ from what was loaded, so an edit PATCHes what the
// person changed and nothing else (a full body makes a restricted device's save fail on admin-only
// fields, and every save would reset connected-app actions). No runtime imports beyond plain libs,
// so node tests can load it.

import type { Agent, AgentInput, ApprovalMode } from "./api";
import { approvalModesForProvider } from "./agents.ts";
import { accountScopesToSend, scopesToSend, type AccountScopes, type Scopes } from "./connected-apps.ts";

export type Draft = {
  id: number | null;
  name: string;
  title: string;
  description: string;
  instructions: string;
  provider: string;
  model: string | null;
  effort: string | null;
  workspace_path: string;
  approval_mode: ApprovalMode;
  memory_enabled: boolean;
  fallback_provider: string | null;
  fallback_model: string | null;
  // A named Claude account id; null is the default account (owner only).
  claude_account: string | null;
  // Connected apps this agent may read; changed only on an existing agent.
  connector_scopes: Scopes;
  // Exact connected account IDs this agent may use.
  connector_account_scopes: AccountScopes;
  // Create only: the first contents of the agent's notes.
  starter_notes: string;
};

export const EMPTY_DRAFT: Draft = {
  id: null,
  name: "",
  title: "",
  description: "",
  instructions: "",
  provider: "claude",
  model: null,
  effort: null,
  workspace_path: "",
  approval_mode: "ask",
  memory_enabled: true,
  fallback_provider: null,
  fallback_model: null,
  claude_account: null,
  connector_scopes: {},
  connector_account_scopes: {},
  starter_notes: "",
};

export function toDraft(agent: Agent): Draft {
  return {
    id: agent.id,
    name: agent.name,
    title: agent.title ?? "",
    description: agent.description ?? "",
    instructions: agent.instructions ?? "",
    provider: agent.provider,
    model: agent.model,
    effort: agent.effort ?? null,
    workspace_path: agent.workspace_path ?? "",
    approval_mode: agent.approval_mode === "approve_for_me" && !approvalModesForProvider(agent.provider).some((mode) => mode.value === "approve_for_me") ? "ask" : agent.approval_mode,
    memory_enabled: agent.memory_enabled ?? true,
    fallback_provider: agent.fallback_provider ?? null,
    fallback_model: agent.fallback_model ?? null,
    claude_account: agent.claude_account ?? null,
    connector_scopes: agent.connector_scopes ?? {},
    connector_account_scopes: agent.connector_account_scopes ?? {},
    starter_notes: "",
  };
}

export function toInput(draft: Draft, admin = false): AgentInput {
  const input: AgentInput = {
    name: draft.name.trim(),
    title: draft.title.trim() || null,
    description: draft.description.trim() || null,
    instructions: draft.instructions.trim(),
    provider: draft.provider,
    model: draft.model?.trim() || null,
    effort: draft.effort,
    workspace_path: draft.workspace_path.trim() || null,
    approval_mode: draft.approval_mode,
    memory_enabled: draft.memory_enabled,
    // The agent's own engine cannot be its fallback.
    fallback_provider: draft.fallback_provider && draft.fallback_provider !== draft.provider ? draft.fallback_provider : null,
    fallback_model: draft.fallback_provider && draft.fallback_provider !== draft.provider ? draft.fallback_model?.trim() || null : null,
  };
  // Only the owner may choose the account; other devices never send the field.
  if (admin) input.claude_account = draft.provider === "claude" ? draft.claude_account : null;
  if (draft.id === null && draft.starter_notes.trim()) input.starter_notes = draft.starter_notes;
  // Connected apps are admin-only on the server; other devices never send them (an engine change
  // that would clear them is refused for them anyway).
  if (draft.id !== null && admin) {
    input.connector_scopes = scopesToSend(draft.connector_scopes, draft.provider);
    input.connector_account_scopes = accountScopesToSend(draft.connector_account_scopes, draft.connector_scopes, draft.provider);
  }
  return input;
}

// Order-insensitive for object keys, so {a, b} and {b, a} compare equal.
function stable(value: unknown): string {
  return JSON.stringify(value, (_key, inner) =>
    inner && typeof inner === "object" && !Array.isArray(inner)
      ? Object.fromEntries(Object.entries(inner as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
      : inner,
  );
}

/** The PATCH body for an edit: only the fields whose sent value differs from the loaded agent's. */
export function changedInput(draft: Draft, original: Draft, admin = false): Partial<AgentInput> {
  const next = toInput(draft, admin) as Record<string, unknown>;
  const before = toInput(original, admin) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(next)) {
    if (stable(value) !== stable(before[key])) out[key] = value;
  }
  return out as Partial<AgentInput>;
}
