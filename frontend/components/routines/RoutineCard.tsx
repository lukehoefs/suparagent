"use client";

// One routine in the list (design: Routines.html): its agent, name, how its last run went (a word
// and a dot), its schedule in words, the next three runs, Run now and the on/off switch. The name
// opens the routine; the whole card is its hit area.
import Link from "next/link";
import { Play } from "lucide-react";
import { useId } from "react";
import type { Agent, Routine } from "@/lib/api";
import { scheduleWords } from "@/lib/agent-automation";
import { browserTimezone, isActiveRun, routineStatus } from "@/lib/routines";
import { canToggle, nextRunsWords, routineCardStatus, type CardAction } from "@/lib/routines-page";
import { useT } from "@/lib/use-i18n";
import { cn } from "@/lib/cn";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { StatusPill } from "@/components/ui/StatusPill";
import { Switch } from "@/components/ui/Switch";
import { useLocale } from "./shared";

export function RoutineCard({
  routine,
  agents,
  selected,
  busy,
  onOpen,
  onRunNow,
  onToggle,
}: {
  routine: Routine;
  agents: Agent[] | null;
  selected: boolean;
  // This card's action in flight: Run now shows it is starting; either one holds both controls.
  busy: CardAction | null;
  onOpen: () => void;
  onRunNow: () => void;
  onToggle: (on: boolean) => void;
}) {
  const t = useT();
  const locale = useLocale();
  const titleId = useId();
  const agent = agents?.find((item) => item.id === routine.agent_id);
  const agentName = agents === null ? null : agent ? (agent.archived_at ? t("routines.agent.archived", { name: agent.name }) : agent.name) : t("routines.agent.missing");
  const status = routineCardStatus(routine);
  const schedule = scheduleWords(routine, locale, browserTimezone());
  const scheduleText = t(schedule.words.key, schedule.words.params);
  const next = nextRunsWords(routine, locale);
  const on = routineStatus(routine) === "on";
  const run = routine.latest_run;
  const active = isActiveRun(run);
  const toggleable = canToggle(routine);
  const facts = [
    agentName ?? "",
    schedule.zone ? t("agentAutomation.schedule.withZone", { schedule: scheduleText, zone: schedule.zone }) : scheduleText,
    routine.webhook_enabled ? t("agentAutomation.routine.webhookOn") : "",
  ].filter(Boolean);

  return (
    <article
      aria-labelledby={titleId}
      className={cn(
        "relative flex flex-wrap items-center gap-x-3.5 gap-y-3 rounded-card border bg-raised px-4 py-3.5 transition-colors duration-(--dur-fast)",
        selected ? "border-accent" : "border-line hover:border-line-strong",
      )}
    >
      <Avatar agentId={routine.agent_id} name={agent?.name ?? null} size="md" />
      <div className="flex min-w-0 flex-[1_1_240px] flex-col gap-0.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h3 id={titleId} className="min-w-0 text-body font-semibold text-ink">
            <button
              type="button"
              onClick={onOpen}
              data-routine-open=""
              aria-current={selected ? "true" : undefined}
              className="cursor-pointer text-left [overflow-wrap:anywhere] after:absolute after:inset-0 after:rounded-card after:content-[''] hover:underline focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-focus"
            >
              {routine.name}
            </button>
          </h3>
          <StatusPill status={status.tone}>{t(status.key)}</StatusPill>
        </div>
        <p className="text-label text-muted [overflow-wrap:anywhere]">{facts.join(" · ")}</p>
        {next && <p className="text-small text-muted">{t(next.key, next.params)}</p>}
        {routine.paused_reason && routineStatus(routine) === "off" && (
          <p className="text-small text-muted">{t("agentAutomation.routine.pausedReason", { reason: routine.paused_reason })}</p>
        )}
        {run?.state === "needs_input" && run.thread_id !== null && (
          <Link
            href={`/chat/?thread=${run.thread_id}`}
            className="relative z-10 inline-flex self-start items-center text-small font-medium text-accent-text underline-offset-2 hover:underline touch:min-h-11"
          >
            {t("routines.card.answer")}
          </Link>
        )}
      </div>
      <div className="relative z-10 flex items-center gap-2.5">
        <Button
          icon={<Play size={15} aria-hidden="true" />}
          onClick={onRunNow}
          disabled={active || busy !== null}
          loading={busy === "run"}
          title={active ? t("agentAutomation.routine.runInProgress") : undefined}
        >
          {t("agentAutomation.routine.runNow")}
        </Button>
        <span title={toggleable ? undefined : t("routines.card.finished")} className="inline-flex">
          <Switch
            checked={on}
            onChange={onToggle}
            disabled={busy !== null || !toggleable}
            label={on ? t("routines.card.pause", { name: routine.name }) : t("routines.card.resume", { name: routine.name })}
            className="touch:before:absolute touch:before:-inset-2.5 touch:before:content-['']"
          />
        </span>
      </div>
    </article>
  );
}
