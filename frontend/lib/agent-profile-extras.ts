// Pure helpers for the profile extras on /agents/edit/: the agent's own place on the team (the
// "Can delegate" and "Member of …'s team" switches), what restoring a stored version would change,
// and how a stored value is shown. No runtime imports, so node tests can load it.

// --- the agent's own place on the team ---------------------------------------------------------

export type TeamMemberLike = { id: number; is_lead: boolean; delegation_enabled: boolean };
export type TeamLike = { team: { lead_agent_id: number | null } | null; agents: TeamMemberLike[] };

export type OwnTeamView = {
  // GET /team has answered.
  known: boolean;
  // There is a team to be on: one exists, or this agent becomes its lead on save.
  hasTeam: boolean;
  // The team's lead when it is another agent.
  leadId: number | null;
  // As saved, and as the form shows it now.
  savedMember: boolean;
  member: boolean;
  savedDelegate: boolean;
  delegate: boolean;
  // The "Member of {lead}'s team" switch is shown: not the lead (now or after save), and a lead exists.
  showMembership: boolean;
  dirty: boolean;
};

// `isLead` is the lead switch as the form has it now. Only a team member can delegate, so an agent
// off the team shows "Can delegate" off whatever its stored flag says; the stored flag (default on)
// comes back when it joins.
export function ownTeamView({
  team,
  agentId,
  isLead,
  storedDelegate,
  memberChoice,
  delegateChoice,
}: {
  team: TeamLike | null;
  agentId: number;
  isLead: boolean;
  storedDelegate: boolean | undefined;
  memberChoice: boolean | null;
  delegateChoice: boolean | null;
}): OwnTeamView {
  const entry = team?.agents.find((agent) => agent.id === agentId) ?? null;
  const stored = entry?.delegation_enabled ?? storedDelegate ?? true;
  const savedMember = entry !== null;
  const savedDelegate = savedMember && stored;
  const lead = team?.team?.lead_agent_id ?? null;
  const leadId = lead !== null && lead !== agentId ? lead : null;
  const member = isLead || (memberChoice ?? savedMember);
  const delegate = member && (delegateChoice ?? stored);
  return {
    known: team !== null,
    hasTeam: (team?.team ?? null) !== null || isLead,
    leadId,
    savedMember,
    member,
    savedDelegate,
    delegate,
    showMembership: team !== null && !isLead && leadId !== null,
    dirty: team !== null && (member !== savedMember || (member && delegate !== stored)),
  };
}

export type TeamStep = { kind: "remove" } | { kind: "delegation"; value: boolean };

// The calls that bring the agent's own place on the team to what the form wants, read against a
// fresh GET /team taken after any lead change was saved. PATCH /team/members/{id} also adds an
// agent that is not on the team yet, so joining and the delegation flag are one call.
export function ownTeamSteps(team: TeamLike, agentId: number, want: { member: boolean; delegate: boolean }): TeamStep[] {
  const entry = team.agents.find((agent) => agent.id === agentId);
  if (!want.member) return entry && !entry.is_lead ? [{ kind: "remove" }] : [];
  if (!entry || entry.delegation_enabled !== want.delegate) return [{ kind: "delegation", value: want.delegate }];
  return [];
}

// --- stored versions of the profile (GET /agents/{id}/revisions) ---------------------------------

// What a stored version holds, in the backend's order (services/agent_history.py PROFILE_FIELDS;
// a node test checks the two lists match).
export const PROFILE_FIELDS = [
  "name", "title", "description", "instructions", "provider", "model", "effort",
  "temperature", "top_p", "max_output_tokens", "workspace_path",
  "approval_mode", "pinned", "memory_enabled", "recall_enabled", "memory_upkeep", "compaction_summary",
  "use_helper", "conversational_mode", "conversational_style",
  "fallback_provider", "fallback_model", "connector_scopes", "connector_account_scopes",
] as const;

const SWITCHES = new Set(["pinned", "memory_enabled", "recall_enabled", "memory_upkeep", "compaction_summary", "use_helper"]);
const LONG = new Set(["instructions", "description", "conversational_style"]);
// The effort levels with a translated label (agentsModel.effort.<level>); any other is shown as stored.
const EFFORTS = new Set(["low", "medium", "high", "xhigh", "max", "minimal", "none"]);

function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined || value === "") return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value as object).length === 0;
  return false;
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value as object).sort().map((key) => [key, canonical((value as Record<string, unknown>)[key])]));
  }
  return value;
}

// Equal for a person: null, "" and {} are all "nothing", and key order does not matter.
export function sameValue(a: unknown, b: unknown): boolean {
  if (isEmpty(a) || isEmpty(b)) return isEmpty(a) && isEmpty(b);
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

// The fields a restore would change: stored, not hidden as a secret, and different from now.
export function restoreChanges(snapshot: Record<string, unknown>, current: Record<string, unknown>, redacted: string[]): string[] {
  const hidden = new Set(redacted);
  return PROFILE_FIELDS.filter((field) => field in snapshot && !hidden.has(field) && !sameValue(snapshot[field], current[field]));
}

// The fields to show for a stored version: known ones in order, then anything newer the backend added.
export function shownFields(snapshot: Record<string, unknown>): string[] {
  const known: string[] = PROFILE_FIELDS.filter((field) => field in snapshot);
  return [...known, ...Object.keys(snapshot).filter((field) => !known.includes(field)).sort()];
}

export type ShownValue =
  | { kind: "empty" }
  | { kind: "on" }
  | { kind: "off" }
  | { kind: "text"; text: string }
  | { kind: "long"; text: string }
  | { kind: "effort"; level: string }
  // Agent.conversational_mode: false is Task, true is Conversational.
  | { kind: "mode"; mode: "task" | "conversational" }
  | { kind: "apps"; apps: { app: string; level: string }[] }
  | { kind: "accounts"; count: number };

export function shownValue(field: string, value: unknown): ShownValue {
  if (field === "conversational_mode") {
    return value === true ? { kind: "mode", mode: "conversational" } : value === false ? { kind: "mode", mode: "task" } : { kind: "empty" };
  }
  if (SWITCHES.has(field)) return value === false ? { kind: "off" } : value === true ? { kind: "on" } : { kind: "empty" };
  if (field === "connector_scopes") {
    const apps = value && typeof value === "object" ? Object.entries(value as Record<string, unknown>) : [];
    return apps.length === 0 ? { kind: "empty" } : { kind: "apps", apps: apps.map(([app, level]) => ({ app, level: String(level) })).sort((a, b) => a.app.localeCompare(b.app)) };
  }
  if (field === "connector_account_scopes") {
    const lists = value && typeof value === "object" ? Object.values(value as Record<string, unknown>) : [];
    const count = lists.reduce<number>((sum, ids) => sum + (Array.isArray(ids) ? ids.length : 0), 0);
    return count === 0 ? { kind: "empty" } : { kind: "accounts", count };
  }
  if (isEmpty(value)) return { kind: "empty" };
  if (field === "effort" && typeof value === "string" && EFFORTS.has(value.toLowerCase())) return { kind: "effort", level: value.toLowerCase() };
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return LONG.has(field) ? { kind: "long", text } : { kind: "text", text };
}

// "a, b and c" in the reader's language.
export function joinList(locale: string, items: string[]): string {
  try {
    return new Intl.ListFormat(locale, { style: "long", type: "conjunction" }).format(items);
  } catch {
    return items.join(", ");
  }
}
