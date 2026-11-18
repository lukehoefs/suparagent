"use client";

import { useCallback, useSyncExternalStore } from "react";
import { computerPanelOpen, COMPUTER_PANEL_PREFIX, saveComputerPanel } from "@/lib/chat-page";

// Whether the live computer panel beside the chat is open for an agent, remembered on this device
// (lib/chat-page.ts). A browser that blocks storage keeps the choice for this page only.
const listeners = new Set<() => void>();
const memory = new Map<number, boolean>();

function subscribe(notify: () => void) {
  listeners.add(notify);
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key.startsWith(COMPUTER_PANEL_PREFIX)) notify();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(notify);
    window.removeEventListener("storage", onStorage);
  };
}

export function useComputerPanel(agentId: number | null): [boolean, (open: boolean) => void] {
  const open = useSyncExternalStore(
    subscribe,
    () => (agentId === null ? false : memory.get(agentId) ?? computerPanelOpen(() => window.localStorage, agentId)),
    () => false,
  );
  const setOpen = useCallback((next: boolean) => {
    if (agentId === null) return;
    if (saveComputerPanel(() => window.localStorage, agentId, next)) memory.delete(agentId);
    else memory.set(agentId, next);
    for (const notify of listeners) notify();
  }, [agentId]);
  return [open, setOpen];
}
