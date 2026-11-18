"use client";

// Pieces the matrix's two layouts (MatrixGrid on wider screens, MatrixList on a phone) share: what they
// are given, how a source is named, the three-state checkbox and the read-only explanations.
import Link from "next/link";
import { useCallback, type ReactNode } from "react";
import type { Agent } from "@/lib/api";
import type { ComposioAccount, Level } from "@/lib/connected-apps";
import { pluralForm } from "@/lib/blueprint-browse";
import { resolveLocale } from "@/lib/i18n";
import { useLanguageChoice, useT } from "@/lib/use-i18n";
import { cn } from "@/lib/cn";
import type { Lock, MatrixSource, MatrixState } from "@/lib/permissions-matrix";
import { StatusPill } from "@/components/ui/StatusPill";

export type MatrixView = {
  // The sources and agents the filters leave.
  sources: MatrixSource[];
  agents: Agent[];
  saved: MatrixState;
  desired: MatrixState;
  locks: ReadonlyMap<string, Lock>;
  // Change keys that did not save last time (only ones still pending).
  failed: ReadonlySet<string>;
  // Agents that would have more skills than allowed, and every agent's skill count after the edit.
  over: ReadonlySet<number>;
  skillCounts: ReadonlyMap<number, number>;
  // Agents whose engine can't use MCP tools (the grants are kept but do nothing there).
  noTools: ReadonlySet<number>;
  accounts: ComposioAccount[] | null;
  disabled: boolean;
  expanded: string | null;
  labelOf: (source: MatrixSource) => string;
  onExpand: (id: string | null) => void;
  onToggle: (keys: string[]) => void;
  onLevel: (agentId: number, slug: string, level: Level) => void;
  onAccount: (agentId: number, slug: string, accountId: string, allowed: boolean) => void;
};

// The skill library's categories, as the people reading them say them.
const CATEGORY_KEYS: Record<string, string> = {
  Prospecting: "permissions.category.prospecting",
  Outreach: "permissions.category.outreach",
  Sales: "permissions.category.sales",
  Marketing: "permissions.category.marketing",
  RevOps: "permissions.category.revops",
  Research: "permissions.category.research",
  Operations: "permissions.category.operations",
  Writing: "permissions.category.writing",
  Design: "permissions.category.design",
  "Computer use": "permissions.category.computerUse",
};

/** A source's name: "Activepieces · Gmail", "Connected apps", "Skills · Writing". */
export function useSourceLabel(): (source: MatrixSource) => string {
  const t = useT();
  return useCallback((source: MatrixSource) => {
    if (source.kind === "apps") return t("permissions.source.apps");
    if (source.kind === "skills") {
      const category = source.sub ?? "";
      return t("permissions.source.skillsIn", { category: CATEGORY_KEYS[category] ? t(CATEGORY_KEYS[category]) : category });
    }
    if (!source.sub) return source.name;
    const app = source.sub === "Other" ? t("permissions.source.other") : source.sub;
    return t("permissions.source.appIn", { source: source.name, app });
  }, [t]);
}

/** A counted message in the reader's language: `base.one`, `base.few`, `base.many` or `base.other`. */
export function usePlural(): (base: string, n: number, params?: Record<string, string | number>) => string {
  const t = useT();
  const locale = resolveLocale(useLanguageChoice());
  return useCallback((base, n, params) => t(`${base}.${pluralForm(locale, n)}`, { n, ...params }), [t, locale]);
}

/** An item's name as the matrix prints it: skills with their slash, tools and apps as they are. */
export function itemText(source: MatrixSource, label: string): string {
  return source.kind === "skills" ? `/${label}` : label;
}

/** A checkbox that can also read "some" (mixed). Native, so keyboard and screen readers work as usual. */
export function TriCheckbox({
  state,
  label,
  onChange,
  disabled,
  className,
}: {
  state: "on" | "mixed" | "off";
  label: string;
  onChange: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      checked={state === "on"}
      // indeterminate is a property only; browsers expose it to screen readers as "mixed".
      ref={(el) => { if (el) el.indeterminate = state === "mixed"; }}
      onChange={onChange}
      disabled={disabled}
      className={cn("size-4 shrink-0 cursor-pointer accent-(--accent) disabled:cursor-not-allowed disabled:opacity-50", className)}
    />
  );
}

/** A bare checkbox's hit area: its own size with a mouse, 44 px square on touch (a tap anywhere in it
 *  toggles the box). */
export function TouchTarget({ children }: { children: ReactNode }) {
  return (
    <label className="inline-flex shrink-0 cursor-pointer items-center justify-center has-[:disabled]:cursor-not-allowed touch:size-11">
      {children}
    </label>
  );
}

/** What a read-only source says on its header: a status word with its dot. */
export function ReadOnlyPill({ source }: { source: MatrixSource }) {
  const t = useT();
  if (!source.readOnly) return source.actsForYou ? <StatusPill status="waiting">{t("permissions.source.actsForYou")}</StatusPill> : null;
  return <StatusPill status="idle">{t(source.readOnly === "server_off" ? "permissions.readOnly.offPill" : "permissions.readOnly.pill")}</StatusPill>;
}

/** Why a read-only source can't be changed here, and where it can. The retry waits while a save runs:
 *  reading then would swap the matrix for a skeleton mid-save. */
export function ReadOnlyNote({ source, label, onRetry, disabled, className }: {
  source: MatrixSource; label: string; onRetry?: () => void; disabled?: boolean; className?: string;
}) {
  const t = useT();
  if (!source.readOnly) return null;
  const link = source.readOnly === "server_off"
    ? { href: "/apps/#custom-mcp-heading", text: t("permissions.notes.manageServers") }
    : source.readOnly === "apps_not_set_up" ? { href: "/apps/", text: t("permissions.notes.openApps") } : null;
  return (
    <p className={cn("text-small text-muted", className)}>
      {t(`permissions.readOnly.${source.readOnly === "server_off" ? "off" : source.readOnly === "apps_not_set_up" ? "appsNotSetUp" : "accountsFailed"}`, { source: label })}{" "}
      {link ? <Link href={link.href} className="text-accent-text underline underline-offset-2">{link.text}</Link> : null}
      {!link && onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          disabled={disabled}
          className="inline-flex cursor-pointer items-center text-accent-text underline underline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 touch:min-h-11"
        >
          {t("permissions.retry")}
        </button>
      ) : null}
    </p>
  );
}

/** The words for one agent's locked cells in a source. */
export function lockText(lock: Lock, t: (key: string) => string): string {
  return lock === "engine" ? t("permissions.lock.engine") : t("permissions.lock.loadFailed");
}
