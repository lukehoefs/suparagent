"use client";

import { FileText } from "lucide-react";
import { forwardRef, useMemo } from "react";
import { groupRows, type ResultRow } from "@/lib/results";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/use-i18n";
import { Avatar } from "@/components/ui/Avatar";
import { StatusPill } from "@/components/ui/StatusPill";
import { STATUS_TONE, useResultLabels } from "./labels";

const GROUP_KEY = { today: "results.group.today", earlier: "results.group.earlier" } as const;

// Today, then Earlier, in a card (design: Results.html). Each row picks the result shown beside
// the list; the picked one is marked for assistive tech with aria-current.
export const ResultList = forwardRef<HTMLElement, {
  rows: ResultRow[];
  selectedKey: string | null;
  onPick: (row: ResultRow) => void;
  detailId: string;
}>(function ResultList({ rows, selectedKey, onPick, detailId }, ref) {
  const t = useT();
  const labels = useResultLabels();
  const groups = useMemo(() => groupRows(rows), [rows]);
  return (
    <section ref={ref} aria-label={t("results.title")} className="flex min-w-0 flex-[999_1_460px] flex-col overflow-hidden rounded-card border border-line bg-raised">
      {groups.map((group, index) => {
        const headingId = `results-group-${group.key}`;
        return (
          <div key={group.key} role="group" aria-labelledby={headingId}>
            <h2 id={headingId} className={cn("px-4 py-3 text-label font-semibold text-ink", index > 0 && "border-t border-line")}>{t(GROUP_KEY[group.key])}</h2>
            <ul>
              {group.rows.map((row) => {
                const on = row.key === selectedKey;
                return (
                  <li key={row.key}>
                    <button
                      type="button"
                      onClick={() => onPick(row)}
                      aria-current={on ? "true" : undefined}
                      aria-controls={detailId}
                      // The card clips what overflows it, so the focus ring is drawn inside the row.
                      className={cn(
                        "flex min-h-touch w-full cursor-pointer flex-wrap items-center gap-3 border-t border-line px-4 py-3 text-left text-body text-ink transition-colors duration-(--dur-fast) focus-visible:outline-offset-[-2px]",
                        on ? "bg-inset" : "hover:bg-inset",
                      )}
                    >
                      {/* One document mark for every result (design); the meta line says where it came from. */}
                      <span aria-hidden="true" className="inline-flex shrink-0 text-muted"><FileText size={18} strokeWidth={1.7} /></span>
                      <span className="min-w-0 flex-[1_1_220px]">
                        <span className="block truncate font-medium">{row.title || t("results.untitled")}</span>
                        <span className="flex min-w-0 items-center gap-1.5 text-small text-muted">
                          {/* 16 px with 10 px initials, as in the design's meta line. */}
                          <Avatar agentId={labels.avatarOf(row)} name={labels.agentOf(row)} size="xxs" />
                          <span className="truncate">{labels.metaOf(row)}</span>
                        </span>
                      </span>
                      <StatusPill status={STATUS_TONE[row.status]}>{labels.statusOf(row)}</StatusPill>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </section>
  );
});
