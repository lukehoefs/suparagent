"use client";

// The page's one picture store (lib/agent-pictures.ts) on the real API, and the hooks the avatars
// read it with. Change a picture, then call refreshAgentPicture (set) or forgetAgentPicture
// (removed): every avatar of that agent updates.
import { useEffect, useSyncExternalStore } from "react";
import { api, ApiError } from "@/lib/api";
import { createPictureStore, type PictureState } from "@/lib/agent-pictures";

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
