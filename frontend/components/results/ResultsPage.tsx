"use client";

// The Results page (design: Results.html): what agents produced, in one list with the selected
// result beside it. Built from existing reads only: the task board (GET /planner/board and
// /planner/items), routine runs (GET /routines and /routines/runs) and delegated team work
// (GET /team/jobs). Owner and admin only, like the board and routines.
import { FileText, Search } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, ApiError, type PortalClient, type Routine, type RoutineRun } from "@/lib/api";
import { chatPath } from "@/lib/chat-link";
import type { TeamJob } from "@/lib/collaboration";
import { planner, type WorkBoard, type WorkItem } from "@/lib/planner-api";
import { resultsApi } from "@/lib/results-api";
import {
  agentsWithResults,
  filterRows,
  jobRows,
  parseFilter,
  routineRows,
  sortRows,
  taskRows,
  type ResultFilter,
  type ResultRow,
} from "@/lib/results";
import { useT } from "@/lib/use-i18n";
import { useAppShell, useLeaveGuard } from "@/components/shell/AppShell";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input, Select } from "@/components/ui/Input";
import { LinkButton } from "@/components/ui/LinkButton";
import { Skeleton } from "@/components/ui/Skeleton";
import { Card } from "@/components/ui/Surface";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import { ResultDetail, type AskState } from "./ResultDetail";
import { ResultList } from "./ResultList";
import { useResultLabels } from "./labels";

// Routine runs and jobs change while agents work; the board is edited elsewhere too.
const READ_EVERY_MS = 30_000;

type Source = "tasks" | "routines" | "jobs";
type Errors = Record<Source, string | null>;
const NO_ERRORS: Errors = { tasks: null, routines: null, jobs: null };

// An open "Ask for changes" form, with the result it was opened on (shown from here if a read
// takes that result off the list while the request is still unsent).
type Ask = AskState & { row: ResultRow };

// The design's four type chips. Tasks are listed under All and Needs review; the rows' status
// pills already count what needs review, so the chip carries no number.
const FILTERS: { value: ResultFilter; key: string }[] = [
  { value: "all", key: "results.filter.all" },
  { value: "review", key: "results.filter.review" },
  { value: "routines", key: "results.filter.routines" },
  { value: "chats", key: "results.filter.chats" },
];

const CHIP = "h-[30px] cursor-pointer rounded-full border px-3 text-small font-medium transition-colors duration-(--dur-fast) touch:h-touch";
const CHIP_ON = "border-accent bg-accent-bg text-accent-text";
const CHIP_OFF = "border-line-strong bg-raised text-muted hover:bg-hover hover:text-ink";

export function ResultsPage() {
  const t = useT();
  const { isAdmin } = useAppShell();
  return (
    <div className="flex flex-col gap-6 px-4 pb-10 pt-5 sm:px-8 sm:pt-7">
      {isAdmin ? <Results /> : (
        <>
          <Header />
          <Card><EmptyState icon={<FileText size={24} strokeWidth={1.7} />} title={t("results.adminOnly.title")} description={t("results.adminOnly.body")} /></Card>
        </>
      )}
    </div>
  );
}

function Header({ search }: { search?: ReactNode }) {
  const t = useT();
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-h1 font-semibold tracking-[-0.02em] text-ink">{t("results.title")}</h1>
        <p className="mt-1 text-body text-muted">{t("results.subtitle")}</p>
      </div>
      {search ? <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">{search}</div> : null}
    </header>
  );
}

// An answer that says this backend does not offer the read (an older version): nothing to show.
const notOffered = (err: unknown) => err instanceof ApiError && err.status === 404;
const messageOf = (err: unknown) => (err instanceof Error && err.message ? err.message : null);

function Results() {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const params = useSearchParams();
  const { agents, team } = useAppShell();
  const labels = useResultLabels();

  const [tasks, setTasks] = useState<{ board: WorkBoard; items: WorkItem[] } | null>(null);
  // `at`: when the runs were read, so a queued retry counts as under way only once it is due.
  const [routines, setRoutines] = useState<{ routines: Routine[]; runs: RoutineRun[]; at: number } | null>(null);
  const [jobs, setJobs] = useState<TeamJob[] | null>(null);
  const [errors, setErrors] = useState<Errors>(NO_ERRORS);
  const [loaded, setLoaded] = useState(false);
  const [tick, setTick] = useState(0);
  const [clients, setClients] = useState<PortalClient[]>([]);

  // ?filter= opens the page on one filter (resultsHref); a new address sets it again.
  const filterParam = params.get("filter");
  const [filterFrom, setFilterFrom] = useState(filterParam);
  const [filter, setFilter] = useState<ResultFilter>(() => parseFilter(filterParam));
  if (filterFrom !== filterParam) {
    setFilterFrom(filterParam);
    setFilter(parseFilter(filterParam));
  }
  const [query, setQuery] = useState("");
  const [agentId, setAgentId] = useState("");
  const [clientId, setClientId] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  // The "Ask for changes" forms by result key: picking another result, a filter or a read that
  // moves the task keeps the typed request.
  const [asks, setAsks] = useState<ReadonlyMap<string, Ask>>(() => new Map());
  const asksRef = useRef(asks);
  useEffect(() => { asksRef.current = asks; }, [asks]);
  // A request that finished sending after its result was no longer shown: where the answer will be.
  const [sent, setSent] = useState<{ title: string; threadId: number } | null>(null);
  // Sent from the result shown: its conversation opens once nothing is left unsent.
  const [opening, setOpening] = useState<number | null>(null);
  // Bumped after Approve, whose buttons then go away: the focus moves to the shown result's heading.
  const [focusTick, setFocusTick] = useState(0);
  // The result whose panel is shown, read when a send finishes.
  const shownKey = useRef<string | null>(null);

  // Bumped by every change made here, so a read that started before it cannot put the old board back.
  const taskVersion = useRef(0);
  const listRef = useRef<HTMLElement>(null);
  const detailRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  // Bumped by each pick, so picking the result already shown still goes to it on a phone.
  const [picked, setPicked] = useState(0);
  // The board is read once (GET /planner/board makes it on first use); its columns are fixed.
  const boardRef = useRef<WorkBoard | null>(null);

  const reload = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    let alive = true;
    // One read at a time; a retry starts a new effect, whose first read runs at once.
    let busy = false;
    const read = async () => {
      if (document.hidden || busy) return;
      busy = true;
      const version = taskVersion.current;
      const readTasks = async () => {
        const board = boardRef.current ?? await planner.board();
        boardRef.current = board;
        try {
          return { board, items: await planner.items(board.id) };
        } catch (err) {
          // The board is gone (404): read it again next time.
          if (notOffered(err)) boardRef.current = null;
          throw err;
        }
      };
      const [taskResult, routineResult, jobResult] = await Promise.allSettled([
        readTasks(),
        Promise.all([api.listRoutines(), resultsApi.routineRuns()]).then(([list, runs]) => ({ routines: list, runs, at: Date.now() })),
        resultsApi.teamJobs(),
      ]);
      busy = false;
      if (!alive) return;
      const next: Errors = { ...NO_ERRORS };
      if (taskResult.status === "fulfilled") {
        if (version === taskVersion.current) setTasks(taskResult.value);
      } else if (!notOffered(taskResult.reason)) next.tasks = messageOf(taskResult.reason) ?? t("results.failed.tasks");
      if (routineResult.status === "fulfilled") setRoutines(routineResult.value);
      else if (!notOffered(routineResult.reason)) next.routines = messageOf(routineResult.reason) ?? t("results.failed.routines");
      if (jobResult.status === "fulfilled") setJobs(jobResult.value);
      else if (!notOffered(jobResult.reason)) next.jobs = messageOf(jobResult.reason) ?? t("results.failed.jobs");
      setErrors(next);
      setLoaded(true);
    };
    void read();
    const timer = window.setInterval(() => void read(), READ_EVERY_MS);
    const onVisible = () => void read();
    document.addEventListener("visibilitychange", onVisible);
    return () => { alive = false; window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [tick, t]);

  // Clients (GET /clients) only narrow the list by their agents; without them the filter is left out.
  useEffect(() => {
    let alive = true;
    api.getClients().then((value) => { if (alive) setClients(value.clients); }).catch(() => { if (alive) setClients([]); });
    return () => { alive = false; };
  }, []);

  const rows = useMemo(() => sortRows([
    ...(tasks ? taskRows(tasks.board, tasks.items, team?.team) : []),
    ...(routines ? routineRows(routines.routines, routines.runs, routines.at) : []),
    ...(jobs ? jobRows(jobs) : []),
  ]), [tasks, routines, jobs, team]);

  const client = clients.find((item) => item.id === clientId) ?? null;
  const clientAgentIds = useMemo(() => (client ? new Set(client.agent_ids) : null), [client]);
  const chosenAgent = agentId ? Number(agentId) : null;
  // Agents with results; the chosen one stays listed after its last result is gone, so the
  // filter never reads "All agents" while it narrows the list.
  const agentChoices = useMemo(() => {
    const withResults = agentsWithResults(rows, agents ?? []);
    const chosen = withResults.some((agent) => agent.id === chosenAgent) ? [] : (agents ?? []).filter((agent) => agent.id === chosenAgent);
    return [...withResults, ...chosen];
  }, [rows, agents, chosenAgent]);
  const visible = useMemo(
    () => filterRows(rows, { filter, agentId: chosenAgent, clientAgentIds, query, labelOf: labels.agentOf }),
    [rows, filter, chosenAgent, clientAgentIds, query, labels.agentOf],
  );
  const rowKeys = useMemo(() => new Set(rows.map((row) => row.key)), [rows]);
  // The picked result stays shown while it holds an unsent request, even when a filter hides it
  // or a read takes it off the list (then from the copy kept with the request).
  const held = selectedKey !== null ? asks.get(selectedKey) ?? null : null;
  const holding = held !== null && (held.sending || held.draft.trim() !== "");
  const selected = visible.find((row) => row.key === selectedKey)
    ?? (held && holding ? rows.find((row) => row.key === held.row.key) ?? held.row : null)
    ?? visible[0]
    ?? null;
  const selectedGone = selected !== null && !rowKeys.has(selected.key);
  const filtered = filter !== "all" || query.trim() !== "" || agentId !== "" || clientId !== "";

  // An unsent request asks before leaving the page. One whose result is gone and not shown can
  // no longer be opened, so it does not hold the page.
  const unsent = useMemo(
    () => [...asks].some(([key, ask]) => ask.draft.trim() !== "" && (rowKeys.has(key) || key === selected?.key)),
    [asks, rowKeys, selected],
  );
  useLeaveGuard(unsent);

  useEffect(() => { shownKey.current = selected?.key ?? null; });

  // Sent from the result shown: open the conversation once the request is no longer unsent.
  useEffect(() => {
    if (opening !== null && !unsent) router.push(chatPath({ kind: "thread", id: opening }));
  }, [opening, unsent, router]);

  useEffect(() => {
    if (focusTick > 0) headingRef.current?.focus({ preventScroll: true });
  }, [focusTick]);

  // On a narrow screen the result sits under the list: once picked, go to it. Side by side, the
  // focus stays in the list.
  useEffect(() => {
    if (picked === 0) return;
    const list = listRef.current?.getBoundingClientRect();
    const detail = detailRef.current?.getBoundingClientRect();
    if (!list || !detail || detail.top <= list.top + 8) return;
    detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    headingRef.current?.focus({ preventScroll: true });
  }, [picked]);

  const pick = (row: ResultRow) => {
    setSelectedKey(row.key);
    setPicked((n) => n + 1);
  };

  const onTaskSaved = (item: WorkItem) => {
    taskVersion.current += 1;
    setTasks((current) => (current ? { ...current, items: current.items.map((entry) => (entry.id === item.id ? item : entry)) } : current));
    // Approve and Ask for changes go away (the result is done, or it left the list and another
    // one is shown): keep the focus in the panel instead of dropping it to the page.
    setFocusTick((n) => n + 1);
  };

  // A string opens the form or sets its text (and clears its error); null closes it.
  const changeAsk = (row: ResultRow, draft: string | null) => {
    setAsks((current) => {
      const next = new Map(current);
      if (draft === null) next.delete(row.key);
      else next.set(row.key, { row, draft, sending: current.get(row.key)?.sending ?? false, error: null });
      return next;
    });
  };

  // Posted from here, not from the panel, so a request still lands (and says so) when the panel
  // closes or shows another result while it is on its way.
  const sendChanges = async (row: ResultRow) => {
    const ask = asksRef.current.get(row.key);
    const request = ask?.draft.trim() ?? "";
    if (!ask || ask.sending || !request || row.threadId === null) return;
    const threadId = row.threadId;
    const patch = (change: Partial<AskState>) => setAsks((current) => {
      const entry = current.get(row.key);
      return entry ? new Map(current).set(row.key, { ...entry, ...change }) : current;
    });
    patch({ sending: true, error: null });
    try {
      await api.sendTurn(threadId, t("results.changesMessage", { title: row.title, request }));
    } catch (err) {
      patch({ sending: false, error: err instanceof ApiError && err.code === "turn_running" ? t("results.busy") : messageOf(err) ?? t("results.actionFailed") });
      // The request is kept with its error; say so when its panel is not the one shown.
      if (shownKey.current !== row.key) toast(t("results.changesNotSent", { title: row.title }), "danger");
      return;
    }
    const othersUnsent = [...asksRef.current].some(([key, entry]) => key !== row.key && entry.draft.trim() !== "");
    setAsks((current) => {
      const next = new Map(current);
      next.delete(row.key);
      return next;
    });
    // Its conversation opens when its result is still shown and nothing else is unsent; otherwise
    // a note says it was sent and links to the conversation.
    if (shownKey.current === row.key && !othersUnsent) setOpening(threadId);
    else setSent({ title: row.title, threadId });
  };

  const clearFilters = () => {
    setFilter("all");
    setQuery("");
    setAgentId("");
    setClientId("");
  };

  const failed = (Object.keys(errors) as Source[]).filter((source) => errors[source] !== null);
  const doneColumn = tasks?.board.columns.find((column) => column.key === "done")?.id ?? null;

  const search = (
    <div className="relative w-full sm:w-60">
      <Search size={15} strokeWidth={1.7} aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
      <Input type="search" value={query} onChange={(event) => setQuery(event.target.value)} aria-label={t("results.search")} placeholder={t("results.search")} className="pl-8" />
    </div>
  );

  // The agent and client menus look like the chips beside them (design: plain chips, no chevron);
  // they still open their menu and say so to assistive tech.
  const pill = (active: boolean) => cn("h-[30px] w-fit rounded-full px-3 text-small font-medium touch:h-touch", active ? CHIP_ON : CHIP_OFF);

  let content;
  if (!loaded) {
    content = (
      <Card role="status" className="flex flex-col gap-3">
        <span className="sr-only">{t("results.loading")}</span>
        {[0, 1, 2, 3].map((key) => (
          <div key={key} className="flex items-center gap-3">
            <Skeleton className="size-5 rounded-full" />
            <div className="flex flex-1 flex-col gap-1.5">
              <Skeleton className="h-4 w-48 max-w-full" />
              <Skeleton className="h-3 w-32 max-w-full" />
            </div>
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
        ))}
      </Card>
    );
  } else {
    // Nothing listed: "Nothing yet" only when every source was read (a failed one is not empty,
    // its banner says so), else no match for the filters.
    const empty = rows.length === 0
      ? (failed.length === 0 ? <EmptyState icon={<FileText size={24} strokeWidth={1.7} />} title={t("results.empty.title")} description={t("results.empty.body")} /> : null)
      : (
        <EmptyState
          icon={<Search size={24} strokeWidth={1.7} />}
          title={t("results.noMatch.title")}
          description={t("results.noMatch.body")}
          action={<Button onClick={clearFilters}>{t("results.clearFilters")}</Button>}
        />
      );
    if (selected === null) content = empty ? <Card>{empty}</Card> : null;
    else {
      content = (
        <div className="flex flex-wrap items-start gap-6">
          {visible.length > 0 ? (
            <ResultList ref={listRef} rows={visible} selectedKey={selected.key} onPick={pick} detailId="result-detail" />
          ) : empty ? (
            <Card className="min-w-0 flex-[999_1_460px]">{empty}</Card>
          ) : null}
          <ResultDetail
            key={selected.key}
            ref={detailRef}
            headingRef={headingRef}
            id="result-detail"
            row={selected}
            doneColumnId={doneColumn}
            task={selected.taskId !== null ? tasks?.items.find((item) => item.id === selected.taskId) ?? null : null}
            gone={selectedGone}
            ask={asks.get(selected.key) ?? null}
            onAskChange={(draft) => changeAsk(selected, draft)}
            onSend={() => void sendChanges(selected)}
            onTaskSaved={onTaskSaved}
            onStale={reload}
          />
        </div>
      );
    }
  }

  return (
    <>
      <Header search={loaded && rows.length > 0 ? search : undefined} />
      {failed.map((source) => (
        <Banner key={source} tone="danger" title={t(`results.failed.${source}`)} action={<Button size="sm" onClick={reload}>{t("results.retry")}</Button>}>
          {errors[source] !== t(`results.failed.${source}`) ? errors[source] : null}
        </Banner>
      ))}
      {sent ? (
        <Banner
          tone="success"
          title={t("results.changesSent", { title: sent.title })}
          onDismiss={() => setSent(null)}
          action={<LinkButton size="sm" href={chatPath({ kind: "thread", id: sent.threadId })}>{t("results.openChat")}</LinkButton>}
        />
      ) : null}
      {loaded && rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label={t("results.filters")} className="flex flex-wrap gap-2">
            {FILTERS.map(({ value, key }) => (
              <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)} className={cn(CHIP, filter === value ? CHIP_ON : CHIP_OFF)}>
                {t(key)}
              </button>
            ))}
          </div>
          {agentChoices.length > 1 || clients.length > 0 ? <span aria-hidden="true" className="hidden h-[30px] w-px bg-line sm:block" /> : null}
          {agentChoices.length > 1 || agentId !== "" ? (
            <Select
              aria-label={t("results.filterByAgent")}
              value={agentId}
              onChange={(event) => setAgentId(event.target.value)}
              options={[{ value: "", label: t("results.allAgents") }, ...agentChoices.map((agent) => ({ value: String(agent.id), label: agent.name }))]}
              className="w-fit"
              triggerClassName={pill(agentId !== "")}
              chevronClassName="hidden"
            />
          ) : null}
          {clients.length > 0 ? (
            <Select
              aria-label={t("results.filterByClient")}
              value={clientId}
              onChange={(event) => setClientId(event.target.value)}
              options={[{ value: "", label: t("results.allClients") }, ...clients.map((item) => ({ value: item.id, label: item.name }))]}
              className="w-fit"
              triggerClassName={pill(clientId !== "")}
              chevronClassName="hidden"
            />
          ) : null}
          {filtered ? (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="text-muted hover:text-ink">{t("results.clearFilters")}</Button>
          ) : null}
        </div>
      )}
      {content}
    </>
  );
}
