"use client";

import { useSyncExternalStore } from "react";

// Layout thresholds. Below SIDEBAR_INLINE the sidebar is a drawer; the inspector overlays the
// chat below SIDEBAR_AND_PANEL_FIT because the sidebar, a chat column and a panel no longer fit.
export const SIDEBAR_INLINE = "(min-width: 768px)";
export const SIDEBAR_AND_PANEL_FIT = "(min-width: 1280px)";
// The live computer panel sits beside the chat from here (design: Chat.html hides it below 1100 px);
// a narrower window opens it as a sheet over the chat.
export const LIVE_PANEL_INLINE = "(min-width: 1100px)";

// Follows a CSS media query. `fallback` is what the static page assumes before the browser
// can answer (the server render and first hydration pass).
export function useMediaQuery(query: string, fallback = true): boolean {
  return useSyncExternalStore(
    (notify) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", notify);
      return () => list.removeEventListener("change", notify);
    },
    () => window.matchMedia(query).matches,
    () => fallback,
  );
}
