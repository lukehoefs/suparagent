"use client";

import type { ReactNode } from "react";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonList } from "@/components/ui/Skeleton";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/use-i18n";

// The three states every panel shares, so loading, empty and failed look the same everywhere
// (design: States). `label` is what a screen reader hears while the rows pulse.
export function LoadingState({ rows = 3, label, className }: { rows?: number; label?: string; className?: string }) {
  return <SkeletonList rows={rows} label={label} className={className} />;
}

// Plain-language failure with a way to try again. With a title, the message is the detail under it.
export function ErrorState({
  message,
  title,
  onRetry,
  retryLabel,
  className,
}: {
  message: string;
  title?: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}) {
  const t = useT();
  return (
    <Banner tone="danger" title={title} className={className} action={onRetry ? <Button onClick={onRetry}>{retryLabel || t("states.tryAgain")}</Button> : undefined}>
      {message}
    </Banner>
  );
}

// Nothing here yet: say what it is and offer the next step when there is one.
export function EmptyPanel({
  title,
  description,
  action,
  icon,
  tone,
  className,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  tone?: "neutral" | "done";
  className?: string;
}) {
  return <EmptyState className={cn("py-8", className)} title={title} description={description} action={action} icon={icon} tone={tone} />;
}
