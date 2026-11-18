// Agent cloud computers: a desktop behind a gateway (computers/bytebot-gateway), added to
// lukethomas as a custom MCP connection and linked to at most one agent. The backend derives the
// gateway address from the connection's endpoint and keeps its key; the page never sees either.
// Calls are admin-only on the backend. Pure helpers below the calls; node tests load this file.
import { API_BASE, errorFrom, request } from "./api.ts";
import type { CustomMcpConnection } from "./custom-mcp";

// online: the gateway answered /healthz; offline: it did not; needs_key: the connection has no
// saved bearer key; disabled: the connection is turned off.
export type RemoteComputerState = "online" | "offline" | "needs_key" | "disabled";

// Why the last status check failed (backend services/remote_computers.py); null when it answered 200.
export type RemoteComputerCheckError = "timeout" | "unreachable" | "unsafe_address" | "bad_status";

export type RemoteComputer = {
  id: number;
  name: string;
  mcp_connection_id: string;
  connection_name: string;
  agent_id: number | null;
  agent_name: string | null;
  base_url: string;
  state: RemoteComputerState;
  // True while a person has control: the agent's calls to this computer's tools are refused.
  human_control: boolean;
  control_started_at: string | null;
  // The live view can be opened (online, and the key is saved).
  live_view: boolean;
  last_checked_at: string | null;
  last_error: RemoteComputerCheckError | null;
};

// The backend calls it RemoteComputerOut (schemas/remote_computer.py).
export type RemoteComputerOut = RemoteComputer;

// What GET /agents and /agents/{id} carry for the agent's linked computer.
export type RemoteComputerSummary = Pick<RemoteComputer, "id" | "name" | "state" | "human_control">;

export type RemoteComputerCreate = { name: string; mcp_connection_id: string; agent_id?: number | null };
// agent_id null unlinks; a field left out is unchanged.
export type RemoteComputerUpdate = { name?: string; agent_id?: number | null };

// view: input from the page is dropped by the backend; control: needs human_control first.
export type ViewerMode = "view" | "control";
export type ViewerTicket = { ticket: string; path: string };

// error_code values the routes answer with (ApiError.code).
export type RemoteComputerErrorCode =
  | "remote_computer_not_found" // 404
  | "connection_not_found" // 404
  | "agent_not_found" // 404
  | "connection_already_linked" // 409
  | "agent_already_linked" // 409
  | "computer_offline" // 409 screenshot / viewer ticket
  | "computer_needs_key" // 409
  | "computer_disabled" // 409
  | "control_not_taken" // 409 control ticket before take-control
  | "bearer_required" // 422 the connection does not use a bearer key
  | "unsafe_endpoint" // 422
  | "invalid_name" // 422
  | "too_many_viewers" // 429
  | "key_rejected" // 502 the gateway refused the saved key
  | "screenshot_failed" // 502 (504 on timeout)
  | "screenshot_not_offered"; // 502 the gateway lists no screenshot tool

const BASE = "/remote-computers";

export function listRemoteComputers(): Promise<RemoteComputer[]> {
  return request<RemoteComputer[]>(BASE);
}

export function createRemoteComputer(body: RemoteComputerCreate): Promise<RemoteComputer> {
  return request<RemoteComputer>(BASE, { method: "POST", body: JSON.stringify(body) });
}

export function updateRemoteComputer(id: number, change: RemoteComputerUpdate): Promise<RemoteComputer> {
  return request<RemoteComputer>(`${BASE}/${id}`, { method: "PATCH", body: JSON.stringify(change) });
}

// Removes the link only: the custom MCP connection stays.
export function deleteRemoteComputer(id: number): Promise<void> {
  return request<void>(`${BASE}/${id}`, { method: "DELETE" });
}

// A fresh status check instead of the cached one.
export function checkRemoteComputer(id: number): Promise<RemoteComputer> {
  return request<RemoteComputer>(`${BASE}/${id}/check`, { method: "POST" });
}

// The screen as a PNG. `bust` makes each read a new address. The bytes sit behind the session,
// so read them with fetchRemoteComputerScreenshot (an <img> cannot send what some setups need).
export function remoteComputerScreenshotUrl(id: number, bust: number | string): string {
  return `${API_BASE}${BASE}/${id}/screenshot?t=${encodeURIComponent(String(bust))}`;
}

// 409 with an error_code while the computer is offline or has no key.
export async function fetchRemoteComputerScreenshot(id: number, bust: number | string, signal?: AbortSignal): Promise<Blob> {
  const res = await fetch(remoteComputerScreenshotUrl(id, bust), { credentials: "include", signal });
  if (!res.ok) throw await errorFrom(res);
  return res.blob();
}

export function takeControl(id: number): Promise<RemoteComputer> {
  return request<RemoteComputer>(`${BASE}/${id}/take-control`, { method: "POST" });
}

export function handBack(id: number): Promise<RemoteComputer> {
  return request<RemoteComputer>(`${BASE}/${id}/hand-back`, { method: "POST" });
}

// Single-use and short-lived: ask for a new one for every connection.
export function viewerTicket(id: number, mode: ViewerMode): Promise<ViewerTicket> {
  return request<ViewerTicket>(`${BASE}/${id}/viewer-ticket`, { method: "POST", body: JSON.stringify({ mode }) });
}

// The viewer WebSocket, built from API_BASE like the Docker desktop's (api.desktopViewerUrl).
export function remoteComputerViewerUrl(id: number, ticket: string, pageUrl: string): string {
  const url = new URL(`${API_BASE}${BASE}/${id}/viewer`, pageUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("ticket", ticket);
  return url.toString();
}

// --- Pure helpers ---

export const COMPUTERS_HREF = "/computers/";
// Where custom MCP servers are added and their keys saved (components/apps/CustomServers.tsx).
export const MCP_SERVERS_HREF = "/apps/#custom-mcp-heading";

// The status language (components/ui/StatusPill.tsx): online green, offline red, needs key amber, off grey.
export function remoteComputerStatus(state: RemoteComputerState): "done" | "denied" | "waiting" | "idle" {
  if (state === "online") return "done";
  if (state === "offline") return "denied";
  if (state === "needs_key") return "waiting";
  return "idle";
}

const STATE_KEY: Record<RemoteComputerState, string> = {
  online: "computers.state.online",
  offline: "computers.state.offline",
  needs_key: "computers.state.needsKey",
  disabled: "computers.state.disabled",
};

// The message key (lib/locales/computers-extra.ts) for the state's word.
export function remoteStateKey(state: RemoteComputerState): string {
  return STATE_KEY[state] ?? STATE_KEY.offline;
}

const PICTURE_KEY: Record<RemoteComputerState, string> = {
  online: "computers.picture.none",
  offline: "computers.picture.offline",
  needs_key: "computers.picture.needsKey",
  disabled: "computers.picture.disabled",
};

// What the placeholder says when there is no picture to show.
export function pictureKey(state: RemoteComputerState): string {
  return PICTURE_KEY[state] ?? PICTURE_KEY.offline;
}

const LAST_ERROR_KEY: Record<RemoteComputerCheckError, string> = {
  timeout: "computers.lastError.timeout",
  unreachable: "computers.lastError.unreachable",
  unsafe_address: "computers.lastError.unsafeAddress",
  bad_status: "computers.lastError.badStatus",
};

// The message key for why the last status check failed; null when it did not, or for a reason a
// newer backend added (the card then shows only the Offline pill rather than a raw code).
export function lastErrorKey(error: string | null | undefined): string | null {
  return error ? (LAST_ERROR_KEY as Record<string, string>)[error] ?? null : null;
}

// The live view follows the server: in control while human_control is set.
export function viewerMode(computer: Pick<RemoteComputer, "human_control">): ViewerMode {
  return computer.human_control ? "control" : "view";
}

// Viewer close codes (backend/app/routers/remote_computers.py). 4409: a control stream whose
// human_control is no longer set (the 5 s re-check). 4410: control handed back (control streams)
// or the computer unlinked (every stream).
export const VIEWER_CONTROL_ENDED = 4409;
export const VIEWER_HANDED_BACK_OR_UNLINKED = 4410;

// Whether a closed stream means "reload the computer and reconnect in the mode it now has" rather
// than a dropped connection worth retrying as it was.
export function viewerEnded(mode: ViewerMode, code: number): boolean {
  if (code === VIEWER_HANDED_BACK_OR_UNLINKED) return true;
  return mode === "control" && code === VIEWER_CONTROL_ENDED;
}

export function computerForAgent<T extends Pick<RemoteComputer, "agent_id">>(computers: readonly T[] | null | undefined, agentId: number): T | null {
  return computers?.find((computer) => computer.agent_id === agentId) ?? null;
}

// Computers no agent is linked to, by name.
export function freeComputers<T extends Pick<RemoteComputer, "agent_id" | "name">>(computers: readonly T[]): T[] {
  return computers.filter((computer) => computer.agent_id === null).sort((a, b) => a.name.localeCompare(b.name));
}

export function replaceComputer(computers: readonly RemoteComputer[], next: RemoteComputer): RemoteComputer[] {
  return computers.map((computer) => (computer.id === next.id ? next : computer));
}

export type AgentChoice = { id: number; name: string; taken: boolean };

// Agents a computer can be linked to: live ones, by name. `taken`: another computer has it.
export function agentChoices(
  agents: readonly { id: number; name: string; archived_at: string | null }[] | null | undefined,
  computers: readonly Pick<RemoteComputer, "id" | "agent_id">[],
  currentId: number | null = null,
): AgentChoice[] {
  const linked = new Set(computers.filter((computer) => computer.id !== currentId && computer.agent_id !== null).map((computer) => computer.agent_id));
  return (agents ?? [])
    .filter((agent) => agent.archived_at === null)
    .map((agent) => ({ id: agent.id, name: agent.name, taken: linked.has(agent.id) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

type Connection = Pick<CustomMcpConnection, "id" | "name" | "endpoint" | "auth_mode" | "enabled" | "state" | "credential_configured">;
export type ConnectionChoice<T extends Connection = Connection> = { connection: T; taken: boolean };

// Custom MCP connections, by name. `taken`: a computer already uses it (one computer per connection).
export function connectionChoices<T extends Connection>(connections: readonly T[], computers: readonly Pick<RemoteComputer, "mcp_connection_id">[]): ConnectionChoice<T>[] {
  const used = new Set(computers.map((computer) => computer.mcp_connection_id));
  return [...connections]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((connection) => ({ connection, taken: used.has(connection.id) }));
}

// The connection's state in the words of lib/custom-mcp.ts stateLabel, as message keys.
export function connectionStateKey(connection: Pick<Connection, "enabled" | "state">): string {
  if (connection.enabled && connection.state === "connected") return "computers.server.on";
  if (connection.state === "connected" || connection.state === "disabled") return "computers.server.off";
  if (connection.state === "unreachable") return "computers.server.unreachable";
  if (connection.state === "needs_sign_in") return "computers.server.needsSignIn";
  return "computers.server.notTested";
}

// A bearer connection without its key saved cannot reach the gateway.
export function connectionNeedsKey(connection: Pick<Connection, "auth_mode" | "credential_configured">): boolean {
  return connection.auth_mode === "bearer" && !connection.credential_configured;
}

export function connectionHost(endpoint: string): string {
  try {
    return new URL(endpoint).host || endpoint;
  } catch {
    return endpoint;
  }
}

// "atlas-computer-2026-11-17-0930.png", in local time.
export function screenshotFilename(name: string, at: Date): string {
  const slug = name.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "computer";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${slug}-${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}-${pad(at.getHours())}${pad(at.getMinutes())}.png`;
}

// 409: that connection or agent is already linked to a computer.
export function isLinkConflict(err: unknown): boolean {
  return (err as { status?: unknown } | null)?.status === 409;
}

// An older backend has no /remote-computers routes and answers 404.
export function remoteComputersUnsupported(err: unknown): boolean {
  return (err as { status?: unknown } | null)?.status === 404;
}
