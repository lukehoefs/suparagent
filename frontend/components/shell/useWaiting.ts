"use client";

import { useMemo, useSyncExternalStore } from "react";
import { waitingItems, type BriefRow, type RunningTurn, type WaitingItem } from "@/lib/today";
import { todayApi } from "@/lib/today-api";
import { refreshRunningTurns, useRunningTurns } from "./useRunningTurns";

// What waits for the person, counted once for the whole page. With the answers running now
// (useRunningTurns.ts), the Today brief (GET /today/brief, owner and admin only) gives the list the
// Today page shows under "Waiting for you" (lib/today.ts waitingItems: engines, tool calls,
// questions, routines to fix, repeated failures; not tasks due, which are Today's own card). The
// sidebar's band, the phone bar's pill and the command palette's Waiting group all read it here,
// so they say the same number as Today's badge. Read every minute, not while the tab is hidden;
// once it shows again, at once.
const EVERY_MS = 60_000;
// A read asked for this soon after the last one began (refreshWaiting) is not made.
const SOON_MS = 5_000;

let snapshot: BriefRow[] | null = null;
let timer: number | null = null;
// Only the newest read may land.
let generation = 0;
let lastRead = 0;
const listeners = new Set<() => void>();

function publish(value: BriefRow[] | null) {
  snapshot = value;
  for (const listener of listeners) listener();
}

function read() {
  if (document.hidden) return;
  lastRead = Date.now();
  const mine = ++generation;
  todayApi.brief()
    .then((brief) => { if (mine === generation) publish(brief.items); })
    // Unknown is said as unknown: nothing is counted from an old answer.
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

/** Reads the brief and the running answers again now, while anything on the page counts them,
 * unless a read began moments ago. The sidebar asks when the conversation list moves. */
export function refreshWaiting(): void {
  refreshRunningTurns();
  if (listeners.size === 0 || Date.now() - lastRead < SOON_MS) return;
  read();
}

/** A brief read elsewhere (the Today page reads its own, with a Refresh): the shell shows it at
 * once, so its counts match the page's, and a read of ours still in flight is dropped as older. */
export function shareTodayBrief(items: BriefRow[]): void {
  generation += 1;
  lastRead = Date.now();
  publish(items);
}

/** The Today brief's rows, or null while unknown, failed or not `enabled` (not owner or admin). */
export function useTodayBrief(enabled: boolean): BriefRow[] | null {
  return useSyncExternalStore(
    enabled ? subscribe : noSubscription,
    () => (enabled ? snapshot : null),
    () => null,
  );
}

export type Waiting = {
  // What Today lists under "Waiting for you", most blocking first; its length is the count shown
  // everywhere. null while neither the brief nor the running answers are known.
  items: WaitingItem[] | null;
  // The rows it was made from: the brief, else the host's needs-you rows (`fallback`), so a
  // conversation's own waiting line (lib/sidebar.ts waitingByThread) agrees with the count.
  rows: readonly BriefRow[] | null;
  running: RunningTurn[] | null;
};

/**
 * What waits for the person (owner and admin: `enabled`). `fallback` is the host's own needs-you
 * rows, counted by the same rule only while the brief cannot be read; the brief wins once it is in.
 */
export function useWaiting(enabled: boolean, fallback: readonly BriefRow[] | null = null): Waiting {
  const running = useRunningTurns(enabled);
  const brief = useTodayBrief(enabled);
  const rows = enabled ? brief ?? fallback : null;
  const items = useMemo(() => (running === null && rows === null ? null : waitingItems(running, rows)), [running, rows]);
  return { items, rows, running };
}
