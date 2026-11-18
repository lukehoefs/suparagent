"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { request } from "@/lib/api";
import { customPageHref, setUiConfig, type UiConfigResponse, type UiRevision } from "@/lib/ui-config";
import { useUiConfig } from "@/lib/use-ui-config";
import { useT } from "@/lib/use-i18n";
import { SettingsCard } from "./SettingsCard";

function when(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

// What agents changed about the app's look (lib/ui-config.ts), and the undo for each change. Every
// change, an undo included, is a saved version, so nothing here is lost for good.
export function AppearanceSettings() {
  const t = useT();
  const current = useUiConfig();
  const [revisions, setRevisions] = useState<UiRevision[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | "reset" | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const load = useCallback(() => {
    request<{ revisions: UiRevision[] }>("/ui-config/history")
      .then((body) => setRevisions(body.revisions))
      .catch(() => setError(t("uiCustom.loadFailed")));
  }, [t]);

  useEffect(load, [load, current?.version]);

  const restore = async (revisionId: number) => {
    setBusy(revisionId === 0 ? "reset" : revisionId);
    setError(null);
    try {
      const body = await request<UiConfigResponse>("/ui-config/restore", {
        method: "POST",
        body: JSON.stringify({ revision_id: revisionId }),
      });
      setUiConfig(body);
      load();
    } catch {
      setError(t("uiCustom.restoreFailed"));
    } finally {
      setBusy(null);
      setConfirmReset(false);
    }
  };

  const config = current?.config;
  const overrides = config ? Object.keys(config.theme.light).length + Object.keys(config.theme.dark).length : 0;
  const latest = revisions?.[0]?.id;

  return (
    <div className="flex flex-col gap-6">
      <SettingsCard
        title={t("uiCustom.title")}
        description={t("uiCustom.description")}
        action={
          <Button variant="secondary" size="sm" disabled={!latest || busy !== null} loading={busy === "reset"} onClick={() => setConfirmReset(true)}>
            {t("uiCustom.reset")}
          </Button>
        }
      >
        <ul className="flex flex-col gap-1 text-label text-muted" id="setting-ui-summary">
          <li>{t("uiCustom.colourCount", { n: overrides })}</li>
          <li>{t("uiCustom.hiddenCount", { n: config?.nav.hidden.length ?? 0 })}</li>
          <li>
            {t("uiCustom.pageCount", { n: config?.pages.length ?? 0 })}
            {config && config.pages.length > 0 && (
              <>
                {": "}
                {config.pages.map((page, i) => (
                  <span key={page.id}>
                    {i > 0 && ", "}
                    <Link className="text-accent-text underline" href={customPageHref(page.id)}>{page.title}</Link>
                  </span>
                ))}
              </>
            )}
          </li>
        </ul>
      </SettingsCard>

      <SettingsCard title={t("uiCustom.history")} description={t("uiCustom.historyHint")}>
        {error && <p className="mb-2 text-label text-danger" role="alert">{error}</p>}
        {revisions === null ? (
          <p className="text-label text-muted">{t("uiCustom.loading")}</p>
        ) : revisions.length === 0 ? (
          <p className="text-label text-muted">{t("uiCustom.noChanges")}</p>
        ) : (
          <ol className="flex flex-col divide-y divide-line" id="setting-ui-history">
            {revisions.map((rev) => (
              <li key={rev.id} className="flex items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-label text-ink">{rev.summary}</p>
                  <p className="text-small text-faint">
                    {t("uiCustom.byWhen", { who: rev.actor === "you" ? t("uiCustom.you") : rev.actor, when: when(rev.created_at) })}
                  </p>
                </div>
                {rev.id === latest ? (
                  <span className="text-small font-medium text-faint">{t("uiCustom.current")}</span>
                ) : (
                  <Button variant="ghost" size="sm" disabled={busy !== null} loading={busy === rev.id} onClick={() => void restore(rev.id)}>
                    {t("uiCustom.restore")}
                  </Button>
                )}
              </li>
            ))}
          </ol>
        )}
        {latest && revisions && revisions.length > 0 && (
          <div className="mt-3">
            <Button variant="secondary" size="sm" disabled={busy !== null || revisions.length < 2} onClick={() => void restore(revisions[1].id)}>
              {t("uiCustom.undoLast")}
            </Button>
          </div>
        )}
      </SettingsCard>

      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title={t("uiCustom.resetTitle")}
        description={t("uiCustom.resetBody")}
        confirmLabel={t("uiCustom.reset")}
        cancelLabel={t("uiCustom.cancel")}
        loading={busy === "reset"}
        onConfirm={() => void restore(0)}
      />
    </div>
  );
}
