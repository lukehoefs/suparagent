"use client";

// One task on the Tasks board (design: Tasks.html): who has it, its title, one muted line (the
// assignee, a state as a dot and a word when it says more than the lane heading, its deadline or
// last change), the one action that fits now, and a menu with the rest. The menu's "Move to" list
// is the keyboard and touch way to do what dragging the card does.
import { Check, CircleDashed, Ellipsis, Flag, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useRef, type DragEvent, type ReactNode } from "react";
import type { Agent } from "@/lib/api";
import { chatPath } from "@/lib/chat-link";
import { cn } from "@/lib/cn";
import type { WorkColumn, WorkItem } from "@/lib/planner-api";
import { cardAction, cardMetaStatus, cardTime, columnLabelKey, isOverdueLine } from "@/lib/tasks-board";
import { useT } from "@/lib/use-i18n";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { LinkButton } from "@/components/ui/LinkButton";
import { Menu, MenuItem, MenuSeparator, MenuSub } from "@/components/ui/Menu";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatusText } from "@/components/ui/StatusPill";

export const TASK_DRAG_TYPE = "application/x-lukethomas-task";

/**
 * A ref that takes keyboard focus when `take` turns true, then reports it with `onTaken`. The board
 * asks for it after Move to or Archive from a card's menu, where the card is drawn again in another
 * column or taken off the board, so focus would otherwise drop to the page.
 */
export function useTakeFocus<T extends HTMLElement>(take: boolean, onTaken: () => void) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!take) return;
    ref.current?.focus();
    onTaken();
  }, [take, onTaken]);
  return ref;
}

// The design's stop glyph (Tasks.html): a small rounded square, so it never reads as a checkbox.
function StopGlyph() {
  return (
    <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      <rect x="6.5" y="6.5" width="11" height="11" rx="2" />
    </svg>
  );
}

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
  agentsLoaded,
  team,
  approval,
  busy,
  dragging,
  focus,
  onFocused,
  describedBy,
  actions,
}: {
  item: WorkItem;
  column: WorkColumn;
  // In the board's display order, for the Move to list.
  columns: WorkColumn[];
  agents: Agent[];
  // False while the shell's agent list is still loading: an agent's card then names no one yet,
  // rather than calling its agent unavailable.
  agentsLoaded: boolean;
  team: { id: number; name: string } | null;
  // The card's conversation with an approval waiting for you (lib/tasks-board approvalThread).
  approval: number | null;
  busy: boolean;
  dragging: boolean;
  // The board asks this card to take keyboard focus (its title), and is told once it has.
  focus: boolean;
  onFocused: () => void;
  // The board's "drag or use the menu" hint, for screen readers.
  describedBy?: string;
  actions: TaskCardActions;
}) {
  const t = useT();
  const router = useRouter();
  // The title, not the menu button: the menu button is disabled while the card saves.
  const titleRef = useTakeFocus<HTMLButtonElement>(focus, onFocused);
  // Move to and Archive send focus where the board puts it, so the menu must not send it back to
  // its button, which is gone once the card is drawn in another column.
  const keepFocus = useRef(false);
  const columnName = (value: WorkColumn) => {
    const key = columnLabelKey(value);
    return key ? t(key) : value.name;
  };
  // Only when it says more than the lane heading: an agent attempt, a waiting approval, Ready.
  const state = cardMetaStatus(item, column, approval !== null);
  const word = state ? ("key" in state ? t(state.key) : state.label) : null;
  const action = cardAction(item, column, approval);
  const priority = item.priority === "urgent" ? t("tasks.priority.urgent") : item.priority === "high" ? t("tasks.priority.high") : null;
  const line = cardTime(item);
  const when = line ? t(line.key, line.when ? { ...line.params, when: t(line.when.key, { n: line.when.n }) } : line.params) : null;
  const agent = item.agent_id !== null ? agents.find((value) => value.id === item.agent_id) ?? null : null;
  const assignee = item.agent_id !== null
    ? (agentsLoaded ? agent?.name ?? t("tasks.agentUnavailable") : null)
    : item.team_id !== null
      ? (team?.id === item.team_id ? team.name : t("tasks.teamUnavailable"))
      : t("tasks.unassigned");
  const movable = !item.archived && !busy;

  const overdue = isOverdueLine(line);

  // The muted line stays one line, as the design has it ("Atlas · needs an approval"). The assignee
  // gives way first: its large shrink factor makes it take nearly all of the shortfall, down to a
  // letter and an ellipsis, so the line never starts with a bare "·". The state, and an overdue
  // deadline (a status too), are never left out; they truncate only when they are wider than the
  // rest of the line on their own. Any other time beside a state is `optional`: it shows only when
  // it fits whole (see the line below), since the state says more about the card.
  const meta: { key: string; node: ReactNode; optional?: boolean }[] = [];
  if (assignee !== null) meta.push({ key: "who", node: <span className="min-w-[1.5em] shrink-[1000] truncate">{assignee}</span> });
  if (state && word) {
    // A failed, interrupted or missed attempt says what the lane does not: the word in the status
    // colour. The other states refine the lane, whose count carries the colour: the dot carries the
    // status and the word stays muted, as on the sidebar's waiting line.
    meta.push({ key: "state", node: <StatusText status={state.status} className={state.status === "denied" ? undefined : "text-muted"}>{word}</StatusText> });
  }
  if (when) {
    // Overdue is a status too: the word and a dot in the denied colour, never the colour alone.
    meta.push({
      key: "when",
      node: overdue ? <StatusText status="denied">{when}</StatusText> : <span className="min-w-0 truncate">{when}</span>,
      optional: Boolean(state && word) && !overdue,
    });
  }

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
      <Button variant="ghost" className="text-muted hover:text-ink" loading={busy} icon={action.kind === "stop" ? <StopGlyph /> : undefined} onClick={actions.onStop}>
        {t(action.kind === "stop" ? "tasks.action.stop" : "tasks.action.cancel")}
      </Button>
    );
  }

  return (
    <li
      data-task-id={item.id}
      draggable={movable}
      onDragStart={onDragStart}
      onDragEnd={actions.onDragEnd}
      className={cn("group/card flex items-center gap-2.5 border-t border-line px-3.5 py-3", movable && "cursor-grab active:cursor-grabbing", dragging && "opacity-50")}
    >
      {/* The design's 26 px face with a hairline ring. */}
      <div className="shrink-0">
        {item.agent_id !== null && !agentsLoaded ? (
          <Skeleton className="size-[26px] rounded-full" />
        ) : item.agent_id !== null ? (
          <Avatar agentId={item.agent_id} name={agent?.name ?? null} size="sm" className="size-[26px] ring-1 ring-line" />
        ) : (
          <span aria-hidden="true" className="inline-flex size-[26px] items-center justify-center rounded-full bg-inset text-faint ring-1 ring-line">
            {item.team_id !== null ? <Users size={12} /> : <CircleDashed size={12} />}
          </span>
        )}
      </div>
      <div className="relative flex min-w-0 flex-1 items-center gap-1">
        <div className="min-w-0 flex-1">
          {/* On touch screens the title is 44 px tall; the negative margin keeps the row's rhythm. */}
          <div className="flex min-w-0 items-center gap-1.5 touch:-mt-3">
            <button
              ref={titleRef}
              type="button"
              onClick={actions.onEdit}
              aria-describedby={movable ? describedBy : undefined}
              className="min-w-0 cursor-pointer truncate rounded-inner text-left text-body font-medium text-ink hover:underline touch:py-3"
            >
              {item.title}
            </button>
            {/* High and urgent priority: a small flag by the title (filled when urgent), the word
                for screen readers and as a tooltip; priority is not a status, so no colour. */}
            {priority ? (
              <span className="inline-flex shrink-0 text-muted" title={priority}>
                <Flag size={12} strokeWidth={1.7} aria-hidden="true" className={item.priority === "urgent" ? "fill-current" : undefined} />
                <span className="sr-only">{priority}</span>
              </span>
            ) : null}
          </div>
          {/* One muted line, as the design has it: the assignee, then a state when it says more
              than the lane heading, then the time, each after a "·" about 4 px from its
              neighbours. The line never wraps. An optional part sits in a one-line box that wraps:
              the empty first item holds the first line, so a part that does not fit whole drops,
              with its "·", to the second line, which the box clips (screen readers still read it). */}
          {meta.length > 0 ? (
            <p className="mt-0.5 flex min-w-0 items-center overflow-hidden whitespace-nowrap text-small text-muted">
              {meta.map((part, index) => index === 0 ? (
                <Fragment key={part.key}>{part.node}</Fragment>
              ) : part.optional ? (
                <span key={part.key} className="flex h-[1lh] min-w-0 flex-1 flex-wrap content-start items-center overflow-hidden">
                  <span aria-hidden="true" className="h-[1lh] w-0" />
                  <span className="inline-flex shrink-0 items-center gap-1 ps-1">
                    <span aria-hidden="true">·</span>
                    {part.node}
                  </span>
                </span>
              ) : (
                <span key={part.key} className="inline-flex min-w-0 items-center gap-1 ps-1">
                  <span aria-hidden="true" className="shrink-0">·</span>
                  {part.node}
                </span>
              ))}
            </p>
          ) : null}
        </div>
        {/* With a mouse the menu shows on hover or keyboard focus (and while it is open), over the
            end of the text so the title keeps the row's width; on touch screens it always shows.
            The columns sit in a second menu, which scrolls, so the first one stays short enough
            for a phone; the first one also scrolls when the window is shorter still. */}
        <div className="absolute inset-y-0 right-0 flex items-center bg-raised pl-1.5 opacity-0 transition-opacity duration-(--dur-fast) group-hover/card:opacity-100 group-focus-within/card:opacity-100 has-[[aria-expanded=true]]:opacity-100 touch:static touch:pl-0 touch:opacity-100">
          <Menu
            trigger={<IconButton label={t("tasks.menu.label", { title: item.title })} disabled={busy}><Ellipsis size={18} strokeWidth={1.7} aria-hidden="true" /></IconButton>}
            className="max-h-(--radix-dropdown-menu-content-available-height) overflow-y-auto"
            onCloseAutoFocus={(event) => {
              if (!keepFocus.current) return;
              keepFocus.current = false;
              event.preventDefault();
            }}
          >
            <MenuItem onSelect={actions.onEdit}>{t("tasks.menu.edit")}</MenuItem>
            <MenuItem onSelect={actions.onHistory}>{t("tasks.menu.history")}</MenuItem>
            {item.thread_id !== null ? (
              <MenuItem onSelect={() => router.push(chatPath({ kind: "thread", id: item.thread_id! }))}>{t("tasks.menu.openConversation")}</MenuItem>
            ) : null}
            {!item.archived ? (
              <>
                <MenuSeparator />
                {/* Every column, not the lanes: a card can be filed in Ready or Review exactly. */}
                <MenuSub label={t("tasks.menu.moveTo")}>
                  {columns.map((value) => (
                    <MenuItem
                      key={value.id}
                      disabled={value.id === item.column_id}
                      icon={<Check size={14} className={value.id === item.column_id ? undefined : "invisible"} />}
                      onSelect={() => { keepFocus.current = true; actions.onMove(value.id); }}
                    >
                      {columnName(value)}
                    </MenuItem>
                  ))}
                </MenuSub>
              </>
            ) : null}
            <MenuSeparator />
            <MenuItem onSelect={() => { keepFocus.current = true; actions.onArchive(); }}>{t(item.archived ? "tasks.menu.restore" : "tasks.menu.archive")}</MenuItem>
          </Menu>
        </div>
      </div>
      {primary}
    </li>
  );
}
