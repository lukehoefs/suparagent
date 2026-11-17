"use client";

// History… in the agent settings More menu (admin only, like its routes): the stored versions of
// the profile newest first, one version's stored values beside what a restore would change, and a
// restore that is itself saved as a new version (services/agent_history.py).
import { useEffect, useState } from "react";
import { api, ApiError, type Agent, type Engine } from "@/lib/api";
import { canRestore, type AgentRevision } from "@/lib/agent-history";
import { joinList, restoreChanges, shownFields, shownValue } from "@/lib/agent-profile-extras";
import { pluralForm } from "@/lib/blueprint-browse";
import { LANGUAGE_TAGS, resolveLocale } from "@/lib/i18n";
import { useLanguageChoice, useT } from "@/lib/use-i18n";
import { approvalModeText, appLevelText } from "@/components/agents/new/labels";
import { Badge } from "@/components/ui/Badge";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Dialog } from "@/components/ui/Dialog";
import { SkeletonList } from "@/components/ui/Skeleton";

type Detail = AgentRevision & { snapshot: Record<string, unknown> };
type Notice = { tone: "success" | "warning" | "danger"; text: string };

const LIST = "flex flex-col divide-y divide-line rounded-card border border-line";
const DEFAULTS_TO_ENGINE = new Set(["model", "effort", "temperature", "top_p", "max_output_tokens", "fallback_model"]);
const ENGINE_FIELDS = new Set(["provider", "fallback_provider"]);

export function HistoryDialog({
  agent,
  engines,
  blocked,
  onClose,
  onRestored,
}: {
  agent: Agent;
  // For engine names; null while loading (ids are shown then).
  engines: Engine[] | null;
  // Unsaved changes on the page: a restore would replace the profile under them, so it waits.
  blocked: boolean;
  onClose: () => void;
  onRestored: (agent: Agent) => void;
}) {
  const t = useT();
  const locale = resolveLocale(useLanguageChoice());
  const tag = LANGUAGE_TAGS[locale];
  const [revisions, setRevisions] = useState<AgentRevision[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [listTick, setListTick] = useState(0);
  const [viewing, setViewing] = useState<number | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [current, setCurrent] = useState<Agent | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailTick, setDetailTick] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    let live = true;
    api.listAgentRevisions(agent.id).then(
      (rows) => { if (live) { setRevisions(rows); setListError(null); } },
      (err: unknown) => { if (live) setListError(err instanceof Error ? err.message : t("agentProfile.history.loadFailed")); },
    );
    return () => { live = false; };
  }, [agent.id, listTick, t]);

  useEffect(() => {
    if (viewing === null) return;
    let live = true;
    // The agent is read again too: "Will change" compares with the profile as the server has it
    // now, which may have moved on since this page loaded.
    Promise.all([api.getAgentRevision(agent.id, viewing), api.getAgent(agent.id)]).then(
      ([value, now]) => { if (live) { setDetail(value); setCurrent(now); setDetailError(null); } },
      (err: unknown) => {
        if (!live) return;
        if (err instanceof ApiError && err.code === "revision_not_found") {
          setViewing(null);
          setNotice({ tone: "warning", text: t("agentProfile.history.gone") });
          setListTick((n) => n + 1);
        } else {
          setDetailError(err instanceof Error ? err.message : t("agentProfile.history.detailFailed"));
        }
      },
    );
    return () => { live = false; };
  }, [agent.id, viewing, detailTick, t]);

  const newest = revisions && revisions.length > 0 ? revisions[0].number : null;

  const fieldLabel = (field: string) => {
    const key = `agentProfile.field.${field}`;
    const text = t(key);
    return text === key ? field.replaceAll("_", " ") : text;
  };
  const fieldList = (fields: string[]) => joinList(tag, fields.map(fieldLabel));
  const when = (iso: string) => {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    try {
      return new Intl.DateTimeFormat(tag, { dateStyle: "medium", timeStyle: "short" }).format(date);
    } catch {
      return date.toLocaleString();
    }
  };
  const summary = (revision: AgentRevision) => {
    if (revision.source === "baseline") return t("agentProfile.history.baseline");
    const fields = revision.changed_fields;
    if (revision.source === "restore") {
      if (revision.restored_from === null) return fields.length > 0 ? t("agentProfile.history.restoredPlain", { fields: fieldList(fields) }) : t("agentProfile.history.changedNothing");
      return fields.length > 0
        ? t("agentProfile.history.restored", { from: revision.restored_from, fields: fieldList(fields) })
        : t("agentProfile.history.restoredFrom", { from: revision.restored_from });
    }
    return fields.length > 0 ? t("agentProfile.history.changed", { fields: fieldList(fields) }) : t("agentProfile.history.changedNothing");
  };

  const open = (number: number) => {
    setNotice(null);
    setDetail(null);
    setCurrent(null);
    setDetailError(null);
    setViewing(number);
  };
  const back = () => {
    setViewing(null);
    setDetail(null);
    setDetailError(null);
  };

  const changes = detail ? restoreChanges(detail.snapshot, (current ?? agent) as unknown as Record<string, unknown>, detail.redacted) : [];
  const isNewest = detail !== null && detail.number === newest;
  const restorable = detail !== null && canRestore(detail, newest) && changes.length > 0;

  const restore = async () => {
    if (!detail || !restorable || blocked) return;
    const number = detail.number;
    setBusy(true);
    try {
      const next = await api.restoreAgentRevision(agent.id, number, newest);
      setConfirming(false);
      onRestored(next);
      back();
      setNotice({ tone: "success", text: t("agentProfile.history.done", { n: number }) });
      setListTick((n) => n + 1);
    } catch (err) {
      setConfirming(false);
      if (err instanceof ApiError && (err.code === "revision_conflict" || err.code === "revision_not_found")) {
        // Nothing was restored: show the versions as they are now.
        back();
        setNotice({
          tone: "warning",
          text: err.code === "revision_conflict" ? t("agentProfile.history.conflict", { name: agent.name }) : t("agentProfile.history.gone"),
        });
        setListTick((n) => n + 1);
      } else {
        setNotice({ tone: "danger", text: err instanceof Error ? err.message : t("agentSettings.actionFailed") });
      }
    } finally {
      setBusy(false);
    }
  };

  const valueText = (field: string, value: unknown): { long: boolean; text: string } => {
    const shown = shownValue(field, value);
    switch (shown.kind) {
      case "empty":
        if (field === "workspace_path") return { long: false, text: t("agentSettings.profile.workspacePlaceholder") };
        if (DEFAULTS_TO_ENGINE.has(field)) return { long: false, text: t("agentSettings.profile.engineDefault") };
        return { long: false, text: t("agentProfile.value.none") };
      case "on":
        return { long: false, text: t("agentProfile.value.on") };
      case "off":
        return { long: false, text: t("agentProfile.value.off") };
      case "long":
        return { long: true, text: shown.text };
      case "effort":
        return { long: false, text: t(`agentsModel.effort.${shown.level}`) };
      case "apps":
        return { long: false, text: shown.apps.map((item) => `${item.app} (${appLevelText(t, item.level)})`).join(", ") };
      case "accounts":
        return { long: false, text: t(`agentProfile.value.accounts.${pluralForm(locale, shown.count)}`, { n: shown.count }) };
      case "text":
        if (ENGINE_FIELDS.has(field)) return { long: false, text: engines?.find((engine) => engine.id === shown.text)?.label ?? shown.text };
        if (field === "approval_mode") return { long: false, text: approvalModeText(t, shown.text).label };
        return { long: false, text: shown.text };
    }
  };

  const noticeBanner = notice && (
    <Banner tone={notice.tone} onDismiss={() => setNotice(null)}>{notice.text}</Banner>
  );

  return (
    <Dialog
      open
      onOpenChange={(next) => { if (!next && !busy) onClose(); }}
      title={t("agentProfile.history.title", { name: agent.name })}
      description={viewing === null ? t("agentProfile.history.body") : undefined}
      size="wide"
      footer={viewing === null ? (
        <Button onClick={onClose}>{t("common.close")}</Button>
      ) : (
        <>
          <Button disabled={busy} onClick={back}>{t("agentProfile.history.back")}</Button>
          {detail !== null && !isNewest && (
            <Button variant="primary" disabled={!restorable || blocked || busy} onClick={() => setConfirming(true)}>
              {t("agentProfile.history.restore")}
            </Button>
          )}
        </>
      )}
    >
      <div className="flex flex-col gap-4">
        {noticeBanner}
        <p className="text-small text-muted">{t("agentProfile.history.never")}</p>
        {viewing === null ? (
          <>
            {listError && revisions === null ? (
              <Banner tone="danger" action={<Button size="sm" onClick={() => { setListError(null); setListTick((n) => n + 1); }}>{t("agentSettings.retry")}</Button>}>
                {listError}
              </Banner>
            ) : revisions === null ? (
              <SkeletonList rows={4} />
            ) : revisions.length === 0 ? (
              <p className="text-small text-muted">{t("agentProfile.history.empty")}</p>
            ) : (
              <ul className={LIST}>
                {revisions.map((revision) => (
                  <li key={revision.number} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-label font-medium text-ink">{t("agentProfile.history.version", { n: revision.number })}</span>
                        {revision.number === newest && <Badge>{t("agentProfile.history.current")}</Badge>}
                        {revision.redacted.length > 0 && <Badge>{t("agentProfile.history.hidden")}</Badge>}
                      </div>
                      <p className="mt-0.5 text-small text-muted">
                        <time dateTime={revision.created_at}>{when(revision.created_at)}</time>
                        {" · "}
                        {summary(revision)}
                      </p>
                    </div>
                    <Button size="sm" onClick={() => open(revision.number)}>{t("agentProfile.history.view")}</Button>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : detailError && detail === null ? (
          <Banner tone="danger" action={<Button size="sm" onClick={() => { setDetailError(null); setDetailTick((n) => n + 1); }}>{t("agentSettings.retry")}</Button>}>
            {detailError}
          </Banner>
        ) : detail === null ? (
          <SkeletonList rows={6} />
        ) : (
          <>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-h3 font-semibold text-ink">{t("agentProfile.history.version", { n: detail.number })}</h3>
                {isNewest && <Badge>{t("agentProfile.history.current")}</Badge>}
              </div>
              <p className="mt-0.5 text-small text-muted">
                <time dateTime={detail.created_at}>{when(detail.created_at)}</time>
                {" · "}
                {summary(detail)}
              </p>
            </div>
            <p className="text-small text-ink">
              {isNewest
                ? t("agentProfile.history.isCurrent")
                : changes.length === 0
                  ? t("agentProfile.history.matches")
                  : t("agentProfile.history.willChange", { fields: fieldList(changes) })}
            </p>
            {!isNewest && changes.length > 0 && blocked && <Banner tone="warning">{t("agentProfile.history.unsaved")}</Banner>}
            <dl className={LIST}>
              {shownFields(detail.snapshot).map((field) => {
                const value = valueText(field, detail.snapshot[field]);
                const hidden = detail.redacted.includes(field);
                return (
                  <div key={field} className="flex min-w-0 flex-col gap-1 px-3 py-2.5 sm:flex-row sm:gap-4">
                    <dt className="flex shrink-0 flex-wrap items-center gap-1.5 text-small text-muted sm:w-48">
                      {fieldLabel(field)}
                      {!isNewest && changes.includes(field) && <Badge>{t("agentProfile.history.differs")}</Badge>}
                    </dt>
                    <dd className="min-w-0 flex-1 text-label text-ink">
                      {value.long ? (
                        <p className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words rounded-field bg-inset px-2.5 py-2 text-small">{value.text}</p>
                      ) : (
                        <span className="break-words">{value.text}</span>
                      )}
                      {hidden && <p className="mt-1 text-small text-muted">{t("agentProfile.history.hiddenValue")}</p>}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </>
        )}
      </div>
      <ConfirmDialog
        open={confirming}
        onOpenChange={(next) => { if (!next && !busy) setConfirming(false); }}
        title={t("agentProfile.history.restoreTitle", { n: detail?.number ?? "" })}
        description={t("agentProfile.history.restoreBody", { n: detail?.number ?? "", fields: fieldList(changes) })}
        confirmLabel={t("agentProfile.history.restoreConfirm")}
        cancelLabel={t("common.cancel")}
        loading={busy}
        onConfirm={() => void restore()}
      />
    </Dialog>
  );
}
