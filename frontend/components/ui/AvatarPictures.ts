"use client";

// The page's one picture store (lib/agent-pictures.ts) on the real API, and the hooks the avatars
// read it with. Change a picture, then call refreshAgentPicture (set) or forgetAgentPicture
// (removed, or the agent deleted): every avatar of that agent updates. The frames that know the
// session and load the agent list (AppShell, ChatApp) call setPicturesEnabled and prunePictures;
// until told, nothing is read.
import { useEffect, useSyncExternalStore } from "react";
import { api, ApiError } from "@/lib/api";
import { createPictureStore, type PictureState, type PrunedAgent } from "@/lib/agent-pictures";

const pictures = createPictureStore({
  load: (agentId) => api.agentAvatarUrl(agentId),
  classify: (error) => {
    if (error instanceof ApiError && error.status === 404) return "none";
    if (error instanceof ApiError && error.status === 403) return "blocked";
    return "retry";
  },
  revoke: (url) => URL.revokeObjectURL(url),
});

// The picture's object URL, or null while there is none (show initials).
export function useAgentPicture(agentId: number | null): string | null {
  const url = useSyncExternalStore(
    pictures.subscribe,
    () => (agentId === null ? null : pictures.url(agentId)),
    () => null,
  );
  useEffect(() => {
    if (agentId !== null) pictures.ensure(agentId);
  }, [agentId]);
  return url;
}

// Whether the agent has a picture: "unknown" or "loading" until the answer is in.
export function useAgentPictureState(agentId: number): PictureState {
  const state = useSyncExternalStore(pictures.subscribe, () => pictures.state(agentId), (): PictureState => "unknown");
  useEffect(() => {
    pictures.ensure(agentId);
  }, [agentId]);
  return state;
}

export function refreshAgentPicture(agentId: number): void {
  pictures.refresh(agentId);
}

export function forgetAgentPicture(agentId: number): void {
  pictures.clear(agentId);
}

// Whether this session may read pictures: GET /agents/{id}/avatar is admin-only, so a member's
// page never asks.
export function setPicturesEnabled(on: boolean): void {
  pictures.setEnabled(on);
}

// After a fresh list of every agent (archived included): forget the pictures of agents not in it,
// and of an id that now belongs to a newly created agent.
export function prunePictures(agents: Iterable<PrunedAgent>): void {
  pictures.prune(agents);
}
