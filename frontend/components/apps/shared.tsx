"use client";

// Small pieces the Apps page sections share (design: Apps.html).
import { useMemo, useState, type ReactNode } from "react";
import type { CatalogApp } from "@/lib/apps-catalog";
import type { Problem } from "@/lib/apps-page";
import { pluralForm } from "@/lib/blueprint-browse";
import { resolveLocale } from "@/lib/i18n";
import { useLanguageChoice, useT } from "@/lib/use-i18n";
import { useAppShell } from "@/components/shell/AppShell";
import { Banner } from "@/components/ui/Banner";

// Card grids collapse to one column on a phone (390 px) without sideways scroll.
export const APP_GRID = "grid grid-cols-[repeat(auto-fill,minmax(min(260px,100%),1fr))] gap-3";
export const SERVER_GRID = "grid grid-cols-[repeat(auto-fill,minmax(min(320px,100%),1fr))] gap-4";
export const MARKET_GRID = "grid grid-cols-[repeat(auto-fill,minmax(min(220px,100%),1fr))] gap-3";

export type AgentOption = { id: number; name: string };

// The agents tools can be granted to: every agent that is not archived, from the shell's list.
export function useAgentOptions(): AgentOption[] | null {
  const { agents } = useAppShell();
  return useMemo(() => agents === null ? null : agents.filter((agent) => agent.archived_at === null).map(({ id, name }) => ({ id, name })), [agents]);
}

// "{n} tools" in the reader's language (one, few, many, other).
export function useCount() {
  const t = useT();
  const locale = resolveLocale(useLanguageChoice());
  return (base: string, n: number) => t(`${base}.${pluralForm(locale, n)}`, { n });
}

export function ProblemBanner({ problem, onDismiss, action }: { problem: Problem; onDismiss?: () => void; action?: ReactNode }) {
  const t = useT();
  return <Banner tone="danger" title={t(problem.key)} onDismiss={onDismiss} action={action}>{problem.detail}</Banner>;
}

export function SectionHeading({ id, title, intro, action }: { id?: string; title: string; intro?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 id={id} tabIndex={id ? -1 : undefined} className="scroll-mt-4 text-h3 font-semibold text-ink outline-none">{title}</h2>
        {intro ? <p className="mt-1 max-w-[70ch] text-body text-muted">{intro}</p> : null}
      </div>
      {action ? <div className="flex flex-wrap items-center gap-2">{action}</div> : null}
    </div>
  );
}

// An app's picture, from a Composio host only (the server drops any other address), or its initial.
export function AppIcon({ app, size = 32 }: { app: Pick<CatalogApp, "icon" | "name">; size?: number }) {
  const [broken, setBroken] = useState(false);
  if (app.icon && !broken) {
    // A remote picture that never carries the referrer; next/image cannot optimise it in a static export.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={app.icon} alt="" width={size} height={size} loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} style={{ width: size, height: size }} className="shrink-0 rounded-field bg-inset object-contain" />;
  }
  return (
    <span aria-hidden="true" style={{ width: size, height: size }} className="inline-flex shrink-0 items-center justify-center rounded-field bg-inset text-label font-semibold text-ink">
      {app.name.charAt(0).toUpperCase()}
    </span>
  );
}

// A sentence with one value in it, in any word order: the template is split where the value goes.
// A template without the marker is shown as it is.
export function WithValue({ text, marker, children }: { text: string; marker: string; children: ReactNode }) {
  const at = text.indexOf(marker);
  if (at < 0) return <>{text}</>;
  return <>{text.slice(0, at)}{children}{text.slice(at + marker.length)}</>;
}

// The same with the value in bold.
export function WithStrong({ text, marker, value }: { text: string; marker: string; value: string }) {
  return <WithValue text={text} marker={marker}><strong className="font-semibold text-ink">{value}</strong></WithValue>;
}
