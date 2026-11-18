"use client";

import { useEffect, useSyncExternalStore } from "react";
import { request } from "@/lib/api";
import { applyTheme, getUiConfig, setUiConfig, subscribeUiConfig, type UiConfigResponse } from "@/lib/ui-config";

let loading: Promise<void> | null = null;

/** Fetches the app's look again (after a page load, an undo, or a finished agent turn). */
export function refreshUiConfig(): Promise<void> {
  loading = request<UiConfigResponse>("/ui-config")
    .then(setUiConfig)
    .catch(() => undefined)
    .finally(() => {
      loading = null;
    });
  return loading;
}

/** The app's look, applied to the page: the cached copy at once, the server's on mount and when the
 *  tab comes back into view (an agent may have changed it meanwhile). */
export function useUiConfig(): UiConfigResponse | null {
  const value = useSyncExternalStore(subscribeUiConfig, getUiConfig, () => null);
  useEffect(() => {
    applyTheme(getUiConfig()?.config);
    if (!loading) void refreshUiConfig();
    const onVisible = () => {
      if (document.visibilityState === "visible" && !loading) void refreshUiConfig();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);
  return value;
}
