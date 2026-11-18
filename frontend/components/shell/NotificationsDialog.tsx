"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type AppNotification } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatWhen } from "@/lib/routines";
import { useT } from "@/lib/use-i18n";
import { EmptyPanel, LoadingState } from "@/components/chat/PanelState";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";

const POLL_MS = 60_000;

/**
 * The unread notification count for the sidebar's workspace menu: the same feed the chat header's
 * bell reads (/notifications). Read now, every minute while the tab shows, and on `refresh`.
 * null while unknown, and for a backend without the feed. Desktop alerts stay with the bell.
 */
export function useUnreadNotifications(enabled: boolean): { unread: number | null; refresh: () => void } {
  const [unread, setUnread] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const read = () => {
      if (document.hidden) return;
      api.unreadNotifications().then((r) => { if (alive) setUnread(r.unread); }).catch(() => { if (alive) setUnread(null); });
    };
    read();
    const timer = window.setInterval(read, POLL_MS);
    document.addEventListener("visibilitychange", read);
    return () => { alive = false; window.clearInterval(timer); document.removeEventListener("visibilitychange", read); };
  }, [enabled, tick]);

  return { unread: enabled ? unread : null, refresh };
}

// The notification feed, opened from the workspace menu. A click on an entry marks it read and
// opens its conversation when it has one.
export function NotificationsDialog({
  open,
  onOpenChange,
  onChanged,
  navigate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // The unread count changed (an entry or all of them were read).
  onChanged: () => void;
  navigate: (href: string) => void;
}) {
  const t = useT();
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={t("notifications.title")} size="sm">
      {/* Mounted with the dialog, so each opening reads the feed afresh. */}
      <NotificationFeed
        onChanged={onChanged}
        onChoose={(threadId) => {
          onOpenChange(false);
          if (threadId !== null) navigate(`/chat?thread=${threadId}`);
        }}
      />
    </Dialog>
  );
}

function NotificationFeed({ onChanged, onChoose }: { onChanged: () => void; onChoose: (threadId: number | null) => void }) {
  const t = useT();
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    api.listNotifications().then((list) => { if (alive) setItems(list); }).catch(() => { if (alive) { setItems([]); setFailed(true); } });
    return () => { alive = false; };
  }, []);

  const choose = async (item: AppNotification) => {
    if (!item.read_at) await api.readNotification(item.id).catch(() => undefined);
    onChanged();
    onChoose(item.thread_id);
  };

  const readAll = async () => {
    await api.readAllNotifications().catch(() => undefined);
    setItems((current) => current?.map((item) => ({ ...item, read_at: item.read_at ?? new Date().toISOString() })) ?? null);
    onChanged();
  };

  if (items === null) return <LoadingState rows={3} />;
  if (failed) return <p role="alert" className="text-label text-danger">{t("sidebarMenu.notificationsFailed")}</p>;
  if (items.length === 0) return <EmptyPanel title={t("notifications.empty")} />;
  return (
    <div className="flex flex-col gap-2">
      {items.some((item) => !item.read_at) && (
        <div className="flex justify-end">
          <Button size="sm" variant="ghost" onClick={() => void readAll()}>{t("notifications.markAll")}</Button>
        </div>
      )}
      <ul className="-mx-2 flex flex-col gap-0.5">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => void choose(item)}
              className="flex w-full cursor-pointer items-start gap-2.5 rounded-field px-2 py-2 text-left hover:bg-hover touch:py-3"
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className={cn("text-label", item.read_at ? "font-medium" : "font-semibold")}>{item.title}</span>
                {item.body && <span className="line-clamp-2 text-small text-muted">{item.body}</span>}
                <span className="text-small text-muted">{formatWhen(item.created_at)}</span>
              </span>
              {!item.read_at && <span role="img" aria-label={t("status.unread")} className="mt-1.5 size-2 shrink-0 rounded-full bg-accent" />}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
