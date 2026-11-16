"use client";

// Small pieces the Routines tab's sections share: the section heading, the error text, and the
// failed-to-load banner with its retry.
import { useCallback, type ReactNode } from "react";
import { resolveLocale } from "@/lib/i18n";
import { useLanguageChoice, useT } from "@/lib/use-i18n";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";

export function SectionHeader({ id, title, subtitle, action }: { id: string; title: string; subtitle: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 flex-1 basis-64">
        <h2 id={id} className="text-h3 font-semibold text-ink">{title}</h2>
        <p className="mt-0.5 text-small text-muted">{subtitle}</p>
      </div>
      {action ? <div className="flex flex-wrap items-center gap-2">{action}</div> : null}
    </div>
  );
}

/** The server's own message when it gave one, otherwise a plain "that did not work". */
export function useErrorText() {
  const t = useT();
  return useCallback((err: unknown) => (err instanceof Error && err.message ? err.message : t("agentAutomation.failed")), [t]);
}

export function useLocale(): string {
  return resolveLocale(useLanguageChoice());
}

export function LoadFailed({ message, onRetry }: { message: string; onRetry: () => void }) {
  const t = useT();
  return (
    <Banner tone="danger" action={<Button size="sm" onClick={onRetry}>{t("agentAutomation.retry")}</Button>}>
      {message}
    </Banner>
  );
}
