"use client";

import Link from "next/link";
import { useId } from "react";
import { api, type AppNotification } from "@/lib/api";
import { activityHref } from "@/lib/today";
import { useT } from "@/lib/use-i18n";
import { Skeleton } from "@/components/ui/Skeleton";
import { Card } from "@/components/ui/Surface";
import type { TodayFormat } from "./useTodayFormat";

// The latest entries of the notification feed (the same feed as the workspace menu's
// Notifications). Opening one marks it read there too.
export function ActivityCard({
  items,
  loading,
  failed,
  now,
  format,
  onRead,
}: {
  items: AppNotification[] | null;
  loading: boolean;
  failed: boolean;
  now: Date;
  format: TodayFormat;
  onRead: () => void;
}) {
  const t = useT();
  const titleId = useId();
  const open = (item: AppNotification) => {
    if (!item.read_at) void api.readNotification(item.id).then(onRead, () => undefined);
  };
  let body;
  if (loading) {
    body = (
      <div role="status" className="flex flex-col gap-2">
        <span className="sr-only">{t("today.loading")}</span>
        <Skeleton className="h-8" />
        <Skeleton className="h-8" />
      </div>
    );
  } else if (failed && !items) {
    body = <p role="alert" className="text-label text-danger">{t("today.activity.loadFailed")}</p>;
  } else if (!items || items.length === 0) {
    body = <p className="text-label text-muted">{t("today.activity.empty")}</p>;
  } else {
    body = (
      <ul className="flex flex-col gap-3">
        {items.map((item) => {
          const href = activityHref(item);
          const text = <span className="line-clamp-2 break-words">{item.title}</span>;
          return (
            <li key={item.id} className="flex gap-2.5 text-label">
              <span aria-hidden="true" className="mt-[7px] size-1.5 shrink-0 rounded-full bg-line-strong" />
              <span className="min-w-0 flex-1">
                {href ? (
                  <Link href={href} onClick={() => open(item)} className="text-ink underline-offset-2 hover:underline max-sm:inline-block max-sm:min-h-touch max-sm:py-1">
                    {text}
                  </Link>
                ) : (
                  <span className="text-ink">{text}</span>
                )}
                <time dateTime={item.created_at} className="block text-small text-muted">{format.when(item.created_at, now)}</time>
              </span>
            </li>
          );
        })}
      </ul>
    );
  }
  return (
    <Card>
      <section aria-labelledby={titleId} className="flex flex-col gap-3">
        <h2 id={titleId} className="text-body font-semibold text-ink">{t("today.activity.title")}</h2>
        {body}
      </section>
    </Card>
  );
}
