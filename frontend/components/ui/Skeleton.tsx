"use client";

import { cn } from "@/lib/cn";
import { useT } from "@/lib/use-i18n";

// A placeholder block that pulses while content loads (design: States, "Chat: loading": a flat
// `sel` block with a 6 px radius). Decorative: pair with a status line for screen readers.
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("animate-pulse rounded-inner bg-hover", className)} />;
}

// N stacked rows, the usual stand-in for a list that is loading. `label` is what a screen reader
// hears ("Loading agents"); it defaults to "Loading…".
export function SkeletonList({ rows = 4, label, className }: { rows?: number; label?: string; className?: string }) {
  const t = useT();
  return (
    <div role="status" aria-busy="true" className={cn("flex flex-col gap-2", className)}>
      <span className="sr-only">{label || t("common.loading")}</span>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-9" />
      ))}
    </div>
  );
}
