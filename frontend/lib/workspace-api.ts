// The one workspace call the settings pages make that lib/api.ts and lib/collaboration.ts do not
// carry: renaming the workspace, which is the team's name (PATCH /team, owner and admin only).
import { request } from "./api";
import type { TeamState } from "./collaboration";

export const workspaceApi = {
  rename: (name: string) => request<TeamState>("/team", { method: "PATCH", body: JSON.stringify({ name }) }),
};
