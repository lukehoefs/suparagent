"use client";

// One routine's run history (GET /routines/{id}/runs): each run's state as a word and a dot, what
// started it, when, how long it worked and what it came to, with its conversation and the
// connected-app actions it recorded. Read again every few seconds while a run is going.
import Link from "next/link";
import { History } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, type Routine, type RoutineAppAction, type RoutineRun } from "@/lib/api";
import { formatMoment, pollAfterSettle, replyOrder, runOutcomeKey, runStateWords } from "@/lib/agent-automation";
import { anyRunActive, appActionWords, formatDuration, runMoment, runTriggerKey, runWorkSeconds } from "@/lib/routines-page";
import { useT } from "@/lib/use-i18n";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonList } from "@/components/ui/Skeleton";
import { StatusText } from "@/components/ui/StatusPill";
import { useErrorText, useLocale } from "./shared";

const ACTIVE_EVERY_MS = 5_000;
const IDLE_EVERY_MS = 30_000;

export function RoutineRuns({ routine }: { routine: Routine }) {
  const t = useT();
  const errorText = useErrorText();
  const [runs, setRuns] = useState<RoutineRun[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [openActions, setOpenActions] = useState<number | null>(null);
  const order = useRef(replyOrder());
  const routineId = routine.id;

  const read = useCallback(async () => {
    if (typeof document !== "undefined" && document.hidden) return;
    const id = order.current.start();
    try {
      const list = await api.listRoutineRuns(routineId);
      if (order.current.settle(id)) { setRuns(list); setLoadError(null); }
    } catch (err) {
      if (order.current.settle(id)) setLoadError(errorText(err, "routines.runs.failed"));
    }
  }, [routineId, errorText]);

  // Read at once, and again whenever the routine's latest run changes (Run now, a new occurrence).
  const latestKey = routine.latest_run ? `${routine.latest_run.id}:${routine.latest_run.state}` : "none";
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void read();
  }, [read, latestKey]);

  const active = anyRunActive(runs);
  useEffect(() => pollAfterSettle(read, active ? ACTIVE_EVERY_MS : IDLE_EVERY_MS), [read, active]);

  if (loadError && runs === null) {
    return (
      <Banner tone="danger" action={<Button onClick={() => { setLoadError(null); void read(); }}>{t("routines.retry")}</Button>}>
        {loadError}
      </Banner>
    );
  }
  if (runs === null) return <SkeletonList rows={3} />;
  if (runs.length === 0) {
    return <EmptyState compact icon={<History size={20} strokeWidth={1.7} />} title={t("routines.runs.emptyTitle")} description={t("routines.runs.emptyBody")} />;
  }
  return (
    <div className="flex flex-col gap-3">
      {loadError && <Banner tone="danger" onDismiss={() => setLoadError(null)}>{loadError}</Banner>}
      <ul aria-label={t("routines.runs.list", { name: routine.name })} className="flex flex-col divide-y divide-line">
        {runs.map((run) => (
          <RunRow
            key={run.id}
            run={run}
            routine={routine}
            actionsOpen={openActions === run.id}
            onToggleActions={() => setOpenActions((current) => (current === run.id ? null : run.id))}
          />
        ))}
      </ul>
    </div>
  );
}

function RunRow({ run, routine, actionsOpen, onToggleActions }: { run: RoutineRun; routine: Routine; actionsOpen: boolean; onToggleActions: () => void }) {
  const t = useT();
  const locale = useLocale();
  const words = runStateWords(run.state);
  const outcome = runOutcomeKey(run.outcome);
  const worked = runWorkSeconds(run);
  const facts = [
    t(runTriggerKey(run.trigger)),
    run.attempt > 1 ? t("routines.run.attempt", { n: run.attempt }) : "",
    formatMoment(runMoment(run), locale, routine.timezone || undefined),
  ].filter(Boolean);
  const details = [
    outcome ? t(outcome) : "",
    worked !== null ? t("routines.run.took", { duration: formatDuration(worked, locale) }) : "",
    run.waited_seconds > 0 ? t("routines.run.waited", { duration: formatDuration(run.waited_seconds, locale) }) : "",
  ].filter(Boolean);
  const actionsId = `routine-run-${run.id}-actions`;
  return (
    <li className="flex min-w-0 flex-col gap-1.5 py-3 first:pt-0">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <StatusText status={words.tone}>{t(words.key)}</StatusText>
        <span className="text-small text-muted">{facts.join(" · ")}</span>
      </div>
      {details.length > 0 && <p className="text-small text-muted">{details.join(" · ")}</p>}
      {run.error && <p className="line-clamp-3 whitespace-pre-wrap break-words text-small text-danger">{run.error}</p>}
      {run.result && (
        <p className="line-clamp-3 whitespace-pre-wrap break-words text-small text-muted">
          {run.error ? t("routines.run.partial", { text: run.result }) : run.result}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {run.thread_id !== null && (
          <Link href={`/chat/?thread=${run.thread_id}`} className="inline-flex items-center text-small text-accent-text underline-offset-2 hover:underline touch:min-h-11">
            {t("agentAutomation.run.openConversation")}
          </Link>
        )}
        <button
          type="button"
          aria-expanded={actionsOpen}
          aria-controls={actionsId}
          onClick={onToggleActions}
          className="inline-flex cursor-pointer items-center text-small text-accent-text underline-offset-2 hover:underline touch:min-h-11"
        >
          {actionsOpen ? t("routines.run.hideAppActions") : t("routines.run.appActions")}
        </button>
      </div>
      {actionsOpen && <RunAppActions id={actionsId} routineId={routine.id} runId={run.id} />}
    </li>
  );
}

function RunAppActions({ id, routineId, runId }: { id: string; routineId: number; runId: number }) {
  const t = useT();
  const errorText = useErrorText();
  const [actions, setActions] = useState<RoutineAppAction[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    api.listRoutineRunAppActions(routineId, runId)
      .then((items) => { if (live) setActions(items); })
      .catch((err: unknown) => { if (live) setError(errorText(err, "routines.run.appActionsFailed")); });
    return () => { live = false; };
  }, [routineId, runId, errorText]);
  return (
    <div id={id} className="mt-1 flex flex-col gap-2 rounded-field bg-inset p-3">
      <p className="text-small text-muted">{t("knowledgeRoutines.appActionsUndoWarning")}</p>
      {error ? (
        <p role="alert" className="text-small text-danger">{error}</p>
      ) : actions === null ? (
        <p role="status" className="text-small text-muted">{t("routines.run.appActionsLoading")}</p>
      ) : actions.length === 0 ? (
        <p className="text-small text-muted">{t("routines.run.appActionsEmpty")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {actions.map((action) => {
            const words = appActionWords(action.status);
            return (
              <li key={action.id} className="flex min-w-0 flex-col gap-1 rounded-field border border-line bg-raised p-2.5">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="min-w-0 break-all font-mono text-small text-ink">{action.tool}</span>
                  <StatusText status={words.tone}>{t(words.key)}</StatusText>
                </div>
                <p className="break-all text-small text-muted">
                  {t("routines.run.account", { id: action.account_id })}
                  {action.code ? <> · <span className="font-mono">{action.code}</span></> : null}
                </p>
                {action.result && (
                  <pre className="whitespace-pre-wrap break-all rounded-inner bg-inset p-2 font-mono text-small text-muted">{JSON.stringify(action.result, null, 2)}</pre>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
