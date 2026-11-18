"use client";

// One task on the Tasks board (design: Tasks.html): who has it, its title, its state as a word and
// a dot, its deadline or last change, the one action that fits now, and a menu with the rest.
// The menu's "Move to" list is the keyboard and touch way to do what dragging the card does.
import { Check, CircleDashed, Ellipsis, Square, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import type { DragEvent } from "react";
import type { Agent } from "@/lib/api";
import { chatPath } from "@/lib/chat-link";
import { cn } from "@/lib/cn";
import type { WorkColumn, WorkItem } from "@/lib/planner-api";
import { cardAction, cardStatus, cardTime, columnLabelKey, isOverdueLine } from "@/lib/tasks-board";
import { useT } from "@/lib/use-i18n";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { LinkButton } from "@/components/ui/LinkButton";
import { Menu, MenuItem, MenuLabel, MenuSeparator } from "@/components/ui/Menu";
import { StatusText } from "@/components/ui/StatusPill";

export const TASK_DRAG_TYPE = "application/x-lukethomas-task";

export type TaskCardActions = {
  onEdit: () => void;
  onHistory: () => void;
  onMove: (columnId: number) => void;
  onStop: () => void;
  onArchive: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
};

export function TaskCard({
  item,
  column,
  columns,
  agents,
  team,
  busy,
  dragging,
  describedBy,
  actions,
}: {
  item: WorkItem;
  column: WorkColumn;
  columns: WorkColumn[];
  agents: Agent[];
  team: { id: number; name: string } | null;
  busy: boolean;
  dragging: boolean;
  // The board's "drag or use the menu" hint, for screen readers.
  describedBy?: string;
  actions: TaskCardActions;
}) {
  const t = useT();
  const router = useRouter();
  const columnName = (value: WorkColumn) => {
    const key = columnLabelKey(value);
    return key ? t(key) : value.name;
  };
  const state = cardStatus(item, column);
  const word = "key" in state ? t(state.key) : state.label;
  const action = cardAction(item, column);
  const line = cardTime(item);
  const when = line ? t(line.key, line.when ? { ...line.params, when: t(line.when.key, { n: line.when.n }) } : line.params) : null;
  const agent = item.agent_id !== null ? agents.find((value) => value.id === item.agent_id) ?? null : null;
  const assignee = item.agent_id !== null
    ? agent?.name ?? t("tasks.agentUnavailable")
    : item.team_id !== null
      ? (team?.id === item.team_id ? team.name : t("tasks.teamUnavailable"))
      : t("tasks.unassigned");
  const movable = !item.archived && !busy;

  const onDragStart = (event: DragEvent<HTMLLIElement>) => {
    if (!movable) { event.preventDefault(); return; }
    event.dataTransfer.setData(TASK_DRAG_TYPE, String(item.id));
    event.dataTransfer.effectAllowed = "move";
    actions.onDragStart();
  };

  let primary = null;
  if (action?.kind === "review") {
    primary = <LinkButton href={chatPath({ kind: "thread", id: action.threadId })}>{t("tasks.action.review")}</LinkButton>;
  } else if (action?.kind === "history") {
    primary = <Button disabled={busy} onClick={actions.onHistory}>{t("tasks.action.review")}</Button>;
  } else if (action?.kind === "open") {
    primary = <LinkButton variant="ghost" className="text-muted hover:text-ink" href={chatPath({ kind: "thread", id: action.threadId })}>{t("tasks.action.open")}</LinkButton>;
  } else if (action?.kind === "stop" || action?.kind === "cancel") {
    primary = (
      <Button variant="ghost" className="text-muted hover:text-ink" loading={busy} icon={action.kind === "stop" ? <Square size={14} aria-hidden="true" /> : undefined} onClick={actions.onStop}>
        {t(action.kind === "stop" ? "tasks.action.stop" : "tasks.action.cancel")}
      </Button>
    );
  }

  return (
    <li
      draggable={movable}
      onDragStart={onDragStart}
      onDragEnd={actions.onDragEnd}
      className={cn("flex items-center gap-2.5 border-t border-line px-3.5 py-3", movable && "cursor-grab active:cursor-grabbing", dragging && "opacity-50")}
    >
      <span className="shrink-0">
        {item.agent_id !== null ? (
          <Avatar agentId={item.agent_id} name={agent?.name ?? null} size="sm" />
        ) : (
          <span aria-hidden="true" className="inline-flex size-6 items-center justify-center rounded-full bg-inset text-faint">
            {item.team_id !== null ? <Users size={12} /> : <CircleDashed size={12} />}
          </span>
        )}
      </span>
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={actions.onEdit}
          aria-describedby={movable ? describedBy : undefined}
          className="block max-w-full cursor-pointer truncate rounded-inner text-left text-body font-medium text-ink hover:underline touch:-mt-3 touch:py-3"
        >
          {item.title}
        </button>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-small text-muted">
          <StatusText status={state.status}>{word}</StatusText>
          <span aria-hidden="true">·</span>
          <span className="min-w-0 truncate">{assignee}</span>
          {when ? (
            <>
              <span aria-hidden="true">·</span>
              <span className={cn(isOverdueLine(line) && "text-danger")}>{when}</span>
            </>
          ) : null}
          {item.priority === "high" || item.priority === "urgent" ? (
            <>
              <span aria-hidden="true">·</span>
              <span>{t(item.priority === "urgent" ? "tasks.priority.urgent" : "tasks.priority.high")}</span>
            </>
          ) : null}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {primary}
        <Menu trigger={<IconButton label={t("tasks.menu.label", { title: item.title })} disabled={busy}><Ellipsis size={18} aria-hidden="true" /></IconButton>}>
          <MenuItem onSelect={actions.onEdit}>{t("tasks.menu.edit")}</MenuItem>
          <MenuItem onSelect={actions.onHistory}>{t("tasks.menu.history")}</MenuItem>
          {item.thread_id !== null ? (
            <MenuItem onSelect={() => router.push(chatPath({ kind: "thread", id: item.thread_id! }))}>{t("tasks.menu.openConversation")}</MenuItem>
          ) : null}
          {!item.archived ? (
            <>
              <MenuSeparator />
              <MenuLabel>{t("tasks.menu.moveTo")}</MenuLabel>
              {columns.map((value) => (
                <MenuItem
                  key={value.id}
                  disabled={value.id === item.column_id}
                  icon={<Check size={14} className={value.id === item.column_id ? undefined : "invisible"} />}
                  onSelect={() => actions.onMove(value.id)}
                >
                  {columnName(value)}
                </MenuItem>
              ))}
            </>
          ) : null}
          <MenuSeparator />
          <MenuItem onSelect={actions.onArchive}>{t(item.archived ? "tasks.menu.restore" : "tasks.menu.archive")}</MenuItem>
        </Menu>
      </div>
    </li>
  );
}
