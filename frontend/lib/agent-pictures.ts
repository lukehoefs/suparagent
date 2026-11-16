// Agents' pictures (GET /agents/{id}/avatar), read once and shared by every avatar on the page.
// There is no "has a picture" field on an agent: like the old editor, the page asks for the
// picture and a 404 means none. The answers are kept (an object URL per agent) until a picture
// is changed here. GET /avatar is an admin-only route: the first 403 stops every later request,
// so a member's page asks once and then shows initials. No runtime imports, so node tests can
// load it; components/ui/AvatarPictures.ts wires it to the API.

// What a failed request means: "none" (404, no picture), "blocked" (403, this session may not
// read pictures) or "retry" (anything else: try again on a later mount).
export type PictureFailure = "none" | "blocked" | "retry";
export type PictureState = "unknown" | "loading" | "ready" | "none";

type Entry =
  | { state: "loading"; url: string | null }
  | { state: "ready"; url: string }
  | { state: "none" }
  | { state: "failed"; at: number };

export type PictureStoreOptions = {
  // Resolves to an object URL for the agent's picture.
  load: (agentId: number) => Promise<string>;
  classify: (error: unknown) => PictureFailure;
  revoke: (url: string) => void;
  now?: () => number;
  retryMs?: number;
};

export function createPictureStore({ load, classify, revoke, now = Date.now, retryMs = 60_000 }: PictureStoreOptions) {
  const entries = new Map<number, Entry>();
  // Bumped by every request, so an answer that arrives after a newer request is dropped.
  const requests = new Map<number, number>();
  const listeners = new Set<() => void>();
  let blocked = false;

  const emit = () => {
    for (const listener of listeners) listener();
  };

  const set = (agentId: number, entry: Entry) => {
    const old = entries.get(agentId);
    const oldUrl = old?.state === "ready" || old?.state === "loading" ? old.url : null;
    const newUrl = entry.state === "ready" || entry.state === "loading" ? entry.url : null;
    if (oldUrl && oldUrl !== newUrl) revoke(oldUrl);
    entries.set(agentId, entry);
    emit();
  };

  const fetchPicture = (agentId: number) => {
    const request = (requests.get(agentId) ?? 0) + 1;
    requests.set(agentId, request);
    const old = entries.get(agentId);
    // While a picture is read again, the one already shown stays.
    set(agentId, { state: "loading", url: old?.state === "ready" ? old.url : null });
    load(agentId).then(
      (url) => {
        if (requests.get(agentId) !== request) {
          revoke(url);
          return;
        }
        set(agentId, { state: "ready", url });
      },
      (error: unknown) => {
        if (requests.get(agentId) !== request) return;
        const failure = classify(error);
        if (failure === "blocked") blocked = true;
        set(agentId, failure === "retry" ? { state: "failed", at: now() } : { state: "none" });
      },
    );
  };

  return {
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    // The object URL to show, or null for initials.
    url(agentId: number): string | null {
      const entry = entries.get(agentId);
      return entry?.state === "ready" || entry?.state === "loading" ? entry.url : null;
    },
    state(agentId: number): PictureState {
      const entry = entries.get(agentId);
      if (!entry || entry.state === "failed") return blocked ? "none" : "unknown";
      return entry.state;
    },
    // Read the picture unless it is known, being read, or this session may not read pictures.
    ensure(agentId: number): void {
      if (blocked) return;
      const entry = entries.get(agentId);
      if (entry && (entry.state !== "failed" || now() - entry.at < retryMs)) return;
      fetchPicture(agentId);
    },
    // After the picture was set here: read it again.
    refresh(agentId: number): void {
      if (blocked) return;
      fetchPicture(agentId);
    },
    // After the picture was removed here: initials at once, and any answer still on its way is dropped.
    clear(agentId: number): void {
      requests.set(agentId, (requests.get(agentId) ?? 0) + 1);
      set(agentId, { state: "none" });
    },
    isBlocked(): boolean {
      return blocked;
    },
  };
}

export type PictureStore = ReturnType<typeof createPictureStore>;

// An uploaded picture is cut to the largest centred square and shrunk to at most this many pixels a side.
export const PICTURE_SIDE = 512;

export function squareCrop(width: number, height: number): { sx: number; sy: number; size: number; side: number } {
  const size = Math.max(0, Math.min(Math.floor(width), Math.floor(height)));
  return {
    sx: Math.floor((Math.floor(width) - size) / 2),
    sy: Math.floor((Math.floor(height) - size) / 2),
    size,
    side: Math.min(PICTURE_SIDE, size),
  };
}
