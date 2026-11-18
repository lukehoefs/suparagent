"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { planner, type WorkBoard, type WorkItem } from "@/lib/planner-api";
import { dueTasks, TASKS_HREF, taskHref, type DueTask } from "@/lib/today";
import { useT } from "@/lib/use-i18n";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatusText } from "@/components/ui/StatusPill";
import { SectionNote, TodaySection } from "./TodaySection";
import type { TodayFormat } from "./useTodayFormat";

// The most tasks listed here; the rest are counted, with a link to the task board.
const SHOWN = 8;

export type TaskBoard = { board: WorkBoard; items: WorkItem[] };

// Tasks due today or earlier (design: "Due tasks"). Ticking one moves it to the board's Done column,
// and it stays here, ticked, so a slip can be undone; unticking puts it back where it was.
export function DueTasksSection({
  data,
  loading,
  failed,
  now,
  format,
  onSaved,
  reload,
}: {
  data: TaskBoard | null;
  loading: boolean;
  failed: boolean;
  now: Date;
  format: TodayFormat;
  onSaved: (item: WorkItem) => void;
  reload: () => void;
}) {
  const t = useT();
  // Ticked off here: the column each came from, so unticking can put it back.
  const [ticked, setTicked] = useState<ReadonlyMap<number, number>>(() => new Map());
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const saving = useRef(false);
  const done = data?.board.columns.find((column) => column.key === "done") ?? null;
  const tasks = dueTasks(data?.items ?? null, done?.id ?? null, now, format.timeZone, new Set(ticked.keys()));

  const toggle = async (task: DueTask) => {
    if (!done || saving.current) return;
    const back = ticked.get(task.item.id);
    const target = task.done ? back : done.id;
    if (target === undefined) return;
    saving.current = true;
    setBusy(task.item.id);
    setError(null);
    try {
      const saved = await planner.update(task.item, { column_id: target });
      onSaved(saved);
      setTicked((current) => {
        const next = new Map(current);
        if (task.done) next.delete(task.item.id);
        else next.set(task.item.id, task.item.column_id);
        return next;
      });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError(t("today.tasks.changed"));
        reload();
      } else {
        setError(t("today.tasks.saveFailed"));
      }
    } finally {
      saving.current = false;
      setBusy(null);
    }
  };

  const when = (task: DueTask): string => {
    if (task.when.kind === "time") return format.time(task.when.at);
    if (task.when.kind === "today") return t("today.tasks.today");
    return format.shortDay(task.when.day);
  };

  let body;
  if (loading) {
    body = (
      <div role="status" className="flex flex-col gap-2 p-4">
        <span className="sr-only">{t("today.loading")}</span>
        <Skeleton className="h-9" />
      </div>
    );
  } else if (failed && !data) {
    body = <SectionNote tone="danger">{t("today.tasks.loadFailed")}</SectionNote>;
  } else if (tasks.length === 0) {
    body = <SectionNote>{t("today.tasks.empty")}</SectionNote>;
  } else {
    body = (
      <ul className="flex flex-col">
        {tasks.slice(0, SHOWN).map((task) => {
          const title = task.item.title;
          return (
            <li key={task.key} className="flex min-w-0 items-center gap-2.5 border-b border-line px-4 py-2 last:border-b-0 max-sm:min-h-touch">
              <label className="-m-2 inline-flex size-8 shrink-0 cursor-pointer items-center justify-center has-[:disabled]:cursor-not-allowed max-sm:size-11 touch:size-11">
                <input
                  type="checkbox"
                  checked={task.done}
                  disabled={!done || busy !== null}
                  aria-label={t(task.done ? "today.tasks.markNotDone" : "today.tasks.markDone", { title })}
                  onChange={() => void toggle(task)}
                  className="size-4 cursor-pointer accent-(--accent) disabled:cursor-not-allowed"
                />
              </label>
              <Link
                href={taskHref(task.item.id)}
                className={cn("min-w-0 flex-1 truncate py-1 text-label text-ink hover:underline", task.done && "text-muted line-through")}
              >
                {title}
              </Link>
              {task.done ? (
                <StatusText status="done">{t("today.tasks.done")}</StatusText>
              ) : task.overdue ? (
                <StatusText status="waiting">{t("today.tasks.overdueAt", { when: when(task) })}</StatusText>
              ) : (
                <span className="shrink-0 text-small text-muted">{when(task)}</span>
              )}
            </li>
          );
        })}
      </ul>
    );
  }
  const more = tasks.length - SHOWN;
  const footer = (error || more > 0) && !loading ? (
    <div className="flex flex-col gap-1">
      {error && <p role="alert" className="text-small text-danger">{error}</p>}
      {more > 0 && (
        <Link href={TASKS_HREF} className="text-small text-muted underline underline-offset-2 hover:text-ink max-sm:inline-flex max-sm:min-h-touch max-sm:items-center">
          {t("today.tasks.more", { count: more })}
        </Link>
      )}
    </div>
  ) : null;
  return <TodaySection title={t("today.tasks.title")} footer={footer}>{body}</TodaySection>;
}
