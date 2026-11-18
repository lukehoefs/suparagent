// Task or Conversational mode, per agent (design: Chat.html, the switch in the header and the line
// under it; README "Task or Conversational mode"). The backend stores it as Agent.conversational_mode
// (false is Task) with optional guidance on how the agent talks, Agent.conversational_style, and
// tells the engine at every turn (services/agent_memory.py mode_prompt). Neither changes approvals.
// No runtime imports beyond plain libs, so node tests can load it.

import type { Agent, AgentInput } from "./api";
import { can } from "./permissions.ts";
import type { SessionInfo } from "./session";

export type AgentMode = "task" | "conversational";

export const AGENT_MODES: readonly AgentMode[] = ["task", "conversational"];

// The longest guidance on how the agent talks the backend accepts (schemas/agent.py
// CONVERSATIONAL_STYLE_MAX_CHARS), in characters.
export const STYLE_MAX_CHARS = 500;

type Translate = (key: string, vars?: Record<string, string | number>) => string;
type ModeAgent = Pick<Agent, "conversational_mode">;
type NamedAgent = Pick<Agent, "name" | "conversational_mode">;

// The i18n keys for each mode (lib/locales/agent-mode-extra.ts).
const KEYS = {
  task: { label: "agentMode.task", hint: "agentMode.taskHint", subtitle: "agentMode.taskSubtitle", line: "agentMode.taskLine" },
  conversational: {
    label: "agentMode.conversational",
    hint: "agentMode.conversationalHint",
    subtitle: "agentMode.conversationalSubtitle",
    line: "agentMode.conversationalLine",
  },
} as const satisfies Record<AgentMode, Record<"label" | "hint" | "subtitle" | "line", string>>;

// An agent from an older backend (no field yet) works in Task mode, as before.
export function modeOf(agent: ModeAgent | null | undefined): AgentMode {
  return agent?.conversational_mode === true ? "conversational" : "task";
}

// The PATCH /agents/{id} body that switches an agent to `mode`, and nothing else.
export function modeChange(mode: AgentMode): Pick<AgentInput, "conversational_mode"> {
  return { conversational_mode: mode === "conversational" };
}

// The agent as it will be once `mode` is saved: what the switch shows while the save runs.
export function withMode<T extends ModeAgent>(agent: T, mode: AgentMode): T {
  return { ...agent, conversational_mode: mode === "conversational" };
}

// "Task" or "Conversational".
export function modeLabel(t: Translate, mode: AgentMode): string {
  return t(KEYS[mode].label);
}

// What the option does, as its hover hint ("Works quietly and returns results").
export function modeHint(t: Translate, mode: AgentMode): string {
  return t(KEYS[mode].hint);
}

// For the header's second line, after the agent's role: "Conversational partner" or "Works quietly".
export function modeSubtitle(t: Translate, agent: ModeAgent): string {
  return t(KEYS[modeOf(agent)].subtitle);
}

// The line under the header: "Task: Atlas works quietly and reports back when done."
export function modeLine(t: Translate, agent: NamedAgent): string {
  return t(KEYS[modeOf(agent)].line, { name: agent.name });
}

// Who may switch it: anyone who may change agents, by the rule the app shell uses (AppShell
// `mayManageAgents`): admin, or a `manage` session with the "agents" permission. No session
// (the server could not say) is treated like the shell treats it, as full access.
export function mayManageAgents(session: Pick<SessionInfo, "scopes" | "permissions"> | null): boolean {
  if (session === null || session.scopes.includes("admin")) return true;
  return session.scopes.includes("manage") && can(session.permissions, "agents");
}

// Characters as the backend counts them (code points, so an emoji is one).
export function styleLength(text: string): number {
  return [...text.trim()].length;
}

export function styleTooLong(text: string): boolean {
  return styleLength(text) > STYLE_MAX_CHARS;
}

// What to send for the "How it talks" field: the text without surrounding blanks, or null for none.
export function styleToSend(text: string): string | null {
  return text.trim() || null;
}
