"use client";

// An agent's daily logs (memory/log/YYYY-MM-DD.md, docs/MEMORY.md) inside its memory: the days that
// have one, newest first; one day opened read-only; and Delete, which asks first because the journal
// does not keep logs. A log is never loaded into a conversation; the agent finds it only when it
// searches its past conversations.
import { useCallback, useEffect, useState } from "react";
import { api, type Agent, type MemoryLogDay } from "@/lib/api";
import { formatLogDay, newestDaysFirst, sizeKb } from "@/lib/agent-automation";
import { resolveLocale } from "@/lib/i18n";
import { useLanguageChoice, useT } from "@/lib/use-i18n";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyPanel, LoadingState } from "./PanelState";

export function MemoryDailyLogs({ agent }: { agent: Agent }) {
  const t = useT();
  const locale = resolveLocale(useLanguageChoice());
  const errorText = useCallback((err: unknown) => (err instanceof Error && err.message ? err.message : t("agentAutomation.failed")), [t]);
  const [logs, setLogs] = useState<MemoryLogDay[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [open, setOpen] = useState<{ day: string; text: string } | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  // The day the dialog asks about stays set while the dialog closes, so its title does not change.
  const [deleting, setDeleting] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const askDelete = (day: string) => { setDeleting(day); setAsking(true); };

  useEffect(() => {
    let live = true;
    api.memoryLogs(agent.id)
      .then((result) => { if (live) { setLogs(newestDaysFirst(result.logs)); setLoadError(null); } })
      .catch((err: unknown) => { if (live) setLoadError(errorText(err)); });
    return () => { live = false; };
  }, [agent.id, tick, errorText]);

  const openDay = async (day: string) => {
    setOpening(day);
    setActionError(null);
    try {
      setOpen(await api.memoryLog(agent.id, day));
    } catch (err) {
      setActionError(errorText(err));
      // The day may be gone (deleted elsewhere): read the list again.
      setTick((n) => n + 1);
    } finally {
      setOpening(null);
    }
  };

  const remove = async () => {
    const day = deleting;
    if (!day) return;
    setBusy(true);
    setActionError(null);
    try {
      await api.deleteMemoryLog(agent.id, day);
      setLogs((current) => current?.filter((log) => log.day !== day) ?? current);
      setOpen((current) => (current?.day === day ? null : current));
    } catch (err) {
      setActionError(errorText(err));
    } finally {
      setAsking(false);
      setBusy(false);
      setTick((n) => n + 1);
    }
  };

  const confirmDialog = (
    <ConfirmDialog
      open={asking && deleting !== null}
      onOpenChange={(value) => { if (!value) setAsking(false); }}
      title={t("agentAutomation.logs.confirmTitle", { day: deleting ? formatLogDay(deleting, locale) : "" })}
      description={t("agentAutomation.logs.confirmBody", { name: agent.name })}
      confirmLabel={t("agentAutomation.logs.delete")}
      cancelLabel={t("common.cancel")}
      danger
      loading={busy}
      onConfirm={() => void remove()}
    />
  );

  if (open) {
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-label font-medium text-ink">{formatLogDay(open.day, locale)}</h3>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="ghost" onClick={() => setOpen(null)}>{t("agentAutomation.logs.back")}</Button>
            <Button size="sm" onClick={() => askDelete(open.day)} disabled={busy}>{t("agentAutomation.logs.delete")}</Button>
          </div>
        </div>
        {actionError && <Banner tone="danger" onDismiss={() => setActionError(null)}>{actionError}</Banner>}
        <p className="text-small text-muted">{t("agentAutomation.logs.readOnly")}</p>
        <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-field bg-inset p-3 font-mono text-small text-ink">
          {open.text.trim() || t("agentAutomation.logs.emptyDay")}
        </pre>
        {confirmDialog}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-small text-muted">{t("agentAutomation.logs.intro", { name: agent.name })}</p>
      {actionError && <Banner tone="danger" onDismiss={() => setActionError(null)}>{actionError}</Banner>}
      {loadError && (
        <Banner
          tone="danger"
          action={<Button size="sm" onClick={() => { setLoadError(null); setTick((n) => n + 1); }}>{t("agentAutomation.retry")}</Button>}
        >
          {loadError}
        </Banner>
      )}
      {logs === null ? (
        !loadError && <LoadingState rows={3} />
      ) : logs.length === 0 ? (
        <EmptyPanel title={t("agentAutomation.logs.emptyTitle")} description={t("agentAutomation.logs.emptyBody", { name: agent.name })} />
      ) : (
        <ul className="divide-y divide-line rounded-card border border-line">
          {logs.map((log) => (
            <li key={log.day} className="flex items-center gap-3 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-label text-ink">{formatLogDay(log.day, locale)}</p>
                <p className="text-small text-muted">{t("agentAutomation.logs.size", { n: sizeKb(log.bytes) })}</p>
              </div>
              <Button size="sm" onClick={() => void openDay(log.day)} disabled={opening !== null} loading={opening === log.day}>
                {t("agentAutomation.logs.open")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => askDelete(log.day)}
                disabled={busy}
                aria-label={t("agentAutomation.logs.deleteLabel", { day: formatLogDay(log.day, locale) })}
              >
                {t("agentAutomation.logs.delete")}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {confirmDialog}
    </div>
  );
}
