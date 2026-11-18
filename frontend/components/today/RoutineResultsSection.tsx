"use client";

import Link from "next/link";
import type { RoutineResult } from "@/lib/today";
import { useT } from "@/lib/use-i18n";
import { Avatar } from "@/components/ui/Avatar";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatusPill } from "@/components/ui/StatusPill";
import { SectionNote, TodaySection } from "./TodaySection";
import type { TodayFormat } from "./useTodayFormat";

// Each routine's latest result today (design: "Routine results"), linked to that run's conversation.
export function RoutineResultsSection({
  results,
  loading,
  failed,
  partialLimit,
  agentName,
  format,
}: {
  results: RoutineResult[];
  loading: boolean;
  failed: boolean;
  // Set when the runs read may not reach back to the start of today: how many were read.
  partialLimit: number | null;
  agentName: (id: number | null) => string | null;
  format: TodayFormat;
}) {
  const t = useT();
  let body;
  if (loading) {
    body = (
      <div role="status" className="flex flex-col gap-2 p-4">
        <span className="sr-only">{t("today.loading")}</span>
        <Skeleton className="h-9" />
      </div>
    );
  } else if (failed && results.length === 0) {
    body = <SectionNote tone="danger">{t("today.routines.loadFailed")}</SectionNote>;
  } else if (results.length === 0) {
    body = <SectionNote>{t("today.routines.empty")}</SectionNote>;
  } else {
    body = (
      <ul className="flex flex-col">
        {results.map((result) => (
          <li key={result.key} className="border-b border-line last:border-b-0">
            <Link href={result.href} className="flex min-w-0 items-center gap-2.5 px-4 py-3 hover:bg-hover max-sm:min-h-touch">
              <Avatar agentId={result.agentId} name={agentName(result.agentId)} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-label font-medium text-ink">{result.name}</span>
                <span className="block text-small text-muted">
                  <time dateTime={result.at}>{format.time(result.at)}</time>
                  {result.count > 1 && <> · {t("today.routines.runs", { count: result.count })}</>}
                </span>
              </span>
              <StatusPill status={result.status}>{t(result.labelKey)}</StatusPill>
            </Link>
          </li>
        ))}
      </ul>
    );
  }
  const footer = partialLimit !== null && !loading ? <p className="text-small text-muted">{t("today.routines.partial", { count: partialLimit })}</p> : null;
  return <TodaySection title={t("today.routines.title")} footer={footer}>{body}</TodaySection>;
}
