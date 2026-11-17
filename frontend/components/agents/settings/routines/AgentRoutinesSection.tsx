"use client";

// One agent's routines: name, schedule in words, state, the last run and what it came to, with
// Run now and Pause/Resume. Editing and creating stay in the Routines view (chat): it can open on
// one routine's runs (?routine=) but not on its editor or with an agent chosen, so the links say
// where they go rather than pretend to open more.
import Link from "next/link";
import { CalendarClock, Plus } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { api, type Agent, type Routine } from "@/lib/api";
import {
  agentRoutines,
  formatMoment,
  nextRunWords,
  routineRunsHref,
  ROUTINES_VIEW_HREF,
  routineState,
  routineStateWords,
  runOutcomeKey,
  runStateWords,
  scheduleWords,
} from "@/lib/agent-automation";
import { browserTimezone, isActiveRun } from "@/lib/routines";
import { useT } from "@/lib/use-i18n";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { LinkButton } from "@/components/ui/LinkButton";
import { SkeletonList } from "@/components/ui/Skeleton";
import { StatusText } from "@/components/ui/StatusPill";
import { Card } from "@/components/ui/Surface";
import { LoadFailed, SectionHeader, useErrorText, useLocale } from "./shared";

// While a run is queued, running or waiting, the list reads again this often (as the Routines view does).
const REFRESH_MS = 5_000;

export function AgentRoutinesSection({ agent }: { agent: Agent }) {
  const t = useT();
  const headingId = useId();
  const errorText = useErrorText();
  const [routines, setRoutines] = useState<Routine[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let live = true;
    api.listRoutines()
      .then((all) => { if (live) { setRoutines(agentRoutines(all, agent.id)); setLoadError(null); } })
      .catch((err: unknown) => { if (live) setLoadError(errorText(err)); });
    return () => { live = false; };
  }, [agent.id, tick, errorText]);

  const running = routines?.some((routine) => isActiveRun(routine.latest_run)) ?? false;
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setTick((n) => n + 1), REFRESH_MS);
    return () => clearInterval(timer);
  }, [running]);

  const act = async (routine: Routine, work: () => Promise<Routine | unknown>) => {
    setBusy(routine.id);
    setActionError(null);
    try {
      const result = await work();
      // Pause and Resume answer with the routine itself: show it straight away.
      if (result && typeof result === "object" && "schedule_kind" in result) {
        const next = result as Routine;
        setRoutines((current) => current?.map((item) => (item.id === next.id ? next : item)) ?? current);
      }
    } catch (err) {
      setActionError(t("agentAutomation.routines.actionFailed", { name: routine.name, reason: errorText(err) }));
    } finally {
      setBusy(null);
      setTick((n) => n + 1);
    }
  };

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <SectionHeader
        id={headingId}
        title={t("agentAutomation.routines.title")}
        subtitle={t("agentAutomation.routines.subtitle", { name: agent.name })}
        action={
          <LinkButton href={ROUTINES_VIEW_HREF} icon={<Plus size={15} />}>
            {t("agentAutomation.routines.new")}
          </LinkButton>
        }
      />
      <p className="text-small text-muted">{t("agentAutomation.routines.whereToEdit", { name: agent.name })}</p>
      {actionError && <Banner tone="danger" onDismiss={() => setActionError(null)}>{actionError}</Banner>}
      {loadError && <LoadFailed message={loadError} onRetry={() => { setLoadError(null); setTick((n) => n + 1); }} />}
      {routines === null ? (
        !loadError && <SkeletonList rows={3} />
      ) : routines.length === 0 ? (
        <Card className="p-0">
          <EmptyState
            icon={<CalendarClock size={22} />}
            title={t("agentAutomation.routines.emptyTitle", { name: agent.name })}
            description={t("agentAutomation.routines.emptyBody", { name: agent.name })}
          />
        </Card>
      ) : (
        <Card className="p-0">
          <ul className="divide-y divide-line">
            {routines.map((routine) => (
              <RoutineRow
                key={routine.id}
                routine={routine}
                busy={busy === routine.id}
                disabled={busy !== null || agent.archived_at !== null}
                onRun={() => void act(routine, () => api.runRoutineNow(routine.id))}
                onPause={(pause) => void act(routine, () => (pause ? api.pauseRoutine(routine.id) : api.resumeRoutine(routine.id)))}
              />
            ))}
          </ul>
        </Card>
      )}
    </section>
  );
}

function RoutineRow({
  routine,
  busy,
  disabled,
  onRun,
  onPause,
}: {
  routine: Routine;
  busy: boolean;
  disabled: boolean;
  onRun: () => void;
  onPause: (pause: boolean) => void;
}) {
  const t = useT();
  const locale = useLocale();
  const state = routineState(routine);
  const stateWords = routineStateWords(state);
  const schedule = scheduleWords(routine, locale, browserTimezone());
  const scheduleText = t(schedule.words.key, schedule.words.params);
  const next = nextRunWords(routine, locale);
  const run = routine.latest_run;
  const active = isActiveRun(run);
  const facts = [
    routine.webhook_enabled ? t("agentAutomation.routine.webhookOn") : "",
    routine.uninterrupted_access ? t("agentAutomation.routine.uninterrupted") : "",
  ].filter(Boolean);

  return (
    <li className="flex flex-col gap-2 px-4 py-3" aria-label={routine.name}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p className="min-w-0 truncate text-label font-medium text-ink">{routine.name}</p>
        <StatusText status={stateWords.tone}>{t(stateWords.key)}</StatusText>
      </div>
      <p className="text-small text-muted">
        {schedule.zone ? t("agentAutomation.schedule.withZone", { schedule: scheduleText, zone: schedule.zone }) : scheduleText}
        {next && <> · {t(next.key, next.params)}</>}
        {facts.length > 0 && <> · {facts.join(" · ")}</>}
      </p>
      {state === "paused" && routine.paused_reason && (
        <p className="text-small text-muted">{t("agentAutomation.routine.pausedReason", { reason: routine.paused_reason })}</p>
      )}
      {state === "finished" && <p className="text-small text-muted">{t("agentAutomation.routine.finishedHint")}</p>}
      {run ? <LastRun run={run} /> : <p className="text-small text-muted">{t("agentAutomation.run.never")}</p>}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button size="sm" onClick={onRun} disabled={disabled || active} loading={busy} title={active ? t("agentAutomation.routine.runInProgress") : undefined}>
          {t("agentAutomation.routine.runNow")}
        </Button>
        {state !== "finished" && (
          <Button size="sm" onClick={() => onPause(state === "on")} disabled={disabled}>
            {state === "on" ? t("agentAutomation.routine.pause") : t("agentAutomation.routine.resume")}
          </Button>
        )}
        <LinkButton size="sm" variant="ghost" href={ROUTINES_VIEW_HREF}>{t("agentAutomation.routine.edit")}</LinkButton>
        <LinkButton size="sm" variant="ghost" href={routineRunsHref(routine.id)}>{t("agentAutomation.routine.allRuns")}</LinkButton>
      </div>
    </li>
  );
}

function LastRun({ run }: { run: NonNullable<Routine["latest_run"]> }) {
  const t = useT();
  const locale = useLocale();
  const words = runStateWords(run.state);
  const outcome = runOutcomeKey(run.outcome);
  const when = formatMoment(run.finished_at ?? run.started_at ?? run.scheduled_for ?? run.created_at, locale);
  const detail = (run.error || run.result || "").trim();
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-small">
        <span className="text-muted">{t("agentAutomation.run.last")}</span>
        <StatusText status={words.tone}>{t(words.key)}</StatusText>
        {when && <span className="text-muted">{when}</span>}
        {outcome && <span className="text-muted">· {t(outcome)}</span>}
        {run.thread_id !== null && (
          <Link href={`/chat/?thread=${run.thread_id}`} className="text-accent-text underline-offset-2 hover:underline">
            {t("agentAutomation.run.openConversation")}
          </Link>
        )}
      </div>
      {detail && <p className="line-clamp-2 whitespace-pre-wrap break-words text-small text-muted">{detail}</p>}
    </div>
  );
}
