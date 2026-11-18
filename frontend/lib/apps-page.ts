// The Apps page (design: Apps.html): connected apps (Composio), custom MCP servers with the
// three-step add flow, and the marketplace (MCP listings and Composio's catalog). The plain logic
// lives here, apart from the components, so node tests can load it. It returns message keys
// (lib/locales/apps-extra.ts); the components translate them. No runtime imports except plain
// lib files.
import { accountOnlyCard, cardState, type CatalogApp, type CatalogPage } from "./apps-catalog.ts";
import { isComposioLink, type ComposioAccount, type LinkBridge, type Opener } from "./connected-apps.ts";
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
  if (server.state === "unreachable") return { status: "denied", key: "apps.servers.status.unreachable" };
  // needs_sign_in: an OAuth server you have not signed in to waits for you; a rejected secret is an error.
  if (server.auth_mode === "oauth" && !server.oauth_signed_in) return { status: "waiting", key: "apps.servers.status.signIn" };
  return { status: "denied", key: "apps.servers.status.secret" };
}

// What the first button on a card does before a test can run.
export type ServerStart = "signIn" | "addSecret" | "test";
export function serverStart(server: Pick<CustomMcpConnection, "auth_mode" | "oauth_signed_in" | "credential_configured">): ServerStart {
  if (server.auth_mode === "oauth" && !server.oauth_signed_in) return "signIn";
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

// A short hint under the card when something needs doing, or null.
export function serverHintKey(server: ServerLike): string | null {
  if (server.state === "unreachable") return "apps.servers.unreachableHint";
  if (server.state !== "needs_sign_in") return null;
  return server.auth_mode === "oauth" && !server.oauth_signed_in ? "apps.servers.signInHint" : "apps.servers.secretRejected";
}

const AUTH_KEY: Record<CustomMcpAuthMode, string> = {
  none: "apps.servers.auth.none",
  bearer: "apps.servers.auth.bearer",
  header: "apps.servers.auth.header",
  oauth: "apps.servers.auth.oauth",
};

// How the server signs in, and whether its secret or sign-in is in place: keys to join with " · ".
export function authKeys(server: Pick<CustomMcpConnection, "auth_mode" | "credential_configured" | "oauth_signed_in">): string[] {
  const keys = [AUTH_KEY[server.auth_mode]];
  if (server.auth_mode === "oauth") keys.push(server.oauth_signed_in ? "apps.servers.signedIn" : "apps.servers.signedOut");
  else if (server.auth_mode !== "none") keys.push(server.credential_configured ? "apps.servers.secret.saved" : "apps.servers.secret.missing");
  return keys;
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

// The Connected apps cards: the apps with curated agent tools (Gmail, GitHub, Calendar) first, as
// the catalog lists them, then every other app that has an account here, by name. An account whose
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
  const others: CatalogApp[] = [];
  for (const account of accounts ?? []) {
    if (seen.has(account.toolkit)) continue;
    seen.add(account.toolkit);
    others.push(bySlug.get(account.toolkit) ?? accountOnlyCard(account.toolkit, label));
  }
  others.sort((a, b) => a.name.localeCompare(b.name));
  return [...out, ...others];
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
