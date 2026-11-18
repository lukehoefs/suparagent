"use client";

// The Tasks page (design: Tasks.html), inside the app shell: the planner board as columns of cards.
// Built on the planner API (lib/planner-api.ts) and its editors: WorkItemEditor edits or adds a
// task, WorkExecutionPanel starts, schedules or stops agent work. Moving a card only files it in
// another column; it never starts an agent. Owner and admin only, like the /planner routes.
import { CalendarDays, Plus, Search, SquareCheck } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { planner, type WorkBoard, type WorkChanges, type WorkColumn, type WorkInput, type WorkItem } from "@/lib/planner-api";
import {
  activeRun, columnLabelKey, columnTone, groupByColumn, matchesFilters, moveCard, parseTaskId, TASKS_HREF,
} from "@/lib/tasks-board";
import { useT } from "@/lib/use-i18n";
import { useAppShell } from "@/components/shell/AppShell";
import { WorkExecutionPanel } from "@/components/chat/WorkExecutionPanel";
import { WorkItemEditor } from "@/components/chat/WorkItemEditor";
import { Badge } from "@/components/ui/Badge";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input, Select } from "@/components/ui/Input";
import { LinkButton } from "@/components/ui/LinkButton";
import { Skeleton } from "@/components/ui/Skeleton";
import { Card } from "@/components/ui/Surface";
import { Switch } from "@/components/ui/Switch";
import { useToast } from "@/components/ui/Toast";
import { TASK_DRAG_TYPE, TaskCard } from "./TaskCard";

// Cards change from other windows and from agent work; the old planner read them this often too.
const ITEMS_EVERY_MS = 30_000;
const GRID = "grid grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] gap-4";
// The calendar, upcoming list and routine runs stay in the planner dialog on the chat page.
const CALENDAR_HREF = "/chat/?view=planner";

type Editor = { item: WorkItem | null };

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

function Header({ children }: { children?: ReactNode }) {
  const t = useT();
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-h1 font-semibold tracking-[-0.02em] text-ink">{t("tasks.title")}</h1>
        <p className="mt-1 text-body text-muted">{t("tasks.subtitle")}</p>
      </div>
      {children ? <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">{children}</div> : null}
    </header>
  );
}

const errorText = (error: unknown, fallback: string) => (error instanceof Error && error.message ? error.message : fallback);

function Board() {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const params = useSearchParams();
  const shell = useAppShell();
  const hintId = useId();
  const allAgents = useMemo(() => shell.agents ?? [], [shell.agents]);
  const liveAgents = useMemo(() => allAgents.filter((agent) => !agent.archived_at), [allAgents]);
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
  const [dropColumn, setDropColumn] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState("");
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

  // The board as the server has it, whatever is in flight (after a failed change, or a stop).
  const reload = async () => {
    if (!board) return;
    version.current += 1;
    const list = await planner.items(board.id, archived);
    setItems(list);
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
  if (requested !== null && requested !== closedTask && editor === null && requestedItem) setEditor({ item: requestedItem });
  useEffect(() => {
    if (requested === null || requested === closedTask || items === null || items.some((item) => item.id === requested) || fetched?.id === requested) return;
    let alive = true;
    planner.item(requested)
      .then((item) => { if (alive) setFetched(item); })
      .catch((error: unknown) => { if (alive) { setClosedTask(requested); setActionError(errorText(error, t("tasks.notFound"))); } });
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

  // One change to one card: the list shows the answer, or the board is read again on a failure.
  const change = async (item: WorkItem, changes: WorkChanges, done: (saved: WorkItem) => void) => {
    if (busyIds.has(item.id)) return;
    version.current += 1;
    saving.current += 1;
    setBusy(item.id, true);
    setActionError(null);
    try {
      const saved = await planner.update(item, changes);
      setItems((list) => (list ?? []).flatMap((value) => (value.id !== saved.id ? [value] : saved.archived === archived ? [saved] : [])));
      done(saved);
    } catch (error) {
      setActionError(errorText(error, t("tasks.actionFailed")));
      // Put the card back where the server has it (a moved card returns to its column).
      await reload().catch(() => {});
    } finally {
      saving.current -= 1;
      version.current += 1;
      setBusy(item.id, false);
    }
  };

  const move = (id: number, columnId: number) => {
    const item = items?.find((value) => value.id === id);
    const target = board?.columns.find((column) => column.id === columnId);
    if (!item || !target || item.archived || item.column_id === columnId || busyIds.has(id)) return;
    // Filed at once; the saved card replaces it when the answer comes.
    setItems((list) => (list ? moveCard(list, id, columnId) : list));
    void change(item, { column_id: columnId }, () => setAnnouncement(t("tasks.moved", { title: item.title, column: columnName(target) })));
  };

  const archive = (item: WorkItem) => {
    void change(item, { archived: !item.archived }, () => toast(t(item.archived ? "tasks.restored" : "tasks.archived", { title: item.title })));
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
      if (error instanceof ApiError && error.status === 409 && current) {
        await planner.item(current.id).then(setConflict).catch(() => {});
      }
      await reload().catch(() => {});
      throw error;
    } finally {
      saving.current -= 1;
      version.current += 1;
    }
  };

  const shown = useMemo(() => (items ?? []).filter((item) => matchesFilters(item, query, assignee)), [items, query, assignee]);
  const groups = useMemo(() => (board ? groupByColumn(board.columns, shown) : new Map<number, WorkItem[]>()), [board, shown]);
  const filtering = query.trim() !== "" || assignee !== "";
  const loaded = board !== null && items !== null;
  const empty = loaded && items.length === 0;

  const dragged = dragId !== null ? items?.find((item) => item.id === dragId) ?? null : null;
  const acceptDrop = (event: DragEvent<HTMLElement>, column: WorkColumn) => {
    if (!event.dataTransfer.types.includes(TASK_DRAG_TYPE) || archived) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    if (dropColumn !== column.id) setDropColumn(column.id);
  };
  const leaveDrop = (event: DragEvent<HTMLElement>, column: WorkColumn) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    if (dropColumn === column.id) setDropColumn(null);
  };
  const drop = (event: DragEvent<HTMLElement>, column: WorkColumn) => {
    event.preventDefault();
    setDropColumn(null);
    setDragId(null);
    const id = Number(event.dataTransfer.getData(TASK_DRAG_TYPE));
    if (Number.isInteger(id) && id > 0) move(id, column.id);
  };

  const assigneeOptions = [
    { value: "", label: t("tasks.allAssignees") },
    { value: "unassigned", label: t("tasks.unassigned") },
    ...(team ? [{ value: `team:${team.id}`, label: t("tasks.teamOption", { name: team.name }) }] : []),
    ...liveAgents.map((agent) => ({ value: `agent:${agent.id}`, label: agent.name })),
  ];

  // Search and the assignee filter while there are cards to narrow (they stay through a reload, so
  // focus is not lost); the agent list only when there is someone to filter by.
  const controls = board ? (
    <>
      {!empty ? (
        <div className="relative w-full sm:w-60">
          <Search size={15} aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
          <Input type="search" value={query} onChange={(event) => setQuery(event.target.value)} aria-label={t("tasks.search")} placeholder={t("tasks.search")} className="pl-8" />
        </div>
      ) : null}
      {!empty && (liveAgents.length > 0 || team) ? (
        <Select
          aria-label={t("tasks.filterAssignee")}
          value={assignee}
          onChange={(event) => setAssignee(event.target.value)}
          options={assigneeOptions}
          className="w-48"
          triggerClassName="h-control touch:h-touch"
        />
      ) : null}
      <Button variant="primary" icon={<Plus size={15} aria-hidden="true" />} onClick={() => setEditor({ item: null })}>{t("tasks.newTask")}</Button>
    </>
  ) : null;

  let content: ReactNode;
  if (!loaded) {
    content = loadError ? null : (
      <div role="status" className={GRID}>
        <span className="sr-only">{t("tasks.loading")}</span>
        {[0, 1, 2].map((key) => (
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
      <EmptyState
        compact
        title={t("tasks.noMatch.title")}
        description={t("tasks.noMatch.body")}
        action={<Button variant="ghost" onClick={() => { setQuery(""); setAssignee(""); }}>{t("tasks.clearFilters")}</Button>}
      />
    );
  } else {
    content = (
      <>
        <p id={hintId} className="sr-only">{t("tasks.dragHint")}</p>
        <div className={GRID}>
          {board.columns.map((column) => {
            const cards = groups.get(column.id) ?? [];
            const target = dropColumn === column.id && dragged !== null && dragged.column_id !== column.id;
            const headingId = `${hintId}-column-${column.id}`;
            return (
              <section
                key={column.id}
                aria-labelledby={headingId}
                onDragOver={(event) => acceptDrop(event, column)}
                onDragLeave={(event) => leaveDrop(event, column)}
                onDrop={(event) => drop(event, column)}
                className={cn("flex min-w-0 flex-col self-start rounded-card border border-line bg-raised transition-colors duration-(--dur-fast)", target && "bg-accent-bg")}
              >
                <div className="flex items-center justify-between gap-2 px-3.5 py-3">
                  <h2 id={headingId} className="truncate text-body font-semibold text-ink">{columnName(column)}</h2>
                  <Badge tone={columnTone(column)}>
                    <span aria-hidden="true">{cards.length}</span>
                    <span className="sr-only">{t("tasks.count", { count: cards.length })}</span>
                  </Badge>
                </div>
                {cards.length > 0 ? (
                  <ul aria-labelledby={headingId} className="flex flex-col">
                    {cards.map((item) => (
                      <TaskCard
                        key={item.id}
                        item={item}
                        column={column}
                        columns={board.columns}
                        agents={allAgents}
                        team={team}
                        busy={busyIds.has(item.id)}
                        dragging={dragId === item.id}
                        describedBy={hintId}
                        actions={{
                          onEdit: () => setEditor({ item }),
                          onHistory: () => setExecution(item),
                          onMove: (columnId) => move(item.id, columnId),
                          onStop: () => void stop(item),
                          onArchive: () => archive(item),
                          onDragStart: () => setDragId(item.id),
                          onDragEnd: () => { setDragId(null); setDropColumn(null); },
                        }}
                      />
                    ))}
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
      <Header>{controls}</Header>
      {loadError ? (
        <Banner tone="danger" action={<Button size="sm" onClick={() => { setLoadError(null); setTick((n) => n + 1); }}>{t("tasks.retry")}</Button>}>{loadError}</Banner>
      ) : null}
      {actionError ? <Banner tone="danger" onDismiss={() => setActionError(null)}>{actionError}</Banner> : null}
      <p aria-live="polite" className="sr-only">{announcement}</p>

      {content}

      {board ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-label text-muted">
            <Switch checked={archived} onChange={(on) => { setItems(null); setArchived(on); }} label={t("tasks.showArchived")} />
            <span>{t("tasks.showArchived")}</span>
          </label>
          <LinkButton href={CALENDAR_HREF} variant="ghost" className="text-muted hover:text-ink" icon={<CalendarDays size={15} />}>{t("tasks.calendar")}</LinkButton>
        </div>
      ) : null}

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
