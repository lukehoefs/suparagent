// The agent permissions matrix (design: Permissions.html; page: components/settings/PermissionsSettings.tsx).
// Agents are the rows; permission sources are the columns: each MCP server and plugin (split by the app its
// tools act on), the connected apps, and the skill library (split by category). A collapsed source shows
// "n of m" per agent; one source at a time opens into its tools.
//
// Pure: no React and no network, so node tests can load it. Everything a cell can change goes through an
// existing API (lib/api.ts): custom MCP and plugin tool grants, the agent's connected-app scopes, and the
// agent's saved skills. A grant only makes a tool available; every call still asks for approval.
import { accountScopesToSend, levelOf, scopesToSend, withAccount, withApp, type AccountScopes, type Level, type Scopes } from "./connected-apps.ts";
import { groupByApp } from "./tool-groups.ts";

/** The backend's limit (services/agent_skills.MAX_SKILLS): more is refused with `too_many_skills`. */
export const MAX_AGENT_SKILLS = 30;

export type SourceKind = "server" | "plugin" | "apps" | "skills";
// The page's "Type" filter: connected apps and MCP tools are tools; the library holds skills.
export type SourceType = "tool" | "skill";
// Why a whole source can be looked at but not changed here.
export type ReadOnlyReason = "server_off" | "apps_not_set_up" | "accounts_failed";
// Why one agent's cells in one source can't be changed: its engine can't use them, or they couldn't be read.
export type Lock = "engine" | "load_failed";

export type MatrixItem = {
  // The tool name, skill name or app slug: what the API is sent.
  id: string;
  label: string;
  hint: string;
  // Connected apps only: whether the app has a "read and change" level.
  canWrite?: boolean;
};

export type MatrixSource = {
  // Unique per column, stable across reloads.
  id: string;
  kind: SourceKind;
  type: SourceType;
  // What a save is grouped by: "server:<id>", "plugin:<id>", "apps" or "skills".
  group: string;
  // The server or plugin name ("" for apps and skills); `sub` is the app within it or the skill category.
  name: string;
  sub: string | null;
  items: MatrixItem[];
  readOnly: ReadOnlyReason | null;
  // Some of its access lets an agent change things for you (connected apps at "read and change").
  actsForYou: boolean;
};

export type AppAccess = { scopes: Scopes; accounts: AccountScopes };
export type MatrixState = { grants: ReadonlySet<string>; apps: ReadonlyMap<number, AppAccess> };

export const SKILLS_GROUP = "skills";
export const APPS_GROUP = "apps";
export const serverGroup = (connectionId: string) => `server:${connectionId}`;
export const pluginGroup = (connectionId: string) => `plugin:${connectionId}`;

// The unit separator cannot appear in a tool name, a skill name or an id, so keys never collide.
const SEP = "\u001f";
export const grantKey = (group: string, item: string, agentId: number) => `${group}${SEP}${item}${SEP}${agentId}`;
export const pairKey = (group: string, agentId: number) => `${group}${SEP}${agentId}`;

export function parseGrantKey(key: string): { group: string; item: string; agentId: number } {
  const [group, item, agentId] = key.split(SEP);
  return { group, item, agentId: Number(agentId) };
}

/** The connection id inside a server or plugin group, or null for apps and skills. */
export function connectionOf(group: string): { kind: "server" | "plugin"; id: string } | null {
  if (group.startsWith("server:")) return { kind: "server", id: group.slice(7) };
  if (group.startsWith("plugin:")) return { kind: "plugin", id: group.slice(7) };
  return null;
}

// --- Building the columns -----------------------------------------------------------------------

type ToolLike = { name: string; description: string };

/** One column per app a server's tools act on (Activepieces · Gmail, Activepieces · Sheets...), so a big
 *  server stays readable; a server whose tools are all one app, or none known, is one column. */
export function toolSources(
  kind: "server" | "plugin",
  connection: { id: string; name: string },
  tools: readonly ToolLike[],
  readOnly: ReadOnlyReason | null = null,
): MatrixSource[] {
  const group = kind === "server" ? serverGroup(connection.id) : pluginGroup(connection.id);
  const apps = groupByApp(tools);
  const split = apps.length > 1;
  return apps.map((app) => ({
    id: split ? `${group}#${app.app}` : group,
    kind,
    type: "tool" as const,
    group,
    name: connection.name,
    sub: split || app.app !== "Other" ? app.app : null,
    items: app.tools.map((tool) => ({ id: tool.name, label: tool.name, hint: tool.description })),
    readOnly,
    actsForYou: false,
  }));
}

/** One column per skill library category that has skills, in the library's category order. */
export function skillSources(
  library: readonly { name: string; category: string; description: string }[],
  categories: readonly string[],
): MatrixSource[] {
  return categories.flatMap((category) => {
    const items = library
      .filter((skill) => skill.category === category)
      .map((skill) => ({ id: skill.name, label: skill.name, hint: skill.description }));
    return items.length
      ? [{ id: `${SKILLS_GROUP}#${category}`, kind: "skills" as const, type: "skill" as const, group: SKILLS_GROUP, name: "", sub: category, items, readOnly: null, actsForYou: false }]
      : [];
  });
}

/** The connected apps column: every app an agent can be given (lib/connected-apps agentAppOptions). */
export function appsSource(
  options: readonly { slug: string; label: string; read: string; write: string | null }[],
  readOnly: ReadOnlyReason | null = null,
): MatrixSource | null {
  if (!options.length) return null;
  return {
    id: APPS_GROUP,
    kind: "apps",
    type: "tool",
    group: APPS_GROUP,
    name: "",
    sub: null,
    items: options.map((app) => ({ id: app.slug, label: app.label, hint: app.read, canWrite: Boolean(app.write) })),
    readOnly,
    actsForYou: options.some((app) => Boolean(app.write)),
  };
}

// --- Reading cells ------------------------------------------------------------------------------

const EMPTY_ACCESS: AppAccess = { scopes: {}, accounts: {} };
export const accessOf = (state: MatrixState, agentId: number): AppAccess => state.apps.get(agentId) ?? EMPTY_ACCESS;

const sortedIds = (ids: readonly string[] | undefined) => [...new Set(ids ?? [])].sort();
const sameList = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/** Whether an item is on for an agent: a granted tool or skill, or an app at any level but off. */
export function itemOn(source: MatrixSource, itemId: string, agentId: number, state: MatrixState): boolean {
  if (source.kind === "apps") return levelOf(accessOf(state, agentId).scopes, itemId) !== "off";
  return state.grants.has(grantKey(source.group, itemId, agentId));
}

/** Whether one item differs between the saved and the edited state for an agent. */
export function itemChanged(source: MatrixSource, itemId: string, agentId: number, saved: MatrixState, desired: MatrixState): boolean {
  if (source.kind !== "apps") {
    const key = grantKey(source.group, itemId, agentId);
    return saved.grants.has(key) !== desired.grants.has(key);
  }
  return appDiffers(accessOf(saved, agentId), accessOf(desired, agentId), itemId);
}

function appDiffers(from: AppAccess, to: AppAccess, slug: string): boolean {
  const a = levelOf(from.scopes, slug);
  const b = levelOf(to.scopes, slug);
  if (a !== b) return true;
  // Accounts of an app that is off are not sent (accountScopesToSend), so they are not a change.
  return b !== "off" && !sameList(sortedIds(from.accounts[slug]), sortedIds(to.accounts[slug]));
}

/** "n of m" for a collapsed cell, over the items shown. */
export function sourceCount(source: MatrixSource, agentId: number, state: MatrixState): { on: number; total: number } {
  let on = 0;
  for (const item of source.items) if (itemOn(source, item.id, agentId, state)) on += 1;
  return { on, total: source.items.length };
}

export function cellChanged(source: MatrixSource, agentId: number, saved: MatrixState, desired: MatrixState): boolean {
  return source.items.some((item) => itemChanged(source, item.id, agentId, saved, desired));
}

/** How many agents have at least one item of a source (the phone layout's collapsed summary). */
export function agentsWithAny(source: MatrixSource, agentIds: readonly number[], state: MatrixState): number {
  return agentIds.filter((id) => sourceCount(source, id, state).on > 0).length;
}

export function isEditable(source: MatrixSource, agentId: number, locks: ReadonlyMap<string, Lock>): boolean {
  return source.readOnly === null && !locks.has(pairKey(source.group, agentId));
}

// --- Editing ------------------------------------------------------------------------------------

/** Turn every key on when any is off, or every key off when all are on. */
export function toggleKeys(grants: ReadonlySet<string>, keys: readonly string[]): Set<string> {
  const next = new Set(grants);
  const allOn = keys.length > 0 && keys.every((key) => next.has(key));
  for (const key of keys) {
    if (allOn) next.delete(key);
    else next.add(key);
  }
  return next;
}

/** Whether a set of keys reads as all on, partly on (a mixed checkbox) or off. */
export function keysState(grants: ReadonlySet<string>, keys: readonly string[]): "on" | "mixed" | "off" {
  const on = keys.filter((key) => grants.has(key)).length;
  return on === 0 ? "off" : on === keys.length ? "on" : "mixed";
}

/** The checkbox cells a row toggle ("everything shown for this agent") changes: editable tool and skill
 *  items of the sources shown. Connected apps have levels and accounts, so they are set one by one. */
export function rowKeys(sources: readonly MatrixSource[], agentId: number, locks: ReadonlyMap<string, Lock>): string[] {
  return sources.flatMap((source) => (source.kind !== "apps" && isEditable(source, agentId, locks)
    ? source.items.map((item) => grantKey(source.group, item.id, agentId))
    : []));
}

/** The cells a column toggle ("this tool for every agent shown") changes. */
export function columnKeys(source: MatrixSource, itemId: string, agentIds: readonly number[], locks: ReadonlyMap<string, Lock>): string[] {
  if (source.kind === "apps") return [];
  return agentIds.filter((id) => isEditable(source, id, locks)).map((id) => grantKey(source.group, itemId, id));
}

/** One source's items for one agent (the phone layout's "all of it" toggle). */
export function sourceKeys(source: MatrixSource, agentId: number, locks: ReadonlyMap<string, Lock>): string[] {
  return rowKeys([source], agentId, locks);
}

function withAccess(apps: ReadonlyMap<number, AppAccess>, agentId: number, access: AppAccess): Map<number, AppAccess> {
  const next = new Map(apps);
  next.set(agentId, access);
  return next;
}

export function setAppLevel(apps: ReadonlyMap<number, AppAccess>, agentId: number, slug: string, level: Level): Map<number, AppAccess> {
  const current = apps.get(agentId) ?? EMPTY_ACCESS;
  // Accounts stay chosen while an app is off, so switching it back on restores them; they are not sent.
  return withAccess(apps, agentId, { scopes: withApp(current.scopes, slug, level), accounts: current.accounts });
}

export function setAppAccount(apps: ReadonlyMap<number, AppAccess>, agentId: number, slug: string, accountId: string, allowed: boolean): Map<number, AppAccess> {
  const current = apps.get(agentId) ?? EMPTY_ACCESS;
  return withAccess(apps, agentId, { scopes: current.scopes, accounts: withAccount(current.accounts, slug, accountId, allowed) });
}

// --- Changes ------------------------------------------------------------------------------------

export type GrantChange = { kind: "grant"; group: string; item: string; agentId: number; grant: boolean };
export type AppChange = {
  kind: "app"; app: string; agentId: number; from: Level; to: Level; accountsFrom: string[]; accountsTo: string[];
};
export type Change = GrantChange | AppChange;

export function changeKey(change: Change): string {
  return change.kind === "grant"
    ? `g${SEP}${grantKey(change.group, change.item, change.agentId)}`
    : `a${SEP}${change.app}${SEP}${change.agentId}`;
}

/** The change key a cell's item would have, so a cell can find its own save error. */
export function itemChangeKey(source: MatrixSource, itemId: string, agentId: number): string {
  return source.kind === "apps"
    ? `a${SEP}${itemId}${SEP}${agentId}`
    : `g${SEP}${grantKey(source.group, itemId, agentId)}`;
}

/** Whether any item of a source failed to save for an agent. */
export function cellFailed(source: MatrixSource, agentId: number, failed: ReadonlySet<string>): boolean {
  return failed.size > 0 && source.items.some((item) => failed.has(itemChangeKey(source, item.id, agentId)));
}

/** Every difference between the saved and the edited state: sorted by agent, then group and item. */
export function diff(saved: MatrixState, desired: MatrixState): Change[] {
  const changes: Change[] = [];
  for (const key of desired.grants) if (!saved.grants.has(key)) changes.push({ kind: "grant", ...parseGrantKey(key), grant: true });
  for (const key of saved.grants) if (!desired.grants.has(key)) changes.push({ kind: "grant", ...parseGrantKey(key), grant: false });
  const agents = new Set([...saved.apps.keys(), ...desired.apps.keys()]);
  for (const agentId of agents) {
    const from = accessOf(saved, agentId);
    const to = accessOf(desired, agentId);
    const slugs = new Set([...Object.keys(from.scopes), ...Object.keys(to.scopes), ...Object.keys(from.accounts), ...Object.keys(to.accounts)]);
    for (const app of slugs) {
      if (!appDiffers(from, to, app)) continue;
      changes.push({
        kind: "app", app, agentId, from: levelOf(from.scopes, app), to: levelOf(to.scopes, app),
        accountsFrom: sortedIds(from.accounts[app]), accountsTo: sortedIds(to.accounts[app]),
      });
    }
  }
  const order = (c: Change) => (c.kind === "grant" ? `${c.group}${SEP}${c.item}` : `${APPS_GROUP}${SEP}${c.app}`);
  // A plain code-unit comparison: the order is the same in every language and never skips the separator.
  return changes.sort((a, b) => a.agentId - b.agentId || (order(a) < order(b) ? -1 : order(a) > order(b) ? 1 : 0));
}

/** "n changes · m agents". */
export function changeTally(changes: readonly Change[]): { changes: number; agents: number } {
  return { changes: changes.length, agents: new Set(changes.map((c) => c.agentId)).size };
}

/** App changes that newly let an agent change things in an app: the review asks to confirm these. */
export function raisesToWrite(changes: readonly Change[]): AppChange[] {
  return changes.filter((c): c is AppChange => c.kind === "app" && c.to === "write" && c.from !== "write");
}

/** App changes that leave an app on with no account chosen: it gives the agent nothing until one is. */
export function appWithoutAccount(change: Change): boolean {
  return change.kind === "app" && change.to !== "off" && change.accountsTo.length === 0;
}

// --- The skill limit ----------------------------------------------------------------------------

/** Skills per agent after the edit: library skills ticked plus the agent's other skills. */
export function skillCount(grants: ReadonlySet<string>, otherSkills: ReadonlyMap<number, number>, agentId: number): number {
  let n = otherSkills.get(agentId) ?? 0;
  for (const key of grants) {
    const { group, agentId: id } = parseGrantKey(key);
    if (group === SKILLS_GROUP && id === agentId) n += 1;
  }
  return n;
}

/** Agents that would have more skills than the backend accepts. */
export function overSkillLimit(grants: ReadonlySet<string>, otherSkills: ReadonlyMap<number, number>, agentIds: readonly number[], limit = MAX_AGENT_SKILLS): number[] {
  return agentIds.filter((id) => skillCount(grants, otherSkills, id) > limit);
}

// --- Filters ------------------------------------------------------------------------------------

export type Filters = {
  query: string;
  types: ReadonlySet<SourceType>;
  // Source ids the person unticked.
  hidden: ReadonlySet<string>;
};

/** The sources and items the filters leave. A search matches an item's name or description, or the
 *  source's own name (so "gmail" shows every Gmail tool); a source with nothing left is not shown. */
export function visibleSources(
  sources: readonly MatrixSource[],
  filters: Filters,
  labelOf: (source: MatrixSource) => string = (source) => [source.name, source.sub].filter(Boolean).join(" "),
): MatrixSource[] {
  const q = filters.query.trim().toLocaleLowerCase();
  return sources.flatMap((source) => {
    if (!filters.types.has(source.type) || filters.hidden.has(source.id)) return [];
    if (!q) return [source];
    const whole = `${labelOf(source)} ${source.name} ${source.sub ?? ""}`.toLocaleLowerCase().includes(q);
    const items = whole ? source.items : source.items.filter((item) =>
      item.id.toLocaleLowerCase().includes(q) || item.label.toLocaleLowerCase().includes(q) || item.hint.toLocaleLowerCase().includes(q));
    return items.length ? [{ ...source, items }] : [];
  });
}

/** The agents a client filter leaves: every agent, or the ones the client's portal lists. */
export function agentsInClient<T extends { id: number }>(
  agents: readonly T[],
  clients: readonly { id: string; agent_ids: readonly number[] }[],
  clientId: string | null,
): T[] {
  if (!clientId) return [...agents];
  const client = clients.find((c) => c.id === clientId);
  if (!client) return [...agents];
  return agents.filter((agent) => client.agent_ids.includes(agent.id));
}

// --- Saving -------------------------------------------------------------------------------------

export type SaveOp =
  | { op: "skill"; agentId: number; name: string; grant: boolean; keys: string[] }
  | { op: "tools"; kind: "server" | "plugin"; connectionId: string; agentId: number; tools: string[]; keys: string[] }
  | { op: "apps"; agentId: number; scopes: Scopes | null; accounts: AccountScopes; keys: string[] };

/** The API calls that apply a set of changes, each with the change keys it carries (a failure marks those
 *  cells). Skills one by one, removals first so an agent near the limit can swap; tool grants as the full
 *  list per connection and agent (the API replaces the list); connected apps as one update per agent. */
export function planSave(
  changes: readonly Change[],
  desired: MatrixState,
  providerOf: (agentId: number) => string,
): SaveOp[] {
  const removals: SaveOp[] = [];
  const additions: SaveOp[] = [];
  const tools = new Map<string, { kind: "server" | "plugin"; connectionId: string; agentId: number; group: string; keys: string[] }>();
  const apps = new Map<number, string[]>();
  for (const change of changes) {
    const key = changeKey(change);
    if (change.kind === "app") {
      apps.set(change.agentId, [...(apps.get(change.agentId) ?? []), key]);
    } else if (change.group === SKILLS_GROUP) {
      (change.grant ? additions : removals).push({ op: "skill", agentId: change.agentId, name: change.item, grant: change.grant, keys: [key] });
    } else {
      const connection = connectionOf(change.group);
      if (!connection) continue;
      const pair = pairKey(change.group, change.agentId);
      const entry = tools.get(pair) ?? { kind: connection.kind, connectionId: connection.id, agentId: change.agentId, group: change.group, keys: [] };
      entry.keys.push(key);
      tools.set(pair, entry);
    }
  }
  const toolOps: SaveOp[] = [...tools.values()].map((entry) => ({
    op: "tools",
    kind: entry.kind,
    connectionId: entry.connectionId,
    agentId: entry.agentId,
    tools: [...desired.grants]
      .map(parseGrantKey)
      .filter((cell) => cell.group === entry.group && cell.agentId === entry.agentId)
      .map((cell) => cell.item)
      .sort(),
    keys: entry.keys,
  }));
  const appOps: SaveOp[] = [...apps].map(([agentId, keys]) => {
    const access = accessOf(desired, agentId);
    const provider = providerOf(agentId);
    return { op: "apps", agentId, scopes: scopesToSend(access.scopes, provider), accounts: accountScopesToSend(access.accounts, access.scopes, provider), keys };
  });
  return [...removals, ...additions, ...toolOps, ...appOps];
}

export type SaveDeps = {
  saveSkill: (agentId: number, name: string) => Promise<unknown>;
  deleteSkill: (agentId: number, name: string) => Promise<unknown>;
  saveTools: (kind: "server" | "plugin", connectionId: string, agentId: number, tools: string[]) => Promise<unknown>;
  saveApps: (agentId: number, scopes: Scopes | null, accounts: AccountScopes) => Promise<unknown>;
};

export type SaveResult = { saved: string[]; failed: Map<string, unknown> };

/** Runs a plan and reports, per change key, what saved and what failed (with the error). One failure
 *  never stops the rest. Skill files are written in order; tool grants run a few at a time, since each
 *  asks its server for its current tools first. */
export async function runSave(ops: readonly SaveOp[], deps: SaveDeps, concurrency = 3): Promise<SaveResult> {
  const saved: string[] = [];
  const failed = new Map<string, unknown>();
  const run = async (op: SaveOp) => {
    try {
      if (op.op === "skill") await (op.grant ? deps.saveSkill(op.agentId, op.name) : deps.deleteSkill(op.agentId, op.name));
      else if (op.op === "tools") await deps.saveTools(op.kind, op.connectionId, op.agentId, op.tools);
      else await deps.saveApps(op.agentId, op.scopes, op.accounts);
      saved.push(...op.keys);
    } catch (err) {
      for (const key of op.keys) failed.set(key, err ?? new Error(""));
    }
  };
  for (const op of ops.filter((o) => o.op === "skill")) await run(op);
  const rest = ops.filter((o) => o.op !== "skill");
  let next = 0;
  const worker = async () => {
    while (next < rest.length) {
      const op = rest[next];
      next += 1;
      await run(op);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, rest.length)) }, worker));
  return { saved, failed };
}

/** The edited state after a partial save: what the server now says, with the changes that did not
 *  save put back on top, so they stay marked and can be saved again. */
export function reapply(fresh: MatrixState, failed: readonly Change[]): MatrixState {
  const grants = new Set(fresh.grants);
  let apps = new Map(fresh.apps);
  for (const change of failed) {
    if (change.kind === "grant") {
      const key = grantKey(change.group, change.item, change.agentId);
      if (change.grant) grants.add(key);
      else grants.delete(key);
    } else {
      apps = setAppLevel(apps, change.agentId, change.app, change.to);
      const current = apps.get(change.agentId) ?? EMPTY_ACCESS;
      const accounts: AccountScopes = { ...current.accounts };
      if (change.accountsTo.length) accounts[change.app] = [...change.accountsTo];
      else delete accounts[change.app];
      apps.set(change.agentId, { scopes: current.scopes, accounts });
    }
  }
  return { grants, apps };
}

/** Keeps only the changes whose cell still exists after a reload (a server may have gone meanwhile). */
export function changesStillShown(changes: readonly Change[], sources: readonly MatrixSource[], agentIds: readonly number[]): Change[] {
  const agents = new Set(agentIds);
  const items = new Set(sources.flatMap((source) => source.items.map((item) => `${source.group}${SEP}${item.id}`)));
  return changes.filter((change) => agents.has(change.agentId)
    && items.has(change.kind === "grant" ? `${change.group}${SEP}${change.item}` : `${APPS_GROUP}${SEP}${change.app}`));
}
