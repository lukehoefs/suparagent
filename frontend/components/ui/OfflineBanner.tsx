"use client";

import { useSyncExternalStore } from "react";
import { isOnline, subscribeOnline } from "@/lib/connectivity";
import { useT } from "@/lib/use-i18n";
import { Banner } from "./Banner";

// True while the browser has a network. The server render and the first paint assume online.
export function useOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, () => isOnline(), () => true);
}

// The amber "you are offline" note (design: States, "Anywhere: offline"). Renders nothing while
// online, so it can sit permanently above a page's content.
export function OfflineBanner({ className }: { className?: string }) {
  const t = useT();
  const online = useOnline();
  if (online) return null;
  return <Banner tone="warning" className={className}>{t("states.offline")}</Banner>;
}
