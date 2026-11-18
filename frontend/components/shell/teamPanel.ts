"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";

// The team panel (members, lead, delegation) belongs to the page's host (AppShell, the chat page),
// which says here that it can open it. The sidebar's footer menu and the command palette ask for
// it through requestTeamPanel(), and offer it only while a host can.
const openers: (() => void)[] = [];
const listeners = new Set<() => void>();

function changed() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Opens the team panel of the newest host that offers one; does nothing when none does. */
export function requestTeamPanel(): void {
  openers[openers.length - 1]?.();
}

/** True while a host on the page can open the team panel. */
export function useTeamPanelAvailable(): boolean {
  return useSyncExternalStore(subscribe, () => openers.length > 0, () => false);
}

/** A host offers its team panel while `enabled` (the team is known): `open` shows it. */
export function useTeamPanelHost(enabled: boolean, open: () => void): void {
  const latest = useRef(open);
  useEffect(() => {
    latest.current = open;
  });
  useEffect(() => {
    if (!enabled) return;
    const opener = () => latest.current();
    openers.push(opener);
    changed();
    return () => {
      const at = openers.indexOf(opener);
      if (at >= 0) openers.splice(at, 1);
      changed();
    };
  }, [enabled]);
}
