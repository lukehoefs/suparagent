// Agent cloud computers: a desktop behind its own gateway, linked through a custom MCP connection
// (backend/app/routers/remote_computers.py). Types and calls only: no React, no words shown to people.
import { API_BASE, request } from "./api.ts";

// disabled: its connection is switched off. needs_key: its bearer key is not saved.
// online: the gateway's /healthz answered 200 (checked at most every ~30 s). offline: anything else.
export type RemoteComputerState = "online" | "offline" | "needs_key" | "disabled";

// Why the last status check failed; null when it answered 200.
export type RemoteComputerCheckError = "timeout" | "unreachable" | "unsafe_address" | "bad_status";

export type RemoteComputer = {
  id: number;
  name: string;
  mcp_connection_id: string;
  connection_name: string;
  agent_id: number | null;
  agent_name: string | null;
  // Scheme and host of the connection's endpoint, e.g. https://gateway.example.com. Never sent by the page.
  base_url: string;
  state: RemoteComputerState;
  // True while a person drives the desktop: every agent call to its tools is refused until hand-back.
  human_control: boolean;
  control_started_at: string | null;
  // The live picture and the viewer can open (online and the key is saved).
  live_view: boolean;
  last_checked_at: string | null;
  last_error: RemoteComputerCheckError | null;
};

// The backend calls it RemoteComputerOut.
export type RemoteComputerOut = RemoteComputer;

// What an agent's JSON (GET /agents, /agents/{id}) carries as `remote_computer`.
export type RemoteComputerBrief = Pick<RemoteComputer, "id" | "name" | "state" | "human_control">;

export type RemoteComputerCreate = { name: string; mcp_connection_id: string; agent_id?: number | null };

// Only the fields present change; agent_id: null unlinks the agent.
export type RemoteComputerUpdate = { name?: string; agent_id?: number | null };

export type ViewerMode = "view" | "control";

// `path` is the WebSocket to open from the API's origin, ticket included; see remoteViewerSocketUrl.
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

export function updateRemoteComputer(id: number, body: RemoteComputerUpdate): Promise<RemoteComputer> {
  return request<RemoteComputer>(`${BASE}/${id}`, { method: "PATCH", body: JSON.stringify(body) });
}

// Removes the link only: the custom MCP connection and its key stay.
export function deleteRemoteComputer(id: number): Promise<void> {
  return request<void>(`${BASE}/${id}`, { method: "DELETE" });
}

// Asks the gateway now instead of using the cached status.
export function checkRemoteComputer(id: number): Promise<RemoteComputer> {
  return request<RemoteComputer>(`${BASE}/${id}/check`, { method: "POST" });
}

// For an <img src>: PNG (JPEG if the gateway sends one), at most ~2 s old. Change `bust` to get a new
// picture past the browser cache. The request carries the session cookie like any other API call.
export function remoteComputerScreenshotUrl(id: number, bust: string | number): string {
  return `${API_BASE}${BASE}/${id}/screenshot?t=${encodeURIComponent(String(bust))}`;
}

export function takeControl(id: number): Promise<RemoteComputer> {
  return request<RemoteComputer>(`${BASE}/${id}/take-control`, { method: "POST" });
}

export function handBack(id: number): Promise<RemoteComputer> {
  return request<RemoteComputer>(`${BASE}/${id}/hand-back`, { method: "POST" });
}

// Single use, valid 30 s. "control" needs takeControl first (409 control_not_taken).
export function viewerTicket(id: number, mode: ViewerMode): Promise<ViewerTicket> {
  return request<ViewerTicket>(`${BASE}/${id}/viewer-ticket`, { method: "POST", body: JSON.stringify({ mode }) });
}

// The ws:// or wss:// address for a ticket's path, on the API's origin. Open it with the "binary"
// subprotocol (noVNC's RFB over WebSocket). Close codes: 4403 bad or used ticket, 4409 no longer
// allowed, 4410 handed back or unlinked, 4429 too many viewers, 4502 the desktop stream did not open,
// 1008 refused.
export function remoteViewerSocketUrl(path: string, pageUrl: string): string {
  const url = new URL(path, new URL(API_BASE, pageUrl));
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}
