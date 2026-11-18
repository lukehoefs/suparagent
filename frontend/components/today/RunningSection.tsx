"use client";

import Link from "next/link";
import type { RunningItem } from "@/lib/today";
import { useT } from "@/lib/use-i18n";
import { Avatar } from "@/components/ui/Avatar";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatusPill, StatusText } from "@/components/ui/StatusPill";
import { SectionNote, TodaySection } from "./TodaySection";
import type { TodayFormat } from "./useTodayFormat";

// Answers being worked on now (design: "Running now"). The engines report no progress, so a row
// says since when it has been working instead of drawing a progress bar.
export function RunningSection({
  items,
  loading,
  failed,
  agentName,
  format,
}: {
  items: RunningItem[];
  loading: boolean;
  failed: boolean;
  agentName: (id: number | null) => string | null;
  format: TodayFormat;
}) {
  const t = useT();
  const badge = items.length > 0 ? (
    // A flex box, so the 22 px pill sets the header's height (no line box around it).
    <span role="img" aria-label={t("today.running.count", { count: items.length })} className="flex">
      <StatusPill status="running" dot={false}>{items.length}</StatusPill>
    </span>
  ) : null;
  let body;
  if (loading) {
    body = (
      <div role="status" className="flex flex-col gap-2 p-4">
        <span className="sr-only">{t("today.loading")}</span>
        <Skeleton className="h-9" />
      </div>
    );
  } else if (failed && items.length === 0) {
    body = <SectionNote tone="danger">{t("today.running.loadFailed")}</SectionNote>;
  } else if (items.length === 0) {
    body = <SectionNote>{t("today.running.empty")}</SectionNote>;
  } else {
    body = (
      <ul className="flex flex-col">
        {items.map((item) => {
          const name = agentName(item.agentId);
          const label = item.routineName ?? item.title ?? t("today.running.untitled");
          return (
            <li key={item.key} className="border-b border-line last:border-b-0">
              <Link href={item.href} className="flex min-w-0 items-center gap-2.5 px-4 py-3 hover:bg-hover max-sm:min-h-touch">
                <Avatar agentId={item.agentId} name={name} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-label text-ink">
                    {name && <strong className="font-semibold">{name} </strong>}
                    {label}
                  </span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-small text-muted">
                    <StatusText status="running">{t("today.running.working")}</StatusText>
                    <span>{t("today.running.since", { time: format.time(item.startedAt) })}</span>
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    );
  }
  return <TodaySection title={t("today.running.title")} badge={badge}>{body}</TodaySection>;
}
