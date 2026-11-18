"use client";

import { useSyncExternalStore } from "react";
import type { RunningTurn } from "@/lib/today";
import { todayApi } from "@/lib/today-api";

// The answers running now (GET /today/running, owner and admin only), read once for everything on
// the page that shows them: the sidebar's working dots and waiting lines, the command palette, the
// phone bar's waiting pill (with the Today brief, components/shell/useWaiting.ts). Not while the
// tab is hidden; once it shows again, read at once.
const EVERY_MS = 30_000;
// A read asked for this soon after the last one began (refreshRunningTurns) is not made.
const SOON_MS = 5_000;

let snapshot: RunningTurn[] | null = null;
let timer: number | null = null;
// Only the newest read may land.
let generation = 0;
let lastRead = 0;
const listeners = new Set<() => void>();

function publish(value: RunningTurn[] | null) {
  snapshot = value;
  for (const listener of listeners) listener();
}

function read() {
  if (document.hidden) return;
  lastRead = Date.now();
  const mine = ++generation;
  todayApi.running()
    .then((list) => { if (mine === generation) publish(list); })
    // Unknown is said as unknown: no agent is shown working from an old answer.
    .catch(() => { if (mine === generation) publish(null); });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    read();
    timer = window.setInterval(read, EVERY_MS);
    document.addEventListener("visibilitychange", read);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size > 0) return;
    if (timer !== null) window.clearInterval(timer);
    timer = null;
    generation += 1;
    document.removeEventListener("visibilitychange", read);
  };
}

const noSubscription = () => () => {};

/** Reads again now, while anything on the page shows the answers, unless a read began moments ago
 * (the conversation list moved, so what runs and what waits may have too). */
export function refreshRunningTurns(): void {
  if (listeners.size === 0 || Date.now() - lastRead < SOON_MS) return;
  read();
}

/** A read made elsewhere (the Today page polls the same endpoint): the shell shows it at once, so
 * its counts match the page's, and a read of ours still in flight is dropped as the older one. */
export function shareRunningTurns(list: RunningTurn[]): void {
  generation += 1;
  lastRead = Date.now();
  publish(list);
}

/** The answers running now, or null while unknown, failed or not `enabled` (not owner or admin). */
export function useRunningTurns(enabled: boolean): RunningTurn[] | null {
  return useSyncExternalStore(
    enabled ? subscribe : noSubscription,
    () => (enabled ? snapshot : null),
    () => null,
  );
}
