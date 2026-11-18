"use client";

// The Tasks page (design: Tasks.html), inside the app shell: the planner board as four lanes of
// cards over its columns (lib/tasks-board.ts boardLanes). Built on the planner API
// (lib/planner-api.ts) and its editors: WorkItemEditor edits or adds a task, WorkExecutionPanel
// starts, schedules or stops agent work. Moving a card only files it in another column; it never
// starts an agent. Owner and admin only, like the /planner routes.
import { CalendarDays, Plus, Search, SlidersHorizontal, SquareCheck } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { planner, type WorkBoard, type WorkChanges, type WorkColumn, type WorkInput, type WorkItem } from "@/lib/planner-api";
import {
  activeRun, approvalThread, approvalThreads, boardLanes, columnLabelKey, columnTone, displayColumns, groupByColumn, inLane,
  laneCards, matchesFilters, moveCard, parseTaskId, TASKS_HREF, type BoardLane,
} from "@/lib/tasks-board";
import { useT } from "@/lib/use-i18n";
import { useAppShell } from "@/components/shell/AppShell";
import { WorkExecutionPanel } from "@/components/chat/WorkExecutionPanel";
import { WorkItemEditor } from "@/components/chat/WorkItemEditor";
import { Badge } from "@/components/ui/Badge";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { IconButton } from "@/components/ui/IconButton";
import { Input } from "@/components/ui/Input";
import { Menu, MenuItem, MenuLabel, MenuRadioGroup, MenuRadioItem, MenuSeparator, MenuSub } from "@/components/ui/Menu";
import { Skeleton } from "@/components/ui/Skeleton";
import { Card } from "@/components/ui/Surface";
import { useToast } from "@/components/ui/Toast";
import { TASK_DRAG_TYPE, TaskCard, useTakeFocus } from "./TaskCard";

// Cards change from other windows and from agent work; the old planner read them this often too.
const ITEMS_EVERY_MS = 30_000;
const GRID = "grid grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] gap-4";
// The calendar, upcoming list and routine runs stay in the planner dialog on the chat page.
const CALENDAR_HREF = "/chat/?view=planner";

type Editor = { item: WorkItem | null };
type Lane = BoardLane<WorkColumn>;
// Where keyboard focus goes after Move to or Archive from a card's menu: a card's title, or a
// lane's heading when an archived card leaves its lane empty.
type FocusTarget = { kind: "task"; id: number } | { kind: "lane"; key: string } | null;

// True while keyboard focus is inside that card (its title or one of its buttons).
const focusInCard = (id: number) => document.activeElement?.closest(`[data-task-id="${id}"]`) != null;

export function TasksPage() {
  const t = useT();
  const { isAdmin } = useAppShell();
  return (
    <div className="flex flex-col gap-6 px-4 pb-10 pt-5 sm:px-8 sm:pt-7">
      {isAdmin ? <Board /> : (
        <>
          <Header />
          <Card><EmptyState icon={<SquareCheck size={24} />} title={t("tasks.adminOnly.title")} description={t("tasks.adminOnly.body")} /></Card>
        </>
      )}
    </div>
  );
}

// `status`: what the board is showing when it is not every active task (archived, one assignee),
// beside the title, since the choices themselves sit in a menu.
function Header({ children, status }: { children?: ReactNode; status?: ReactNode }) {
  const t = useT();
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <h1 className="text-h1 font-semibold tracking-[-0.02em] text-ink">{t("tasks.title")}</h1>
          {status}
        </div>
        <p className="mt-1 text-body text-muted">{t("tasks.subtitle")}</p>
      </div>
      {children ? <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">{children}</div> : null}
    </header>
  );
}

// The server's own words for a refused request; anything else (the browser's "Failed to fetch") is
// said in the page's language. As routines/shared.tsx useErrorText does.
const errorText = (error: unknown, fallback: string) => (error instanceof ApiError && error.message ? error.message : fallback);

function LaneHeading({ id, focus, onFocused, children }: { id: string; focus: boolean; onFocused: () => void; children: ReactNode }) {
  const ref = useTakeFocus<HTMLHeadingElement>(focus, onFocused);
  // Focusable from script only, for when the last card in the lane was archived from its menu.
  return <h2 ref={ref} id={id} tabIndex={-1} className="truncate text-body font-semibold text-ink">{children}</h2>;
}

function Board() {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const params = useSearchParams();
  const shell = useAppShell();
  const hintId = useId();
  const allAgents = useMemo(() => shell.agents ?? [], [shell.agents]);
  const liveAgents = useMemo(() => allAgents.filter((agent) => !agent.archived_at), [allAgents]);
  // The shell's agent list has answered (or failed, which the shell says): until then a card or
  // an editor cannot tell an agent that is missing from one that is still loading.
  const agentsLoaded = shell.agents !== null || shell.loadError !== null;
  const team = shell.team?.team ? { id: shell.team.team.id, name: shell.team.team.name } : null;

  const [board, setBoard] = useState<WorkBoard | null>(null);
  const [items, setItems] = useState<WorkItem[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [archived, setArchived] = useState(false);
  const [query, setQuery] = useState("");
  const [assignee, setAssignee] = useState("");
  const [tick, setTick] = useState(0);
  const [busyIds, setBusyIds] = useState<ReadonlySet<number>>(() => new Set());
  const [editor, setEditor] = useState<Editor | null>(null);
  const [conflict, setConflict] = useState<WorkItem | null>(null);
  const [execution, setExecution] = useState<WorkItem | null>(null);
  const [dragId, setDragId] = useState<number | null>(null);
  const [dropLane, setDropLane] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [focusTarget, setFocusTarget] = useState<FocusTarget>(null);
  const clearFocus = useCallback(() => setFocusTarget(null), []);
  // A task named by ?task= that is not on the loaded list (archived), and the one last closed.
  const [fetched, setFetched] = useState<WorkItem | null>(null);
  const [closedTask, setClosedTask] = useState<number | null>(null);
  // A read that started before a change, or while one is saving, must not overwrite it.
  const version = useRef(0);
  const saving = useRef(0);

  const columnName = (column: WorkColumn) => {
    const key = columnLabelKey(column);
    return key ? t(key) : column.name;
  };
  const laneName = (lane: Lane) => (lane.labelKey ? t(lane.labelKey) : lane.name);

  const setBusy = (id: number, on: boolean) => setBusyIds((current) => {
    if (current.has(id) === on) return current;
    const next = new Set(current);
    if (on) next.add(id);
    else next.delete(id);
    return next;
  });

  useEffect(() => {
    let alive = true;
    planner.board()
      .then((value) => { if (alive) { setBoard(value); setLoadError(null); } })
      .catch((error: unknown) => { if (alive) setLoadError(errorText(error, t("tasks.loadFailed"))); });
    return () => { alive = false; };
  }, [tick, t]);

  // The board as the server has it (after a failed change, or a stop). Like the poll, the answer is
  // dropped when a change started or finished meanwhile, or one is still saving: it would put back
  // what that change just saved.
  const reload = async () => {
    if (!board) return;
    version.current += 1;
    const started = version.current;
    const list = await planner.items(board.id, archived);
    if (started === version.current && saving.current === 0) setItems(list);
  };

  // The cards, again every 30 s while the tab is visible and at once when it shows again. A read
  // is dropped when a change started or finished meanwhile, or one is still saving.
  useEffect(() => {
    if (!board) return;
    let alive = true;
    const read = () => {
      if (document.hidden) return;
      const started = version.current;
      planner.items(board.id, archived)
        .then((list) => {
          if (!alive) return;
          setLoadError(null);
          if (started === version.current && saving.current === 0) setItems(list);
        })
        .catch((error: unknown) => { if (alive) setLoadError(errorText(error, t("tasks.loadFailed"))); });
    };
    read();
    const timer = window.setInterval(read, ITEMS_EVERY_MS);
    document.addEventListener("visibilitychange", read);
    return () => { alive = false; window.clearInterval(timer); document.removeEventListener("visibilitychange", read); };
  }, [board, archived, t]);

  // ?task=<id> (from a link elsewhere) opens that task's editor once the board has loaded. The
  // editor keeps the version it opened with, so a background read never swaps it under an edit.
  const requested = parseTaskId(params.get("task"));
  const requestedItem = requested === null || items === null ? null
    : items.find((item) => item.id === requested) ?? (fetched?.id === requested ? fetched : null);
  if (requested === null && closedTask !== null) setClosedTask(null);
  // It waits for the agent list too, or the editor would call the task's agent unavailable.
  if (requested !== null && requested !== closedTask && editor === null && requestedItem && agentsLoaded) setEditor({ item: requestedItem });
  useEffect(() => {
    if (requested === null || requested === closedTask || items === null || items.some((item) => item.id === requested) || fetched?.id === requested) return;
    let alive = true;
    planner.item(requested)
      .then((item) => { if (alive) setFetched(item); })
      .catch((error: unknown) => {
        if (!alive) return;
        setClosedTask(requested);
        setActionError(error instanceof ApiError && error.status === 404 ? t("tasks.notFound") : errorText(error, t("tasks.loadFailed")));
      });
    return () => { alive = false; };
  }, [requested, closedTask, items, fetched, t]);

  const closeEditor = () => {
    setEditor(null);
    setConflict(null);
    if (requested !== null) {
      setClosedTask(requested);
      router.replace(TASKS_HREF);
    }
  };

  const shown = useMemo(() => (items ?? []).filter((item) => matchesFilters(item, query, assignee)), [items, query, assignee]);
  const groups = useMemo(() => (board ? groupByColumn(board.columns, shown) : new Map<number, WorkItem[]>()), [board, shown]);
  // The design's four lanes over the columns (Waiting for you, Running, To do, Done); each card
  // keeps its real column, and cards still move by column id.
  const lanes = useMemo(() => (board ? boardLanes(board.columns) : []), [board]);
  const laneOf = useMemo(() => new Map(lanes.flatMap((lane) => lane.columns.map((column) => [column.id, lane] as const))), [lanes]);
  // Every column for the card menu's Move to, what needs you first.
  const columns = useMemo(() => (board ? displayColumns(board.columns) : []), [board]);
  // The conversations with an approval waiting for you (the shell's needs-you rows), so a card
  // linked to one says Needs your approval and offers Review.
  const approvals = useMemo(() => approvalThreads(shell.attention), [shell.attention]);

  // One change to one card (`item` as it was before the change): the list shows the answer, or on
  // a failure the card goes back as it was and the board is read again.
  const change = async (item: WorkItem, changes: WorkChanges, done: (saved: WorkItem) => void) => {
    if (busyIds.has(item.id)) return;
    version.current += 1;
    saving.current += 1;
    setBusy(item.id, true);
    setActionError(null);
    let failed = false;
    try {
      const saved = await planner.update(item, changes);
      setItems((list) => (list ?? []).flatMap((value) => (value.id !== saved.id ? [value] : saved.archived === archived ? [saved] : [])));
      done(saved);
    } catch (error) {
      failed = true;
      setActionError(errorText(error, t("tasks.actionFailed")));
      // A moved card returns to its column at once, even when the read below fails too (offline),
      // and keeps keyboard focus if it had it.
      if (focusInCard(item.id)) setFocusTarget({ kind: "task", id: item.id });
      setItems((list) => (list ? list.map((value) => (value.id === item.id ? item : value)) : list));
    } finally {
      saving.current -= 1;
      version.current += 1;
      setBusy(item.id, false);
    }
    // After the change is no longer saving, or reload() would drop its own answer.
    if (failed) await reload().catch(() => {});
  };

  // `focus`: moved from the card's menu, so keyboard focus follows the card to its new column.
  // `place`: what to announce it was moved to (a lane's name after a drop), else the column's name.
  const move = (id: number, columnId: number, focus = false, place?: string) => {
    const item = items?.find((value) => value.id === id);
    const target = board?.columns.find((column) => column.id === columnId);
    if (focus && item) setFocusTarget({ kind: "task", id });
    if (!item || !target || item.archived || item.column_id === columnId || busyIds.has(id)) return;
    // Filed at once; the saved card replaces it when the answer comes.
    setItems((list) => (list ? moveCard(list, id, columnId) : list));
    void change(item, { column_id: columnId }, () => setAnnouncement(t("tasks.moved", { title: item.title, column: place ?? columnName(target) })));
  };

  // From the card's menu. Focus stays on the card while it saves, then goes to the card that takes
  // its place in the lane (the next one, else the one before), else to the lane's heading.
  const archive = (item: WorkItem) => {
    const lane = laneOf.get(item.column_id) ?? null;
    const cards: WorkItem[] = lane ? laneCards(lane, groups) : [];
    const index = cards.findIndex((value) => value.id === item.id);
    const next = index === -1 ? null : cards[index + 1] ?? cards[index - 1] ?? null;
    setFocusTarget({ kind: "task", id: item.id });
    void change(item, { archived: !item.archived }, () => {
      toast(t(item.archived ? "tasks.restored" : "tasks.archived", { title: item.title }));
      if (focusInCard(item.id)) setFocusTarget(next ? { kind: "task", id: next.id } : lane ? { kind: "lane", key: lane.key } : null);
    });
  };

  const stop = async (item: WorkItem) => {
    if (busyIds.has(item.id)) return;
    setBusy(item.id, true);
    setActionError(null);
    try {
      const run = activeRun(await planner.runs(item.id));
      if (run) {
        await planner.cancelRun(item.id, run.id);
        toast(t(run.state === "scheduled" || run.state === "queued" ? "tasks.cancelled" : "tasks.stopped", { title: item.title }));
      }
      await reload();
    } catch (error) {
      setActionError(errorText(error, t("tasks.actionFailed")));
    } finally {
      setBusy(item.id, false);
    }
  };

  // The editor's save, as the planner dialog does it: only the fields that changed are sent, and
  // a conflict (another window saved first) loads the latest version for the editor to offer.
  const save = async (data: WorkInput) => {
    const current = editor?.item ?? null;
    version.current += 1;
    saving.current += 1;
    let failed = false;
    try {
      const changes = Object.fromEntries(
        Object.entries(data).filter(([key, value]) => key !== "board_id" && value !== current?.[key as keyof WorkItem]),
      ) as WorkChanges;
      const saved = current ? await planner.update(current, changes) : await planner.create(data);
      if (!current && archived) {
        // A new task is never archived: show the active board, where it is.
        setItems(null);
        setArchived(false);
      } else {
        setItems((list) => [...(list ?? []).filter((value) => value.id !== saved.id), ...(saved.archived === archived ? [saved] : [])]);
      }
      toast(t(current ? "tasks.saved" : "tasks.created", { title: saved.title }));
      closeEditor();
    } catch (error) {
      failed = true;
      if (error instanceof ApiError && error.status === 409 && current) {
        await planner.item(current.id).then(setConflict).catch(() => {});
      }
      throw error;
    } finally {
      saving.current -= 1;
      version.current += 1;
      // Read the board again once this save no longer counts as saving; the error still goes to
      // the editor after it.
      if (failed) await reload().catch(() => {});
    }
  };

  const filtering = query.trim() !== "" || assignee !== "";
  const loaded = board !== null && items !== null;
  const empty = loaded && items.length === 0;

  // A lane takes a card from another lane; a card dropped on its own lane stays where it is (a
  // Ready card is not filed back into Backlog). A drop files the card in the lane's first column.
  const dragged = dragId !== null ? items?.find((item) => item.id === dragId) ?? null : null;
  const acceptDrop = (event: DragEvent<HTMLElement>, lane: Lane) => {
    if (!event.dataTransfer.types.includes(TASK_DRAG_TYPE) || archived) return;
    if (dragged && inLane(lane, dragged.column_id)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    if (dropLane !== lane.key) setDropLane(lane.key);
  };
  const leaveDrop = (event: DragEvent<HTMLElement>, lane: Lane) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    if (dropLane === lane.key) setDropLane(null);
  };
  const drop = (event: DragEvent<HTMLElement>, lane: Lane) => {
    event.preventDefault();
    setDropLane(null);
    setDragId(null);
    const id = Number(event.dataTransfer.getData(TASK_DRAG_TYPE));
    const card = items?.find((item) => item.id === id);
    if (!Number.isInteger(id) || id <= 0 || (card && inLane(lane, card.column_id))) return;
    move(id, lane.target.id, false, laneName(lane));
  };

  const assigneeOptions = [
    { value: "", label: t("tasks.allAssignees") },
    { value: "unassigned", label: t("tasks.unassigned") },
    ...(team ? [{ value: `team:${team.id}`, label: t("tasks.teamOption", { name: team.name }) }] : []),
    ...liveAgents.map((agent) => ({ value: `agent:${agent.id}`, label: agent.name })),
  ];
  // An agent that has since been archived is no longer a choice, but the filter still names it.
  const assigneeLabel = assigneeOptions.find((option) => option.value === assignee)?.label ?? t("tasks.agentUnavailable");
  const showArchived = (on: boolean) => {
    if (on === archived) return;
    setItems(null);
    setArchived(on);
  };

  // The header has the design's search field and New task, with one menu between them for the
  // rest: the assignee filter, archived tasks and the calendar. Search shows while there are cards
  // to narrow (it stays through a reload, so focus is not lost); the assignee filter only when
  // there is someone to filter by.
  const controls = board ? (
    <>
      {!empty ? (
        <div className="relative w-full sm:w-60">
          <Search size={15} strokeWidth={1.7} aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
          <Input type="search" value={query} onChange={(event) => setQuery(event.target.value)} aria-label={t("tasks.search")} placeholder={t("tasks.search")} className="pl-8" />
        </div>
      ) : null}
      <Menu
        trigger={(
          <IconButton label={t("tasks.viewOptions")} className={cn((archived || assignee !== "") && "bg-hover text-ink")}>
            <SlidersHorizontal size={18} strokeWidth={1.7} aria-hidden="true" />
          </IconButton>
        )}
        className="w-64"
      >
        {(!empty && (liveAgents.length > 0 || team)) || assignee !== "" ? (
          <MenuSub label={t("tasks.assignee")} hint={assigneeLabel}>
            <MenuRadioGroup value={assignee} onValueChange={setAssignee} label={t("tasks.filterAssignee")}>
              {assigneeOptions.map((option) => (
                <MenuRadioItem key={option.value} value={option.value}>{option.label}</MenuRadioItem>
              ))}
            </MenuRadioGroup>
          </MenuSub>
        ) : null}
        <MenuLabel>{t("tasks.view.label")}</MenuLabel>
        <MenuRadioGroup value={archived ? "archived" : "active"} onValueChange={(value) => showArchived(value === "archived")} label={t("tasks.view.label")}>
          <MenuRadioItem value="active">{t("tasks.view.active")}</MenuRadioItem>
          <MenuRadioItem value="archived">{t("tasks.view.archived")}</MenuRadioItem>
        </MenuRadioGroup>
        <MenuSeparator />
        <MenuItem icon={<CalendarDays size={14} strokeWidth={1.7} />} onSelect={() => router.push(CALENDAR_HREF)}>{t("tasks.calendar")}</MenuItem>
      </Menu>
      <Button variant="primary" icon={<Plus size={15} strokeWidth={1.7} aria-hidden="true" />} onClick={() => setEditor({ item: null })}>{t("tasks.newTask")}</Button>
    </>
  ) : null;

  // What the board shows when it is not every active task, beside the title: the choices sit in
  // the menu, so the page says when one is on.
  const viewStatus = board && (archived || assignee !== "") ? (
    <>
      {archived ? <Badge>{t("tasks.showingArchived")}</Badge> : null}
      {assignee !== "" ? <Badge>{t("tasks.showingAssignee", { name: assigneeLabel })}</Badge> : null}
    </>
  ) : null;

  let content: ReactNode;
  if (!loaded) {
    content = loadError ? null : (
      <div role="status" className={GRID}>
        <span className="sr-only">{t("tasks.loading")}</span>
        {[0, 1, 2, 3].map((key) => (
          <Card key={key} className="flex flex-col gap-3 p-3.5">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </Card>
        ))}
      </div>
    );
  } else if (empty) {
    content = (
      <Card>
        <EmptyState
          icon={<SquareCheck size={24} />}
          title={t(archived ? "tasks.emptyArchived.title" : "tasks.empty.title")}
          description={t(archived ? "tasks.emptyArchived.body" : "tasks.empty.body")}
        />
      </Card>
    );
  } else if (filtering && shown.length === 0) {
    content = (
      <Card>
        <EmptyState
          icon={<Search size={24} strokeWidth={1.7} />}
          title={t("tasks.noMatch.title")}
          description={t("tasks.noMatch.body")}
          action={<Button onClick={() => { setQuery(""); setAssignee(""); }}>{t("tasks.clearFilters")}</Button>}
        />
      </Card>
    );
  } else {
    content = (
      <>
        <p id={hintId} className="sr-only">{t("tasks.dragHint")}</p>
        <div className={GRID}>
          {lanes.map((lane) => {
            const cards = laneCards(lane, groups);
            const target = dropLane === lane.key && dragged !== null && !inLane(lane, dragged.column_id);
            const headingId = `${hintId}-lane-${lane.key.replace(/\W/g, "-")}`;
            return (
              <section
                key={lane.key}
                aria-labelledby={headingId}
                onDragOver={(event) => acceptDrop(event, lane)}
                onDragLeave={(event) => leaveDrop(event, lane)}
                onDrop={(event) => drop(event, lane)}
                className={cn("flex min-w-0 flex-col self-start rounded-card border border-line bg-raised transition-colors duration-(--dur-fast)", target && "bg-accent-bg")}
              >
                <div className="flex items-center justify-between gap-2 px-3.5 py-3">
                  <LaneHeading id={headingId} focus={focusTarget?.kind === "lane" && focusTarget.key === lane.key} onFocused={clearFocus}>
                    {laneName(lane)}
                  </LaneHeading>
                  <Badge tone={columnTone(lane.target, cards.length)}>
                    <span aria-hidden="true">{cards.length}</span>
                    <span className="sr-only">{t("tasks.count", { count: cards.length })}</span>
                  </Badge>
                </div>
                {cards.length > 0 ? (
                  <ul aria-labelledby={headingId} className="flex flex-col">
                    {cards.map((item) => {
                      // The card's real column (Ready or Backlog in To do), for its state and action.
                      const column = lane.columns.find((value) => value.id === item.column_id) ?? lane.target;
                      return (
                        <TaskCard
                          key={item.id}
                          item={item}
                          column={column}
                          columns={columns}
                          agents={allAgents}
                          agentsLoaded={agentsLoaded}
                          team={team}
                          approval={approvalThread(item, column, approvals)}
                          busy={busyIds.has(item.id)}
                          dragging={dragId === item.id}
                          focus={focusTarget?.kind === "task" && focusTarget.id === item.id}
                          onFocused={clearFocus}
                          describedBy={hintId}
                          actions={{
                            onEdit: () => setEditor({ item }),
                            onHistory: () => setExecution(item),
                            onMove: (columnId) => move(item.id, columnId, true),
                            onStop: () => void stop(item),
                            onArchive: () => archive(item),
                            onDragStart: () => setDragId(item.id),
                            onDragEnd: () => { setDragId(null); setDropLane(null); },
                          }}
                        />
                      );
                    })}
                  </ul>
                ) : (
                  <p className="border-t border-line px-3.5 py-3 text-small text-muted">{t("tasks.noTasksHere")}</p>
                )}
              </section>
            );
          })}
        </div>
      </>
    );
  }

  return (
    <>
      <Header status={viewStatus}>{controls}</Header>
      {loadError ? (
        <Banner tone="danger" action={<Button onClick={() => { setLoadError(null); setTick((n) => n + 1); }}>{t("tasks.retry")}</Button>}>{loadError}</Banner>
      ) : null}
      {actionError ? <Banner tone="danger" onDismiss={() => setActionError(null)}>{actionError}</Banner> : null}
      <p aria-live="polite" className="sr-only">{announcement}</p>

      {content}

      {editor && board ? (
        <WorkItemEditor
          key={editor.item?.id ?? "new"}
          item={editor.item}
          board={board}
          agents={liveAgents}
          threads={shell.threads ?? []}
          team={team}
          latestItem={conflict && conflict.id === editor.item?.id ? conflict : items?.find((item) => item.id === editor.item?.id)}
          onReload={(item) => { setEditor({ item }); setConflict(null); }}
          onRun={(item) => { closeEditor(); setExecution(item); }}
          onSave={save}
          onOpenThread={closeEditor}
          onClose={closeEditor}
        />
      ) : null}
      {execution ? (
        <WorkExecutionPanel
          key={execution.id}
          item={execution}
          agents={liveAgents}
          onOpenThread={() => setExecution(null)}
          onClose={() => { setExecution(null); void reload().catch(() => {}); }}
          onReview={async () => {
            const latest = await planner.item(execution.id);
            const review = board?.columns.find((column) => column.key === "review");
            if (!review) throw new Error(t("tasks.reviewUnavailable"));
            const saved = await planner.update(latest, { column_id: review.id });
            setExecution(saved);
            await reload();
          }}
        />
      ) : null}
    </>
  );
}
