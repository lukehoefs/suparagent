// The Apps page (design: Apps.html): connected apps (Composio), custom MCP servers with the
// three-step add flow, and the marketplace (MCP listings and Composio's catalog). The plain logic
// lives here, apart from the components, so node tests can load it. It returns message keys
// (lib/locales/apps-extra.ts); the components translate them. No runtime imports except plain
// lib files.
import { accountOnlyCard, cardState, type CatalogApp, type CatalogPage } from "./apps-catalog.ts";
import { isComposioLink, type ComposioAccount, type LinkBridge, type Opener, type TabWindow } from "./connected-apps.ts";
import type { CustomMcpAuthMode, CustomMcpConnection, CustomMcpDraft } from "./custom-mcp.ts";
import type { MarketplaceCatalog, MarketplaceConnection, MarketplaceListing, MarketplaceSection } from "./marketplace.ts";

export const APPS_HREF = "/apps/";
// The id of the custom servers heading. The old address /marketplace/#custom-mcp-heading
// (lib/remote-computers.ts) lands on it through the redirect.
export const SERVERS_ANCHOR = "custom-mcp-heading";
// /apps/?add=server opens the add-a-server panel (for the command palette and other pages).
export const ADD_SERVER_PARAM = "add";
export const ADD_SERVER_VALUE = "server";
export const ADD_SERVER_HREF = `${APPS_HREF}?${ADD_SERVER_PARAM}=${ADD_SERVER_VALUE}`;

// The status language of ui/StatusPill, repeated here so this file stays import-free of components.
export type Status = "done" | "waiting" | "denied" | "running" | "idle";

/* ------------------------------------------------------------------ custom MCP servers */

type ServerLike = Pick<CustomMcpConnection, "state" | "enabled" | "auth_mode" | "oauth_signed_in">;

// The pill on a server card: a word and a dot. "Draft" is a server that was never tested.
export function serverStatus(server: ServerLike): { status: Status; key: string } {
  if (server.state === "connected" && server.enabled) return { status: "done", key: "apps.servers.status.on" };
  if (server.state === "connected" || server.state === "disabled") return { status: "idle", key: "apps.servers.status.off" };
  if (server.state === "not_tested") return { status: "idle", key: "apps.servers.status.draft" };
  // "unreachable" is any failed test: the address was not reached, or the server answered wrongly.
  if (server.state === "unreachable") return { status: "denied", key: "apps.add.testFailed" };
  // needs_sign_in: an OAuth server waits for you to sign in, also when the server turned down the
  // sign-in it has (a revoked token, a missing scope); a rejected secret is an error.
  if (server.auth_mode === "oauth") return { status: "waiting", key: "apps.servers.status.signIn" };
  return { status: "denied", key: "apps.servers.status.secret" };
}

// What the first button on a card does before a test can run. An OAuth server whose sign-in was
// turned down signs in again: POST /oauth/start takes a server that is already signed in.
export type ServerStart = "signIn" | "addSecret" | "test";
export function serverStart(server: Pick<CustomMcpConnection, "state" | "auth_mode" | "oauth_signed_in" | "credential_configured">): ServerStart {
  if (server.auth_mode === "oauth" && (!server.oauth_signed_in || server.state === "needs_sign_in")) return "signIn";
  if ((server.auth_mode === "bearer" || server.auth_mode === "header") && !server.credential_configured) return "addSecret";
  return "test";
}

// The last test found tools at the current revision (the backend reports such a server as
// "disabled" while it is off and "connected" once it is on).
export function testPassed(server: Pick<CustomMcpConnection, "state">): boolean {
  return server.state === "disabled" || server.state === "connected";
}

export function canTurnOn(server: Pick<CustomMcpConnection, "state" | "enabled">): boolean {
  return !server.enabled && server.state === "disabled";
}

export function canGrant(server: Pick<CustomMcpConnection, "state" | "enabled">): boolean {
  return server.enabled && server.state === "connected";
}

// The last test failed and its error still stands (the backend keeps it until a test passes or the
// address or sign-in changes). The card then offers Try again first, with Edit details beside it
// (design: States, "Apps: server test failed").
export function testFailed(server: Pick<CustomMcpConnection, "last_error_code">): boolean {
  return server.last_error_code !== null;
}

// The buttons of a server card: one primary action (the next step for this server), at most one
// secondary beside it, and the rest in the card's "..." menu (which also always holds Edit and
// Remove). Signing in or adding the secret comes first; after a failed test, Try again with Edit
// details beside it; a draft is tested; a tested server that is off is turned on; one that is on
// has its grants managed, with Test again and Turn off in the menu.
export type ServerAction = "signIn" | "addSecret" | "test" | "retry" | "editDetails" | "turnOn" | "turnOff" | "grants" | "testAgain";
export function serverActions(
  server: Pick<CustomMcpConnection, "state" | "enabled" | "auth_mode" | "oauth_signed_in" | "credential_configured" | "last_error_code">,
): { primary: ServerAction | null; secondary: ServerAction | null; more: ServerAction[] } {
  const off: ServerAction[] = server.enabled ? ["turnOff"] : [];
  const start = serverStart(server);
  if (start !== "test") return { primary: start, secondary: null, more: off };
  if (testFailed(server)) return { primary: "retry", secondary: "editDetails", more: off };
  if (canGrant(server)) return { primary: "grants", secondary: null, more: ["testAgain", "turnOff"] };
  if (canTurnOn(server)) return { primary: "turnOn", secondary: null, more: ["testAgain"] };
  return { primary: "test", secondary: null, more: off };
}

// The backend's codes for a test that never reached the server.
const NOT_REACHED = new Set(["connect_failed", "dns_failed", "endpoint_mismatch"]);

function notReached(server: Pick<CustomMcpConnection, "last_error_code">): boolean {
  return server.last_error_code != null && NOT_REACHED.has(server.last_error_code);
}

// The line under "Test failed" in Add a server. Only a test that never reached the server says so
// and names its address ({endpoint}); a rejected secret says that; anything else points at the
// error shown above it.
export function testFailedHintKey(server: Pick<CustomMcpConnection, "last_error_code">): string {
  if (notReached(server)) return "apps.add.unreachableHint";
  if (server.last_error_code === "authentication_failed") return "apps.servers.secretRejected";
  return "apps.add.testFailedHint";
}

// A server's address on its card: host and path, without the https:// every address has (design:
// "search.lthops.tech/mcp"). The card keeps the full address in its title.
export function endpointLabel(endpoint: string): string {
  return endpoint.replace(/^https:\/\//i, "");
}

function hostOf(endpoint: string): string {
  try {
    return new URL(endpoint).host || endpointLabel(endpoint);
  } catch {
    return endpointLabel(endpoint);
  }
}

const sameName = (name: string) => name.trim().toLocaleLowerCase();

// What tells apart servers that were given the same name (two servers both called after the tool
// they run, say): the address's host, or the whole address when the hosts match too, or a number
// as a last resort. Null for a server whose name is its own. Names come from the user's data, so
// nothing here knows any particular server.
export function serverQualifiers(servers: readonly Pick<CustomMcpConnection, "id" | "name" | "endpoint">[]): Map<string, string | null> {
  const groups = new Map<string, Pick<CustomMcpConnection, "id" | "name" | "endpoint">[]>();
  for (const server of servers) {
    const key = sameName(server.name);
    groups.set(key, [...(groups.get(key) ?? []), server]);
  }
  const out = new Map<string, string | null>();
  for (const group of groups.values()) {
    if (group.length === 1) {
      out.set(group[0].id, null);
      continue;
    }
    const hosts = group.map((server) => hostOf(server.endpoint));
    const hostsDiffer = new Set(hosts).size === hosts.length;
    const full = group.map((server) => endpointLabel(server.endpoint).replace(/\/+$/, ""));
    const fullDiffer = new Set(full).size === full.length;
    group.forEach((server, index) => out.set(server.id, hostsDiffer ? hosts[index] : fullDiffer ? full[index] : `#${index + 1}`));
  }
  return out;
}

// The server's name with its qualifier, for titles and messages that name one server.
export function serverLabel(name: string, qualifier: string | null | undefined): string {
  return qualifier ? `${name} (${qualifier})` : name;
}

const nameWords = (text: string) => text.toLocaleLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
const squash = (text: string) => nameWords(text).join("");

// The connected app a custom server seems to duplicate (a Gmail server beside the Gmail app), or
// null. A match is the app's id or name as a whole word of the server's name or host, or as its
// whole name ("Google Calendar" for googlecalendar). Apps with ids under three letters never match,
// so a stray word cannot.
export function overlappingApp<A extends { app: string; name: string }>(
  server: Pick<CustomMcpConnection, "name" | "endpoint">,
  apps: readonly A[],
): A | null {
  const tokens = new Set([...nameWords(server.name), ...nameWords(hostOf(server.endpoint))]);
  const whole = squash(server.name);
  for (const app of apps) {
    const ids = [app.app.toLocaleLowerCase(), squash(app.name)].filter((id) => id.length >= 3);
    if (ids.some((id) => tokens.has(id) || whole === id)) return app;
  }
  return null;
}

// A short hint under the card when something needs doing, or null. A test that never reached the
// server names its address ({endpoint}, design: States, "Apps: server test failed"); any other
// failed test keeps the longer line, since the server may have answered but wrongly.
export function serverHintKey(server: ServerLike & Pick<CustomMcpConnection, "last_error_code">): string | null {
  if (server.state === "unreachable") return notReached(server) ? "apps.add.unreachableHint" : "apps.servers.unreachableHint";
  if (server.state !== "needs_sign_in") return null;
  return server.auth_mode === "oauth" ? "apps.servers.signInHint" : "apps.servers.secretRejected";
}

// The line under a server's name. A failed test keeps no list of tools (the backend drops it), so
// that line says the test failed rather than "0 tools".
export function testedLineKey(server: Pick<CustomMcpConnection, "last_tested_at" | "tool_count">): string {
  if (!server.last_tested_at) return "apps.servers.notTested";
  return server.tool_count === null ? "apps.servers.lastTestFailed" : "apps.servers.lastTested";
}

// A sign-in tab, opened during the click like reserveTab: a browser blocks a tab opened after an
// await, and a tab opened with noopener cannot be told apart from a blocked one. It is sent to the
// sign-in page once the server made it; only an https address is ever opened. The desktop app
// gives no tab (its shell sends every new window to the system browser), so without one the page
// is opened directly once it is known.
export function reserveSignInTab(open: (url: string, features?: string) => TabWindow | null): { navigate(url: string): void; cancel(): void } {
  const tab = open("about:blank");
  if (tab) tab.opener = null;
  return {
    navigate: (url) => {
      if (!url.startsWith("https://")) { tab?.close(); throw new AppsError("sign_in_not_https"); }
      if (!tab) { open(url, "noopener"); return; }
      if (tab.closed) throw new AppsError("popup_blocked");
      tab.location.href = url;
    },
    cancel: () => { tab?.close(); },
  };
}

// The sign-in started for a server has finished: the server now has a sign-in that is not turned
// down (a finished sign-in starts a new revision with no error), or it is gone.
export function signInFinished(server: Pick<CustomMcpConnection, "state" | "auth_mode" | "oauth_signed_in" | "credential_configured"> | undefined): boolean {
  return !server || serverStart(server) !== "signIn";
}

export type ServerForm = {
  name: string;
  endpoint: string;
  auth_mode: CustomMcpAuthMode;
  auth_header_name: string;
  credential: string;
  oauth_client_id: string;
  oauth_scopes: string;
};

export const EMPTY_SERVER_FORM: ServerForm = {
  name: "", endpoint: "", auth_mode: "none", auth_header_name: "", credential: "", oauth_client_id: "", oauth_scopes: "",
};

// The edit form for a saved server. The secret is write-only, so it always starts blank.
export function formFor(server: Pick<CustomMcpConnection, "name" | "endpoint" | "auth_mode" | "auth_header_name" | "oauth_client_id" | "oauth_scopes">): ServerForm {
  return {
    name: server.name, endpoint: server.endpoint, auth_mode: server.auth_mode,
    auth_header_name: server.auth_header_name ?? "", credential: "",
    oauth_client_id: server.oauth_client_id ?? "", oauth_scopes: server.oauth_scopes ?? "",
  };
}

// Continue is offered once there is a name, an address and, for a custom header, its name.
export function formReady(form: ServerForm): boolean {
  if (!form.name.trim() || !form.endpoint.trim()) return false;
  return form.auth_mode !== "header" || form.auth_header_name.trim() !== "";
}

// What a new server sends: a secret only with an auth method that has one, and only when typed.
export function createBody(form: ServerForm): CustomMcpDraft {
  const body: CustomMcpDraft = { name: form.name.trim(), endpoint: form.endpoint.trim(), auth_mode: form.auth_mode };
  if (form.auth_mode === "header") body.auth_header_name = form.auth_header_name.trim();
  if (form.auth_mode !== "none" && form.credential) body.credential = form.credential;
  if (form.auth_mode === "oauth") {
    body.oauth_client_id = form.oauth_client_id.trim();
    body.oauth_scopes = form.oauth_scopes.trim().split(/\s+/).filter(Boolean).join(" ");
  }
  return body;
}

// The tool names a test found, the first `max` of them and how many more there are.
export function shownTools<T>(tools: readonly T[], max = 24): { shown: T[]; more: number } {
  return { shown: tools.slice(0, max), more: Math.max(0, tools.length - max) };
}

/* ------------------------------------------------------------------ tool grants */

export function toggleTool(checked: readonly string[], name: string, on: boolean): string[] {
  const rest = checked.filter((item) => item !== name);
  return on ? [...rest, name] : rest;
}

export function checkAll(checked: readonly string[], names: readonly string[]): string[] {
  return Array.from(new Set([...checked, ...names]));
}

// The exact tools to save, in the server's order, each with the schema it was reviewed at.
export function exactGrants<T extends { name: string; schema_digest: string }>(tools: readonly T[], checked: readonly string[]): { name: string; schema_digest: string }[] {
  const wanted = new Set(checked);
  return tools.filter((tool) => wanted.has(tool.name)).map(({ name, schema_digest }) => ({ name, schema_digest }));
}

export function sameSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((item) => set.has(item));
}

/* ------------------------------------------------------------------ errors */

// Backend error codes this page words itself; anything else keeps the backend's message.
const KNOWN_ERRORS = new Set([
  "connection_changed", "credential_required", "connection_not_tested", "connection_not_enabled", "tool_schema_changed",
  "authentication_failed", "needs_sign_in", "oauth_not_supported", "oauth_client_required", "oauth_discovery_failed",
  "oauth_registration_failed", "invalid_oauth_client", "invalid_oauth_scopes", "unsafe_endpoint", "invalid_header_name",
  "invalid_credential", "invalid_name", "too_many_connections", "agent_toolset_too_large",
  "not_composio", "popup_blocked", "sign_in_not_https",
]);

export type ErrorText = { key: string } | { message: string };

export function errorText(error: unknown, fallbackKey: string): ErrorText {
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code === "string" && KNOWN_ERRORS.has(code)) return { key: `apps.error.${code}` };
  if (error instanceof Error && error.message) return { message: error.message };
  return { key: fallbackKey };
}

// What a banner shows: the page's own words as its title, and the backend's message under it when
// the page has no words for the cause.
export type Problem = { key: string; detail: string | null };
export function problemOf(error: unknown, fallbackKey: string): Problem {
  const text = errorText(error, fallbackKey);
  return "key" in text ? { key: text.key, detail: null } : { key: fallbackKey, detail: text.message };
}

// An error this page raises itself, with a code errorText can word.
export class AppsError extends Error {
  code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

/* ------------------------------------------------------------------ connected apps (Composio) */

// A browser blocks a tab opened after an await, so the tab is opened during the click and sent to
// the link once the server made it. The desktop app has no tabs: its shell opens the link. Only an
// https link on composio.dev is ever opened (lib/connected-apps.ts isComposioLink).
export function reserveTab(bridge: LinkBridge | undefined, open: Opener): { navigate(url: string): Promise<void>; cancel(): void } {
  if (bridge?.openComposioLink) {
    const openLink = bridge.openComposioLink;
    return {
      navigate: async (url) => { if (!isComposioLink(url)) throw new AppsError("not_composio"); await openLink(url); },
      cancel: () => {},
    };
  }
  const tab = open("about:blank", "_blank");
  if (tab) tab.opener = null;
  return {
    navigate: async (url) => {
      if (!isComposioLink(url)) { tab?.close(); throw new AppsError("not_composio"); }
      if (!tab || tab.closed) throw new AppsError("popup_blocked");
      tab.location.href = url;
    },
    cancel: () => { tab?.close(); },
  };
}

// The pill of an app card, or null when the card offers Connect instead.
export function appStatus(configured: boolean, mine: ComposioAccount[]): { status: Status; key: string } | null {
  const state = cardState(configured, mine);
  if (state === "connected") return { status: "done", key: "apps.status.connected" };
  if (state === "pending") return { status: "waiting", key: "apps.status.pending" };
  if (state === "failed") return { status: "denied", key: "apps.status.failed" };
  return null;
}

// One account's status: a key, or null to show Composio's own word.
export function accountStatus(status: string): { status: Status; key: string | null } {
  if (status === "ACTIVE") return { status: "done", key: "apps.status.connected" };
  if (status === "INITIATED" || status === "INITIALIZING") return { status: "waiting", key: "apps.account.waiting" };
  if (status === "FAILED") return { status: "denied", key: "apps.status.failed" };
  if (status === "EXPIRED") return { status: "denied", key: "apps.account.expired" };
  if (status === "INACTIVE") return { status: "idle", key: "apps.account.inactive" };
  return { status: "idle", key: null };
}

// "INACTIVE_BY_ADMIN" -> "Inactive by admin": Composio's own word for a status this page does not know.
export function rawStatus(status: string): string {
  const words = status.replace(/_+/g, " ").trim().toLowerCase();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : status;
}

// The design's order for the apps with curated agent tools; any other curated app follows them in
// the catalog's order.
const CURATED_ORDER = ["gmail", "github", "googlecalendar"];

function curatedRank(slug: string): number {
  const at = CURATED_ORDER.indexOf(slug);
  return at < 0 ? CURATED_ORDER.length : at;
}

// The Connected apps cards: the apps with curated agent tools first (Gmail, GitHub, Calendar, as the
// design orders them), then every other app that has an account here, by name. An account whose
// app is in no page loaded so far still gets a card, so it can be managed.
export function connectedAppCards(home: readonly CatalogApp[], loaded: readonly CatalogApp[], accounts: readonly ComposioAccount[] | null, label: (slug: string) => string): CatalogApp[] {
  const bySlug = new Map<string, CatalogApp>();
  for (const app of [...loaded, ...home]) bySlug.set(app.app, app);
  const out: CatalogApp[] = [];
  const seen = new Set<string>();
  for (const app of home) {
    if (app.agent_actions !== "curated" || seen.has(app.app)) continue;
    seen.add(app.app);
    out.push(app);
  }
  // A stable sort: curated apps outside the design's list keep the catalog's order.
  out.sort((a, b) => curatedRank(a.app) - curatedRank(b.app));
  const others: CatalogApp[] = [];
  for (const account of accounts ?? []) {
    if (seen.has(account.toolkit)) continue;
    seen.add(account.toolkit);
    others.push(bySlug.get(account.toolkit) ?? accountOnlyCard(account.toolkit, label));
  }
  others.sort((a, b) => a.name.localeCompare(b.name));
  return [...out, ...others];
}

// The design's short names on the Connected apps cards ("Calendar", not "Google Calendar"), so the
// name stays on one line beside Connect. The app's details and the Connect label keep its full name.
const CARD_NAME_KEYS: ReadonlyMap<string, string> = new Map([["googlecalendar", "apps.connected.short.googlecalendar"]]);

export function cardNameKey(app: Pick<CatalogApp, "app">): string | null {
  return CARD_NAME_KEYS.get(app.app) ?? null;
}

// The marketplace shows the catalog apps that are not already cards under Connected apps.
export function marketApps(apps: readonly CatalogApp[], shown: readonly CatalogApp[]): CatalogApp[] {
  const taken = new Set(shown.map((app) => app.app));
  return apps.filter((app) => !taken.has(app.app));
}

// What an agent may do with the app, in one line.
export function appAgentsKey(app: Pick<CatalogApp, "agent_actions">): string {
  if (app.agent_actions === "curated") return "apps.app.curated";
  if (app.agent_actions === "generic") return "apps.app.generic";
  if (app.agent_actions === "unavailable") return "apps.app.unavailable";
  return "apps.app.unknown";
}

export function connectionNoteKey(app: Pick<CatalogApp, "connection">): string | null {
  if (app.connection === "custom_auth") return "apps.app.customAuth";
  if (app.connection === "no_auth") return "apps.app.noAuth";
  return null;
}

// Where the list came from and how far to trust it; null when nothing needs saying.
export function sourceNoticeKey(page: Pick<CatalogPage, "source" | "error" | "stale" | "complete">, configured: boolean): { tone: "info" | "warning"; key: string } | null {
  if (page.source === "starter") {
    if (page.error === "key_rejected" || page.error === "permission_denied") return { tone: "warning", key: "apps.source.starterRejected" };
    if (page.error) return { tone: "warning", key: "apps.source.starterOffline" };
    return { tone: "info", key: configured ? "apps.source.starter" : "apps.source.starterNoKey" };
  }
  if (page.stale) return { tone: "warning", key: "apps.source.stale" };
  if (!page.complete) return { tone: "info", key: "apps.source.partial" };
  return null;
}

/* ------------------------------------------------------------------ marketplace */

// The category filter: everything, the MCP listings, or one of Composio's categories.
export type MarketFilter = { search: string; category: { kind: "all" } | { kind: "mcp" } | { kind: "app"; name: string } };
export const ALL_MARKET: MarketFilter = { search: "", category: { kind: "all" } };

export function marketFilterActive(filter: MarketFilter): boolean {
  return filter.search.trim() !== "" || filter.category.kind !== "all";
}

// What the catalog is asked; null when only MCP listings are shown (no request needed).
export function catalogQuery(filter: MarketFilter): { search: string; category: string | null } | null {
  if (filter.category.kind === "mcp") return null;
  return { search: filter.search.trim(), category: filter.category.kind === "app" ? filter.category.name : null };
}

function words(text: string): string[] {
  return text.toLowerCase().split(/\s+/).filter(Boolean);
}

export function listingMatches(listing: Pick<MarketplaceListing, "name" | "summary" | "publisher" | "slug">, search: string): boolean {
  const wanted = words(search);
  const text = `${listing.name} ${listing.slug} ${listing.summary} ${listing.publisher}`.toLowerCase();
  return wanted.every((word) => text.includes(word));
}

export type ListingAction = "install" | "show" | "update" | "none";
export type MarketListing = {
  section: MarketplaceSection;
  listing: MarketplaceListing;
  // The copy added under this section, when there is one.
  connection: MarketplaceConnection | null;
  // A copy added under the other section, when this one has none.
  elsewhere: MarketplaceConnection | null;
  action: ListingAction;
  // The copy here is pinned to an older manifest than the catalog's.
  updateAvailable: boolean;
  // The copy here is no longer in the catalog: shown so it can still be managed or removed.
  withdrawn: boolean;
};

// What a listing card shows on its right: a pill, or null for the Add button. A server already
// added under the other section is not offered as new: the card says where it is, or that the
// copy there is older than this listing.
export function listingBadge(item: Pick<MarketListing, "connection" | "elsewhere" | "action" | "updateAvailable" | "withdrawn">): { status: Status; key: string; section?: MarketplaceSection } | null {
  if (item.connection) {
    if (item.withdrawn) return { status: "idle", key: "apps.market.withdrawn" };
    if (item.updateAvailable) return { status: "waiting", key: "apps.market.updateAvailable" };
    return { status: "done", key: "apps.market.added" };
  }
  if (item.action === "update") return { status: "waiting", key: "apps.market.updateAvailable" };
  if (item.action === "show" && item.elsewhere) return { status: "idle", key: "apps.market.addedUnder", section: item.elsewhere.section };
  return null;
}

export function listingState(section: MarketplaceSection, listing: MarketplaceListing, connections: readonly MarketplaceConnection[]): Omit<MarketListing, "withdrawn"> {
  const connection = connections.find((item) => item.slug === listing.slug && item.section === section) ?? null;
  if (connection) return { section, listing, connection, elsewhere: null, action: "none", updateAvailable: connection.manifest_digest !== listing.manifest_digest };
  const elsewhere = connections.find((item) => item.slug === listing.slug) ?? null;
  const action: ListingAction = elsewhere ? (elsewhere.manifest_digest === listing.manifest_digest ? "show" : "update") : "install";
  return { section, listing, connection: null, elsewhere, action, updateAvailable: false };
}

// The MCP listings the filter keeps: Tested first, then Community, each followed by the copies
// added from it that the catalog no longer lists.
export function marketListings(catalog: MarketplaceCatalog | null, connections: readonly MarketplaceConnection[], filter: MarketFilter): MarketListing[] {
  if (!catalog || filter.category.kind === "app") return [];
  const listed = new Set([...catalog.tested, ...catalog.community].map((listing) => listing.slug));
  const out: MarketListing[] = [];
  for (const section of ["tested", "community"] as const) {
    for (const listing of catalog[section]) out.push({ ...listingState(section, listing, connections), withdrawn: false });
    for (const connection of connections) {
      if (connection.section !== section || listed.has(connection.slug)) continue;
      out.push({ section, listing: connection.manifest, connection, elsewhere: null, action: "none", updateAvailable: false, withdrawn: true });
    }
  }
  return out.filter((item) => listingMatches(item.listing, filter.search));
}

export function sectionKey(section: MarketplaceSection): string {
  return section === "tested" ? "apps.market.tested" : "apps.market.community";
}

/* ------------------------------------------------------------------ the old /marketplace/ address */

// /marketplace/ is now part of /apps/. The query and a plain #anchor travel along; anything else is dropped.
export function marketplaceRedirectHref(search: string, hash: string): string {
  const params = new URLSearchParams(search);
  const kept = new URLSearchParams();
  if (params.get(ADD_SERVER_PARAM) === ADD_SERVER_VALUE) kept.set(ADD_SERVER_PARAM, ADD_SERVER_VALUE);
  const query = kept.toString();
  const anchor = /^#[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(hash) ? hash : "";
  return `${APPS_HREF}${query ? `?${query}` : ""}${anchor}`;
}
