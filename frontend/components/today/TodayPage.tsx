"use client";

// The Today page, the home (design: Today.html; phone: MobileToday.html), inside the app shell:
// what waits for you, what is running, today's routine results and due tasks, this month and
// today's events, and the latest activity. Every row links to where it lives. Owner and admin
// only, like the Today brief it reads.
import { RefreshCw, Sun } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, type AppNotification, type Routine } from "@/lib/api";
import { cn } from "@/lib/cn";
import { planner, type WorkItem } from "@/lib/planner-api";
import { reportPresence } from "@/lib/presence";
import { profileApi } from "@/lib/profile";
import { todayApi, type TodayRuns } from "@/lib/today-api";
import {
  calendarRows, dayKey, firstName, greeting, routineResults, runningItems, runsCoverToday, waitingItems, zonedParts,
  type RunningTurn, type TodayBrief,
} from "@/lib/today";
import { useT } from "@/lib/use-i18n";
import { useSession } from "@/components/AuthGate";
import { useAppShell } from "@/components/shell/AppShell";
import { EmptyState } from "@/components/ui/EmptyState";
import { IconButton } from "@/components/ui/IconButton";
import { LinkButton } from "@/components/ui/LinkButton";
import { Card } from "@/components/ui/Surface";
import { ActivityCard } from "./ActivityCard";
import { CalendarCard } from "./CalendarCard";
import { DueTasksSection, type TaskBoard } from "./DueTasksSection";
import { RoutineResultsSection } from "./RoutineResultsSection";
import { RunningSection } from "./RunningSection";
import { usePolled } from "./usePolled";
import { useTodayFormat } from "./useTodayFormat";
import { WaitingSection } from "./WaitingSection";

// How often each part is read again while the tab shows. What runs changes fastest.
const RUNNING_EVERY_MS = 15_000;
const EVERY_MS = 60_000;
const ACTIVITY_SHOWN = 5;

export function TodayPage() {
  const t = useT();
  const { isAdmin } = useAppShell();
  return (
    <div className="flex flex-col gap-4 px-4 pb-10 pt-5 sm:gap-6 sm:px-8 sm:pt-7">
      {isAdmin ? <Today /> : (
        <>
          <Greeting refreshing={false} onRefresh={null} />
          <Card>
            <EmptyState
              icon={<Sun size={24} strokeWidth={1.7} />}
              title={t("today.adminOnly.title")}
              description={t("today.adminOnly.body")}
              action={<LinkButton href="/chat/">{t("today.openChats")}</LinkButton>}
            />
          </Card>
        </>
      )}
    </div>
  );
}

// The wall clock, read again every minute (the greeting, "today" and what is overdue follow it).
function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

function Greeting({ refreshing, onRefresh }: { refreshing: boolean; onRefresh: (() => void) | null }) {
  const t = useT();
  const format = useTodayFormat();
  const now = useNow();
  const { session } = useSession();
  const { isAdmin } = useAppShell();
  const [profileName, setProfileName] = useState<string | null>(null);
  const own = session?.display_name?.trim() || null;
  // A signed-in member has a name on the session; the owner's is in their profile.
  useEffect(() => {
    if (own || !isAdmin) return;
    let alive = true;
    profileApi.getProfile().then((profile) => { if (alive) setProfileName(profile.name?.trim() || null); }).catch(() => undefined);
    return () => { alive = false; };
  }, [own, isAdmin]);
  const hello = greeting(zonedParts(now, format.timeZone).hour, firstName(own ?? profileName));
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {/* 24 px at 1.5, as the design sets it. */}
        <h1 className="text-h1 font-semibold tracking-[-0.02em] text-ink">{t(hello.key, hello.params)}</h1>
        <p className="mt-0.5 text-body text-muted sm:mt-1">
          <time dateTime={dayKey(now, format.timeZone) ?? undefined}>{format.longDate(now)}</time>
        </p>
      </div>
      {/* Quiet chrome: the design's header has no actions, and every part is read again on its
          own every 15 to 60 seconds. This one also re-reads connected apps now. */}
      {onRefresh && (
        <IconButton
          label={refreshing ? t("common.refreshing") : t("common.refresh")}
          aria-busy={refreshing || undefined}
          onClick={() => { if (!refreshing) onRefresh(); }}
          className="max-sm:size-11"
        >
          <RefreshCw size={16} strokeWidth={1.7} aria-hidden="true" className={cn(refreshing && "motion-safe:animate-spin")} />
        </IconButton>
      )}
    </header>
  );
}

function Today() {
  const format = useTodayFormat();
  const now = useNow();
  const { agents } = useAppShell();
  const [tick, setTick] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  // The next brief read re-reads connected apps (the Refresh button).
  const freshApps = useRef(false);

  // The person is here: the server keeps their time zone and writes the day's card in the lead's
  // chat, as opening the chat does. Where the card is does not matter here; this page shows it.
  useEffect(() => {
    const ping = () => {
      if (document.visibilityState === "hidden") return;
      reportPresence().catch(() => undefined);
    };
    ping();
    document.addEventListener("visibilitychange", ping);
    return () => document.removeEventListener("visibilitychange", ping);
  }, []);

  const running = usePolled<RunningTurn[]>(todayApi.running, RUNNING_EVERY_MS, true, tick);
  const brief = usePolled<TodayBrief>(() => {
    const refresh = freshApps.current;
    freshApps.current = false;
    const read = todayApi.brief(refresh);
    return refresh ? read.finally(() => setRefreshing(false)) : read;
  }, EVERY_MS, true, tick);
  const routines = usePolled<Routine[]>(api.listRoutines, EVERY_MS, true, tick);
  // A short page of runs, and the long one only when the short one may not reach back to today.
  const today = dayKey(now, format.timeZone) ?? "";
  const runs = usePolled<TodayRuns>(() => todayApi.todayRuns(today, format.timeZone), EVERY_MS, true, tick);
  const board = usePolled<TaskBoard>(async () => {
    const found = await planner.board();
    return { board: found, items: await planner.items(found.id) };
  }, EVERY_MS, true, tick);
  const activity = usePolled<AppNotification[]>(() => api.listNotifications(ACTIVITY_SHOWN), EVERY_MS, true, tick);

  // Refresh: everything at once, the brief with fresh app data; the button spins until the brief is in.
  const refresh = useCallback(() => {
    freshApps.current = true;
    setRefreshing(true);
    setTick((n) => n + 1);
  }, []);
  const names = useMemo(() => new Map((agents ?? []).map((agent) => [agent.id, agent.name])), [agents]);
  const agentName = useCallback((id: number | null) => (id === null ? null : names.get(id) ?? null), [names]);

  const waiting = waitingItems(running.data, brief.data?.items ?? null);
  // The calls that wait come from what is running; without that, from the brief.
  const waitingLoading = (running.data === null && !running.failed) || (brief.data === null && !brief.failed);
  const runList = runs.data?.runs ?? null;
  const results = routineResults(runList, routines.data, today, format.timeZone);
  const runsPartial = runs.data && !runsCoverToday(runs.data.runs, runs.data.limit, today, format.timeZone) ? runs.data.limit : null;
  const events = calendarRows(brief.data?.items ?? null);

  const setBoard = board.set;
  const onTaskSaved = useCallback((saved: WorkItem) => {
    setBoard((current) => current && { ...current, items: current.items.map((item) => (item.id === saved.id ? saved : item)) });
  }, [setBoard]);

  return (
    <>
      <Greeting refreshing={refreshing} onRefresh={refresh} />
      <div className="flex flex-wrap items-start gap-4 sm:gap-6">
        {/* The cards of a row stretch to one height, so the next row starts under the taller. */}
        <div className="grid min-w-0 flex-[999_1_520px] grid-cols-[repeat(auto-fill,minmax(min(340px,100%),1fr))] gap-4">
          <WaitingSection
            items={waiting}
            loading={waitingLoading}
            // Each read separately: engines, questions and routines come from the brief alone,
            // so nothing is said to be clear unless both were read.
            runningFailed={running.failed && running.data === null}
            briefFailed={brief.failed && brief.data === null}
            more={brief.data?.more ?? 0}
            agentName={agentName}
            onAnswered={() => { running.reload(); brief.reload(); }}
          />
          <RunningSection
            items={runningItems(running.data, runList, routines.data, board.data?.items ?? null)}
            loading={running.data === null && !running.failed}
            failed={running.failed}
            agentName={agentName}
            format={format}
          />
          <RoutineResultsSection
            results={results}
            loading={(runs.data === null && !runs.failed) || (routines.data === null && !routines.failed)}
            failed={runs.failed || routines.failed}
            partialLimit={runsPartial}
            agentName={agentName}
            format={format}
          />
          <DueTasksSection
            data={board.data}
            loading={board.data === null && !board.failed}
            failed={board.failed}
            now={now}
            format={format}
            onSaved={onTaskSaved}
            reload={board.reload}
          />
        </div>
        <aside className="flex min-w-0 flex-[1_1_260px] flex-col gap-4 lg:max-w-[320px]">
          <CalendarCard now={now} format={format} events={events} source={brief.data?.sources?.calendar} />
          <ActivityCard
            items={activity.data}
            loading={activity.data === null && !activity.failed}
            failed={activity.failed}
            now={now}
            format={format}
            onRead={activity.reload}
          />
        </aside>
      </div>
    </>
  );
}
