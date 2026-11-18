// Workspace settings (design: WorkspaceSettings.html): the pure rules behind General, Members and
// Engines. No runtime imports beyond permissions.ts (which has none), so node tests can load it.
// The server stays the authority on every rule here; these only decide what to draw and offer.

import { ACCESS_PRESETS, DEFAULT_MEMBER_PERMISSIONS, presetOf, type Permission } from "./permissions.ts";

// --- General: the workspace's name (the team's, GET/PATCH /team) -------------------------------

export const WORKSPACE_NAME_MAX = 80;

/** Whether a typed name may be saved: not blank, within the server's limit, and changed. */
export function workspaceNameSavable(draft: string, current: string | null): boolean {
  const name = draft.trim();
  return name.length > 0 && name.length <= WORKSPACE_NAME_MAX && name !== (current ?? "").trim();
}

// --- Members ----------------------------------------------------------------------------------

export type MemberRole = "owner" | "admin" | "member" | "viewer";

export type MemberLike = {
  id: number;
  display_name: string;
  role: MemberRole;
  permissions: readonly string[];
  email: string | null;
  joined_at: string;
  last_login_at: string | null;
  is_you: boolean;
};

const ROLE_ORDER: Record<MemberRole, number> = { owner: 0, admin: 1, member: 2, viewer: 3 };

/** The owner first, then admins, members and viewers; by name within a role. */
export function sortMembers<T extends Pick<MemberLike, "role" | "display_name">>(people: readonly T[]): T[] {
  return [...people].sort((a, b) => (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9) || a.display_name.localeCompare(b.display_name));
}

/** The letter in a member's round avatar. Empty for a name without letters or digits. */
export function memberInitial(name: string): string {
  const first = [...name.trim()].find((ch) => /[\p{L}\p{N}]/u.test(ch));
  return first ? first.toLocaleUpperCase() : "";
}

/** The person viewing the page: whether they may manage people, and whether they are the owner. */
export type Viewer = { admin: boolean; owner: boolean };

/** An admin changes members and viewers; only the owner touches admins; nobody changes the owner or themselves. */
export function canManageMember(viewer: Viewer, person: Pick<MemberLike, "role" | "is_you">): boolean {
  return viewer.admin && !person.is_you && person.role !== "owner" && (person.role !== "admin" || viewer.owner);
}

// The design names two roles (Owner, Member); the workspace has four (owner, admin, member, viewer)
// and members may have their own mix of permissions. The role menu offers the access presets
// (lib/permissions.ts) plus "custom", which opens the permission list.
export type RoleChoice = "admin" | "member" | "reply" | "viewer" | "custom";

/** What the role menu offers for a person (or an invitation): admin only to the owner (or to keep an admin). */
export function roleChoices(viewer: Viewer, current?: { role: string; permissions: readonly string[] }): RoleChoice[] {
  const keepAdmin = current?.role === "admin";
  return [...(viewer.owner || keepAdmin ? (["admin"] as const) : []), "member", "reply", "viewer", "custom"];
}

/** The menu entry that describes a role and permission set now. */
export function roleChoiceOf(role: string, permissions: readonly string[]): RoleChoice {
  return presetOf(role, permissions);
}

export type AccessChange = { role: "admin" | "member" | "viewer"; permissions?: Permission[] };

/** What picking an entry in a member's role menu does. "edit" opens the custom list, "keep" leaves it
 *  open as it is, "close" shuts it (the saved preset was picked again), "change" saves the preset,
 *  "none" does nothing (the saved preset was picked again with no list open). */
export type RoleMenuStep = "edit" | "keep" | "close" | "change" | "none";

export function roleMenuStep(saved: RoleChoice, picked: RoleChoice, editing: boolean): RoleMenuStep {
  if (picked === "custom") return editing ? "keep" : "edit";
  if (picked === saved) return editing ? "close" : "none";
  return "change";
}

/** What the role menu shows: Custom while the custom list is open, else the saved role. */
export function roleMenuValue(saved: RoleChoice, editing: boolean): RoleChoice {
  return editing ? "custom" : saved;
}

/** The PATCH /people/{id} (or invitation) body for a preset; null for "custom", which needs the list. */
export function accessForChoice(choice: RoleChoice): AccessChange | null {
  if (choice === "custom") return null;
  const preset = ACCESS_PRESETS.find((item) => item.id === choice);
  if (!preset) return null;
  return preset.role === "member" ? { role: "member", permissions: [...preset.permissions] } : { role: preset.role };
}

/** The permissions the custom list starts with: the member's own, else the usual member set. */
export function startingPermissions(role: string, permissions: readonly string[]): Permission[] {
  return role === "member" ? (permissions as Permission[]).slice() : [...DEFAULT_MEMBER_PERMISSIONS];
}

/** A row's second line, as message keys and values the page translates. Addresses and sign-in
 *  times come only to admins (the server leaves them out for everyone else). */
export type MessagePart = { key: string; params?: Record<string, string> };

export function memberDetail(person: Pick<MemberLike, "email" | "joined_at" | "last_login_at">, date: (iso: string) => string): MessagePart[] {
  const parts: MessagePart[] = [];
  if (person.email) parts.push({ key: "members.detailEmail", params: { email: person.email } });
  parts.push({ key: "members.joined", params: { date: date(person.joined_at) } });
  if (person.last_login_at) parts.push({ key: "members.lastSignIn", params: { date: date(person.last_login_at) } });
  return parts;
}

// What the membership history says for each action (backend app/auth/people.py records these).
const AUDIT_ACTIONS = [
  "invite.created",
  "invite.revoked",
  "member.joined",
  "member.role_changed",
  "member.permissions_changed",
  "member.removed",
  "member.password_changed",
  "owner.credentials_set",
  "ownership.transferred",
] as const;

/** The message key for a history action, or null for one this page does not know (shown as sent). */
export function auditKey(action: string): string | null {
  return (AUDIT_ACTIONS as readonly string[]).includes(action) ? `members.audit.${action}` : null;
}

// --- Engines ----------------------------------------------------------------------------------

type EngineFieldLike = { name: string; kind?: string };
type EngineModelLike = { id: string; label: string };
export type EngineLike = {
  id: string;
  label: string;
  available: boolean;
  version: string | null;
  reason: string | null;
  signed_in: boolean | null;
  configurable: boolean;
  config: Record<string, unknown> | null;
  config_fields?: readonly EngineFieldLike[];
  models: readonly EngineModelLike[];
  default_model: string | null;
  custom_models?: boolean;
  limit?: { message: string } | null;
};

/** Whether the engine takes a key (a secret field), and whether one is saved. Never the key itself:
 *  the server only says that one is there. */
export function engineKey(engine: EngineLike): { takesKey: boolean; saved: boolean } {
  const secrets = (engine.config_fields ?? []).filter((field) => field.kind === "secret");
  return {
    takesKey: engine.configurable && secrets.length > 0,
    saved: secrets.some((field) => engine.config?.[`has_${field.name}`] === true),
  };
}

export type EngineStatus = { status: "done" | "waiting" | "denied"; key: string };

/** The pill on an engine's row: a word and a status colour. */
export function engineStatus(engine: EngineLike): EngineStatus {
  if (engine.limit) return { status: "denied", key: "enginesPage.status.limited" };
  return engine.available ? { status: "done", key: "enginesPage.status.ready" } : { status: "waiting", key: "enginesPage.status.needsSetup" };
}

/** The button on an engine's row. Engines that take a key say so (Add key, Replace key). */
export function engineActionKey(engine: EngineLike): string {
  const key = engineKey(engine);
  if (key.takesKey) return key.saved ? "enginesPage.replaceKey" : "enginesPage.addKey";
  return engine.available ? "enginesPage.manage" : "enginesPage.setUp";
}

/** The row's second line: what is wrong when it is not ready, else what is known about it. */
export function engineSubline(engine: EngineLike): { key: string; params?: Record<string, string> } | null {
  if (engine.limit) return { key: "enginesPage.raw", params: { text: engine.limit.message } };
  if (!engine.available) return engine.reason ? { key: "enginesPage.raw", params: { text: engine.reason } } : null;
  const key = engineKey(engine);
  if (key.takesKey && key.saved) return engine.version ? { key: "enginesPage.keySavedVersion", params: { version: engine.version } } : { key: "enginesPage.keySaved" };
  if (engine.signed_in === true) return engine.version ? { key: "enginesPage.signedInVersion", params: { version: engine.version } } : { key: "enginesPage.signedIn" };
  return engine.version ? { key: "enginesPage.raw", params: { text: engine.version } } : null;
}

// The reasoning-effort levels the app has words for (agentsModel.effort.*, shared with the chat's
// engine fields); a level a model reports beyond these is shown as sent.
const KNOWN_EFFORTS = ["low", "medium", "high", "xhigh", "max", "minimal", "none"];

/** The message key for a reasoning-effort level, or null for one the app does not name. */
export function effortLabelKey(level: string): string | null {
  const key = level.toLowerCase();
  return KNOWN_EFFORTS.includes(key) ? `agentsModel.effort.${key}` : null;
}

// The default for new chats is GET/PUT /engines/preference: an engine and, optionally, one of its models.
export type EnginePreferenceLike = { provider: string | null; model: string | null; effort?: string | null };
export type DefaultEngineOption = { value: string; provider: string | null; model: string | null; label: string; ready: boolean };

const SEP = "\u0000";

export function defaultEngineValue(preference: EnginePreferenceLike | null): string {
  if (!preference?.provider) return "";
  return `${preference.provider}${SEP}${preference.model ?? ""}`;
}

export function parseDefaultEngineValue(value: string): { provider: string | null; model: string | null } {
  if (!value) return { provider: null, model: null };
  const [provider, model] = value.split(SEP);
  return { provider: provider || null, model: model || null };
}

/** The choices for the default engine: every ready engine with its own default and each of its
 *  models; the saved choice is kept in the list even when its engine is not ready now. "" is
 *  automatic (the first ready engine), which the caller labels. */
export function defaultEngineOptions(engines: readonly EngineLike[], preference: EnginePreferenceLike | null, defaultLabel: (engine: string) => string): DefaultEngineOption[] {
  const options: DefaultEngineOption[] = [];
  for (const engine of engines) {
    if (!engine.available) continue;
    options.push({ value: `${engine.id}${SEP}`, provider: engine.id, model: null, label: defaultLabel(engine.label), ready: true });
    for (const model of engine.models) {
      options.push({ value: `${engine.id}${SEP}${model.id}`, provider: engine.id, model: model.id, label: `${engine.label} · ${model.label}`, ready: true });
    }
  }
  const saved = defaultEngineValue(preference);
  if (saved && preference?.provider && !options.some((option) => option.value === saved)) {
    const engine = engines.find((item) => item.id === preference.provider);
    const name = engine?.label ?? preference.provider;
    const model = preference.model ? engine?.models.find((item) => item.id === preference.model)?.label ?? preference.model : null;
    options.push({ value: saved, provider: preference.provider, model: preference.model, label: model ? `${name} · ${model}` : defaultLabel(name), ready: engine?.available === true });
  }
  return options;
}
