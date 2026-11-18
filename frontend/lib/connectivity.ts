// Whether the browser says it has a network, for the offline notice (design: States, "Anywhere:
// offline"). Shaped for React's useSyncExternalStore: subscribe(callback) and a snapshot.

type ConnectivityTarget = Pick<EventTarget, "addEventListener" | "removeEventListener">;

// Calls `callback` whenever the browser goes online or offline; returns the unsubscribe.
export function subscribeOnline(
  callback: () => void,
  target: ConnectivityTarget | undefined = typeof window === "undefined" ? undefined : window,
): () => void {
  if (!target) return () => {};
  target.addEventListener("online", callback);
  target.addEventListener("offline", callback);
  return () => {
    target.removeEventListener("online", callback);
    target.removeEventListener("offline", callback);
  };
}

// Unknown counts as online: only a browser that says it is offline shows the notice, so a server
// render or a browser without the flag never claims the network is down.
export function isOnline(nav: { onLine?: boolean } | undefined = typeof navigator === "undefined" ? undefined : navigator): boolean {
  return nav?.onLine !== false;
}
