"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, type NotificationPreferences } from "@/lib/api";
import { dispatchNotification, getNewUnreadNotifications } from "@/lib/desktop-notifications";

const POLL_MS = 15_000;

// The desktop (operating system) alerts for new notifications, which the chat header's bell used
// to send. The bell is gone (the feed and its unread count are in the sidebar's workspace menu,
// components/shell/WorkspaceMenu.tsx); this keeps the alerts: every 15 s it reads the feed and
// alerts for each new unread entry, when desktop alerts are on. The first read only sets the
// baseline, so nothing old pops up. A click on an alert opens its conversation, here or from the
// desktop app's bridge.
export function useNotificationAlerts(enabled: boolean) {
  const router = useRouter();
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const seen = useRef<Set<number> | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    api.getNotificationPreferences().then((prefs) => { if (alive) setPreferences(prefs); }).catch(() => {});
    return () => { alive = false; };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    const bridge = (window as unknown as { suparagent?: { onNotificationClicked?: (cb: (data: { thread_id?: number }) => void) => () => void } }).suparagent;
    if (!bridge?.onNotificationClicked) return;
    return bridge.onNotificationClicked((data) => {
      if (data?.thread_id != null) router.push(`/chat?thread=${data.thread_id}`);
    });
  }, [enabled, router]);

  const check = useCallback(() => {
    // Compare ids so a read entry replaced by a new one cannot hide the alert.
    api.listNotifications(200).then((latest) => {
      const before = seen.current;
      seen.current = new Set(latest.map((item) => item.id));
      if (!before || !preferences?.desktop_enabled) return;
      for (const item of getNewUnreadNotifications(latest, before)) {
        dispatchNotification(item, preferences, (threadId) => router.push(`/chat?thread=${threadId}`));
      }
    }).catch(() => {
      // An older backend without the feed, or the network: try again on the next tick.
    });
  }, [preferences, router]);

  useEffect(() => {
    if (!enabled) return;
    check();
    const timer = window.setInterval(check, POLL_MS);
    return () => window.clearInterval(timer);
  }, [enabled, check]);
}
