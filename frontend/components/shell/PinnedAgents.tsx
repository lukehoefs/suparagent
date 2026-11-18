"use client";

import { Crown, Layers, MoreHorizontal, Settings, Trash2, UserMinus, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type DragEvent, type ReactNode } from "react";
import type { Agent, Thread } from "@/lib/api";
import {
  activityCounts,
  canMessageAll,
  cleanGroupName,
  decodeDrag,
  DRAG_TYPE,
  encodeDrag,
  freeRoomName,
  groupActivity,
  groupChoices,
  groupOf,
  planGroupWith,
  planRemove,
  roomForGroup,
  STACK_FACES,
  type AgentGroup,
  type DragItem,
  type GridTile,
  type GroupOp,
  type GroupTarget,
} from "@/lib/agent-groups";
import { agentGroups, runGroupOps } from "@/lib/agent-groups-api";
import { collaboration } from "@/lib/collaboration";
import { cn } from "@/lib/cn";
import { roomHref } from "@/lib/rooms";
import { agentTarget } from "@/lib/sidebar";
import { useT } from "@/lib/use-i18n";
import { Avatar, type AvatarActivity, type AvatarComputer } from "@/components/ui/Avatar";
import { Menu, MenuItem, MenuSeparator, MenuSub } from "@/components/ui/Menu";

// The groups last read, shared by every sidebar on the page.
let lastGroups: AgentGroup[] | null = null;

/**
 * The owner's agent groups, read again whenever the agent list changes. `groups` is null while
 * unknown, and stays null on a backend without groups (the grid then shows agents only).
 */
export function useAgentGroups(agents: Agent[] | null): { groups: AgentGroup[] | null; settled: boolean; reload: () => Promise<void> } {
  // The last answer, so a sidebar that mounts again (drawer to inline, another page) starts arranged.
  const [groups, setGroups] = useState<AgentGroup[] | null>(lastGroups);
  // Answered at least once, either way. Until then an agent in a group is not shown on its own.
  const [settled, setSettled] = useState(lastGroups !== null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const take = useCallback((list: AgentGroup[] | null) => {
    lastGroups = list;
    setGroups(list);
    setSettled(true);
  }, []);
  const reload = useCallback(async () => {
    try {
      const list = await agentGroups.list();
      if (mounted.current) take(list);
    } catch {
      if (mounted.current) take(null);
    }
  }, [take]);
  useEffect(() => {
    if (agents === null) return;
    let alive = true;
    agentGroups.list().then((list) => { if (alive) take(list); }).catch(() => { if (alive) take(null); });
    return () => { alive = false; };
  }, [agents, take]);
  return { groups, settled, reload };
}

type TileMenu = {
  onEdit?: (agent: Agent) => void;
  onChangeLead?: (agent: Agent) => void;
  onDelete?: (agent: Agent) => void;
};

// The pinned grid (design: Main.html): pinned agents and group stacks three across, and the open
// stack's tray. Grouping: drag an agent onto another agent or a stack, into or out of the tray, or
// use "Group with…" / "Remove from group" in an agent's menu. `canArrange` false: no grouping offered.
export function PinnedAgents({
  listed,
  tiles,
  pinned,
  groups,
  threads,
  rail,
  selectedAgentId,
  leadAgentId,
  activityOf,
  computerOf,
  openGroupId,
  onOpenGroup,
  canArrange,
  onArranged,
  navigate,
  onNavigate,
  onNewChat,
  menu,
  header,
  footer,
}: {
  listed: Agent[];
  tiles: GridTile<Agent>[];
  pinned: boolean;
  groups: AgentGroup[] | null;
  threads: Thread[] | null;
  rail: boolean;
  selectedAgentId: number | null;
  leadAgentId: number | null;
  activityOf: (agentId: number) => AvatarActivity;
  computerOf: (agentId: number) => AvatarComputer;
  openGroupId: number | null;
  onOpenGroup: (groupId: number | null) => void;
  canArrange: boolean;
  // The groups changed on the server: read them again.
  onArranged: () => Promise<void>;
  navigate: (href: string) => void;
  onNavigate?: () => void;
  onNewChat: (agentId: number) => void;
  menu: TileMenu;
  header?: ReactNode;
  footer?: ReactNode;
}) {
  const t = useT();
  const arranging = canArrange && groups !== null && !rail;
  const [drag, setDrag] = useState<DragItem | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const openStack = tiles.find((tile): tile is Extract<GridTile<Agent>, { kind: "group" }> => tile.kind === "group" && tile.group.id === openGroupId) ?? null;

  const run = async (ops: GroupOp[]) => {
    if (ops.length === 0 || busy) return;
    setBusy(true);
    setError(null);
    let created: AgentGroup | null = null;
    try {
      created = await runGroupOps(ops, t("groups.newName"));
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t("groups.failed"));
    }
    // Read the groups again first, so the new stack is on screen when its tray opens.
    await onArranged();
    setBusy(false);
    if (created) {
      // A new group opens with its name ready to change.
      onOpenGroup(created.id);
      setRenaming(created.id);
    }
  };
  const groupWith = (agentId: number, target: GroupTarget) => void run(planGroupWith(groups, agentId, target));
  const removeFromGroup = (agentId: number) => void run(planRemove(groups, agentId));

  // Drag and drop. The item is kept here as well as in the transfer, which a page may only read on drop.
  const dragStart = (item: DragItem) => (event: DragEvent) => {
    event.dataTransfer.setData(DRAG_TYPE, encodeDrag(item));
    event.dataTransfer.effectAllowed = "move";
    setDrag(item);
  };
  const dragEnd = () => { setDrag(null); setOver(null); };
  const dropZone = (key: string, accepts: (item: DragItem) => boolean, onDrop: (item: DragItem) => void) => ({
    onDragOver: (event: DragEvent) => {
      if (!drag) return;
      event.stopPropagation();
      if (!accepts(drag)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      if (over !== key) setOver(key);
    },
    onDragLeave: (event: DragEvent) => {
      if (over === key && !event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(null);
    },
    onDrop: (event: DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const item = decodeDrag(event.dataTransfer.getData(DRAG_TYPE)) ?? drag;
      dragEnd();
      if (item && accepts(item)) onDrop(item);
    },
  });

  const tileFor = (agent: Agent, inTray: AgentGroup | null) => {
    const own = groupOf(groups, agent.id);
    const choices = arranging ? groupChoices(listed, groups, agent.id) : null;
    const target = agentTarget(threads, agent.id);
    return (
      <AgentTile
        key={agent.id}
        agent={agent}
        rail={rail}
        inTray={inTray !== null}
        selected={selectedAgentId === agent.id}
        activity={activityOf(agent.id)}
        computer={computerOf(agent.id)}
        isLead={leadAgentId === agent.id}
        href={target.kind === "thread" ? `/chat?thread=${target.id}` : null}
        onOpenChat={() => onNewChat(agent.id)}
        onNavigate={onNavigate}
        onEdit={menu.onEdit ? () => menu.onEdit?.(agent) : undefined}
        onChangeLead={menu.onChangeLead ? () => menu.onChangeLead?.(agent) : undefined}
        onDelete={menu.onDelete ? () => menu.onDelete?.(agent) : undefined}
        grouping={choices && (choices.groups.length > 0 || choices.agents.length > 0 || own !== null) ? {
          groups: choices.groups,
          agents: choices.agents,
          onGroupWith: (target) => groupWith(agent.id, target),
          onRemove: own ? () => removeFromGroup(agent.id) : undefined,
        } : null}
        drag={arranging ? {
          onDragStart: dragStart({ agentId: agent.id, from: inTray?.id ?? null }),
          onDragEnd: dragEnd,
          // Onto an agent: a group with it (or its group). Inside the tray, the tray takes the drop.
          zone: inTray ? null : dropZone(`a${agent.id}`, (item) => item.agentId !== agent.id && planGroupWith(groups, item.agentId, { kind: "agent", id: agent.id }).length > 0, (item) => groupWith(item.agentId, { kind: "agent", id: agent.id })),
          highlighted: over === `a${agent.id}`,
        } : null}
      />
    );
  };

  const stackFor = (group: AgentGroup, members: Agent[]) => {
    const activities = members.map((member) => activityOf(member.id));
    const dot = groupActivity(activities);
    const counts = activityCounts(activities);
    const expanded = openGroupId === group.id;
    const label = [
      t("groups.stackLabel", { name: group.name, n: members.length }),
      counts.waiting > 0 ? t("groups.waitingCount", { n: counts.waiting }) : null,
      counts.working > 0 ? t("groups.workingCount", { n: counts.working }) : null,
    ].filter(Boolean).join(", ");
    const zone = arranging
      ? dropZone(`g${group.id}`, (item) => groupOf(groups, item.agentId)?.id !== group.id, (item) => groupWith(item.agentId, { kind: "group", id: group.id }))
      : null;
    return (
      <li key={`g${group.id}`} className="min-w-0" {...zone}>
        <button
          type="button"
          aria-expanded={expanded}
          aria-label={label}
          title={label}
          onClick={() => onOpenGroup(expanded ? null : group.id)}
          className={cn(
            "flex w-full min-w-0 cursor-pointer flex-col items-center gap-1.5 rounded-card px-1 py-2.5 text-small font-medium text-ink transition-colors duration-(--dur-fast) hover:bg-hover/60",
            rail && "py-1.5",
            over === `g${group.id}` && "ring-2 ring-inset ring-accent",
          )}
        >
          <span className="relative inline-flex">
            <span
              aria-hidden="true"
              className={cn(
                "grid content-center justify-center gap-0.5 rounded-[14px] border border-line bg-hover",
                rail ? "size-8 auto-rows-[14px] grid-cols-[repeat(2,14px)]" : "size-12 auto-rows-[20px] grid-cols-[repeat(2,20px)]",
                expanded && "border-accent ring-1 ring-accent",
              )}
            >
              {members.slice(0, rail ? 2 : STACK_FACES).map((member) => (
                <Avatar key={member.id} agentId={member.id} name={member.name} size="xs" className={rail ? "size-3.5 text-[7px]" : undefined} />
              ))}
            </span>
            {dot && (
              <span aria-hidden="true" className={cn("absolute -bottom-0.5 -right-0.5 size-3 rounded-full ring-2 ring-app", dot === "working" ? "bg-running motion-safe:animate-pulse" : "bg-warning-line")} />
            )}
            <span aria-hidden="true" className="absolute -right-[7px] -top-[5px] inline-flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-ink px-1 text-[10px] font-semibold leading-none text-app ring-2 ring-app">
              {members.length}
            </span>
          </span>
          {!rail && <span className="max-w-full truncate">{group.name}</span>}
        </button>
      </li>
    );
  };

  // A member dragged out of the tray and let go anywhere else in this section leaves the group.
  const sectionZone = arranging && openStack
    ? dropZone("out", (item) => item.from !== null && item.from === openStack.group.id, (item) => removeFromGroup(item.agentId))
    : null;

  return (
    <section
      aria-label={pinned ? t("sidebar.pinned") : t("sidebar.agents")}
      className={cn("flex flex-col gap-1 rounded-card", over === "out" && "bg-hover/40")}
      {...sectionZone}
    >
      {header}
      <ul className={cn("grid gap-0.5", rail ? "grid-cols-1" : "grid-cols-3")}>
        {tiles.map((tile) => (tile.kind === "agent" ? tileFor(tile.agent, null) : stackFor(tile.group, tile.members)))}
      </ul>
      {openStack && (rail ? (
        <ul aria-label={t("groups.members", { name: openStack.group.name })} className="flex flex-col gap-0.5 rounded-card bg-hover py-1">
          {openStack.members.map((member) => tileFor(member, openStack.group))}
        </ul>
      ) : (
        <GroupTray
          group={openStack.group}
          members={openStack.members}
          renaming={renaming === openStack.group.id}
          onRenaming={(on) => setRenaming(on ? openStack.group.id : null)}
          canArrange={arranging}
          busy={busy}
          error={error}
          onError={setError}
          onClose={() => { setRenaming(null); onOpenGroup(null); }}
          onArranged={onArranged}
          navigate={navigate}
          onNavigate={onNavigate}
          highlighted={over === `t${openStack.group.id}`}
          zone={arranging ? dropZone(`t${openStack.group.id}`, (item) => item.from !== openStack.group.id && groupOf(groups, item.agentId)?.id !== openStack.group.id, (item) => groupWith(item.agentId, { kind: "group", id: openStack.group.id })) : null}
        >
          {openStack.members.map((member) => tileFor(member, openStack.group))}
        </GroupTray>
      ))}
      {error && !openStack && <p role="alert" className="px-2.5 text-small text-danger">{error}</p>}
      {footer}
    </section>
  );
}

type Zone = {
  onDragOver: (event: DragEvent) => void;
  onDragLeave: (event: DragEvent) => void;
  onDrop: (event: DragEvent) => void;
};

// The open stack (design: Main.html): its name and size, Message all, close; its members; Rename,
// Ungroup and how grouping works.
function GroupTray({
  group,
  members,
  renaming,
  onRenaming,
  canArrange,
  busy,
  error,
  onError,
  onClose,
  onArranged,
  navigate,
  onNavigate,
  highlighted,
  zone,
  children,
}: {
  group: AgentGroup;
  members: Agent[];
  renaming: boolean;
  onRenaming: (on: boolean) => void;
  canArrange: boolean;
  busy: boolean;
  error: string | null;
  onError: (message: string | null) => void;
  onClose: () => void;
  onArranged: () => Promise<void>;
  navigate: (href: string) => void;
  onNavigate?: () => void;
  highlighted: boolean;
  zone: Zone | null;
  children: ReactNode;
}) {
  const t = useT();
  const [working, setWorking] = useState(false);
  const memberIds = members.map((member) => member.id);

  const act = async (work: () => Promise<void>, failure: string) => {
    setWorking(true);
    onError(null);
    try {
      await work();
    } catch (err) {
      onError(err instanceof Error && err.message ? err.message : failure);
    } finally {
      setWorking(false);
    }
  };

  const saveName = (name: string) => {
    onRenaming(false);
    if (name === group.name) return;
    void act(async () => { await agentGroups.update(group.id, { name }); await onArranged(); }, t("groups.failed"));
  };

  const ungroup = () => void act(async () => {
    await agentGroups.remove(group.id);
    onClose();
    await onArranged();
  }, t("groups.failed"));

  // An open room with exactly these agents, else a new one named after the group.
  const messageAll = () => void act(async () => {
    const rooms = await collaboration.rooms();
    const existing = roomForGroup(rooms, memberIds);
    const room = existing ?? await collaboration.createRoom({ name: freeRoomName(rooms, group.name), member_ids: memberIds, default_responder_kind: "everyone" });
    onNavigate?.();
    navigate(roomHref(room.id));
  }, t("groups.messageFailed"));

  const disabled = busy || working;
  return (
    <div
      role="region"
      aria-label={t("groups.trayLabel", { name: group.name })}
      className={cn("mx-0 mb-1 mt-0.5 flex flex-col gap-1.5 rounded-[14px] bg-hover px-1.5 pb-2 pt-2.5", highlighted && "ring-2 ring-inset ring-accent")}
      {...zone}
    >
      <div className="flex items-center justify-between gap-1.5 px-1.5">
        {renaming ? (
          <GroupNameField
            initial={group.name}
            onSave={saveName}
            onCancel={() => { onError(null); onRenaming(false); }}
            onInvalid={() => onError(t("groups.badName"))}
            onEdit={() => onError(null)}
          />
        ) : (
          <span className="min-w-0 truncate text-label font-semibold">
            {group.name} <span className="font-normal text-muted">· {members.length}</span>
          </span>
        )}
        <span className="inline-flex shrink-0 items-center gap-0.5">
          {canArrange && canMessageAll(memberIds) && !renaming && (
            <button
              type="button"
              onClick={messageAll}
              disabled={disabled}
              className="inline-flex h-7 cursor-pointer items-center rounded-field bg-accent px-2.5 text-small font-medium text-accent-fg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 touch:h-touch"
            >
              {t("groups.messageAll")}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label={t("groups.close", { name: group.name })}
            title={t("groups.close", { name: group.name })}
            className="inline-flex size-7 cursor-pointer items-center justify-center rounded-field text-muted hover:bg-surface/60 hover:text-ink touch:size-touch"
          >
            <X size={14} aria-hidden="true" />
          </button>
        </span>
      </div>
      {renaming && <p className="px-1.5 text-small text-muted">{t("sidebar.renameHint")}</p>}
      <ul aria-label={t("groups.members", { name: group.name })} className="grid grid-cols-3 gap-0.5">
        {children}
      </ul>
      {canArrange && (
        <div className="flex flex-wrap items-center gap-1 px-0.5">
          <button type="button" disabled={disabled} onClick={() => onRenaming(true)} className={TRAY_ACTION}>{t("groups.rename")}</button>
          <button type="button" disabled={disabled} onClick={ungroup} className={TRAY_ACTION}>{t("groups.ungroup")}</button>
        </div>
      )}
      {error && <p role="alert" className="px-1.5 text-small text-danger">{error}</p>}
      {canArrange && <p className="px-1.5 text-[11px] leading-4 text-muted">{t("groups.hint")}</p>}
    </div>
  );
}

// The group's name, being changed: it starts as the current name, selected, ready to be typed over.
// Enter or leaving the field saves a usable name; Escape (or leaving it unusable) keeps the old one.
function GroupNameField({
  initial,
  onSave,
  onCancel,
  onInvalid,
  onEdit,
}: {
  initial: string;
  onSave: (name: string) => void;
  onCancel: () => void;
  onInvalid: () => void;
  onEdit: () => void;
}) {
  const t = useT();
  const [draft, setDraft] = useState(initial);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);
  return (
    <span className="flex min-w-0 flex-1 flex-col">
      <input
        ref={input}
        value={draft}
        maxLength={80}
        aria-label={t("groups.renameLabel")}
        onChange={(event) => { setDraft(event.target.value); onEdit(); }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.nativeEvent.isComposing) {
            event.preventDefault();
            const name = cleanGroupName(draft);
            if (name === null) onInvalid();
            else onSave(name);
          }
          if (event.key === "Escape") { event.preventDefault(); onCancel(); }
        }}
        onBlur={() => {
          const name = cleanGroupName(draft);
          if (name === null) onCancel();
          else onSave(name);
        }}
        className="h-7 w-full min-w-0 rounded-field border border-line-strong bg-raised px-2 text-label touch:h-touch"
      />
    </span>
  );
}

const TRAY_ACTION =
  "inline-flex h-[26px] cursor-pointer items-center rounded-inner px-2 text-small font-medium text-muted hover:bg-surface/60 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50 touch:h-touch";

// One agent in the grid or a tray: its avatar with the activity dot and computer badge, the name
// under it, and its menu (settings, lead, grouping, delete) on the "…" button or a right-click.
function AgentTile({
  agent,
  rail,
  inTray,
  selected,
  activity,
  computer,
  isLead,
  href,
  onOpenChat,
  onNavigate,
  onEdit,
  onChangeLead,
  onDelete,
  grouping,
  drag,
}: {
  agent: Agent;
  rail: boolean;
  inTray: boolean;
  selected: boolean;
  activity: AvatarActivity;
  computer: AvatarComputer;
  isLead: boolean;
  href: string | null;
  onOpenChat: () => void;
  onNavigate?: () => void;
  onEdit?: () => void;
  onChangeLead?: () => void;
  onDelete?: () => void;
  grouping: {
    groups: AgentGroup[];
    agents: Agent[];
    onGroupWith: (target: GroupTarget) => void;
    onRemove?: () => void;
  } | null;
  drag: { onDragStart: (event: DragEvent) => void; onDragEnd: () => void; zone: Zone | null; highlighted: boolean } | null;
}) {
  const t = useT();
  const [menuOpen, setMenuOpen] = useState(false);
  const offersGroupWith = grouping !== null && (grouping.groups.length > 0 || grouping.agents.length > 0);
  const hasMenu = Boolean(onEdit || onChangeLead || onDelete || offersGroupWith || grouping?.onRemove);
  const state = [
    activity === "working" ? t("status.working") : activity === "waiting" ? t("status.waiting") : null,
    computer === "on" ? t("sidebar.computerOn") : computer === "off" ? t("sidebar.computerOff") : null,
    isLead ? t("sidebar.lead") : null,
  ].filter(Boolean);
  const label = [t("sidebar.chatWith", { name: agent.name }), ...state].join(", ");
  const cls = cn(
    "flex w-full min-w-0 cursor-pointer flex-col items-center gap-1.5 rounded-card px-1 py-2.5 text-ink transition-colors duration-(--dur-fast)",
    selected ? (inTray ? "bg-surface/70" : "bg-hover") : inTray ? "hover:bg-surface/50" : "hover:bg-hover/60",
    rail && "py-1.5",
    drag?.highlighted && "ring-2 ring-inset ring-accent",
  );
  const body = (
    <>
      <Avatar
        agentId={agent.id}
        name={agent.name}
        size={rail ? "md" : "xl"}
        activity={activity}
        computer={computer}
        computerLabel={computer === "on" ? t("chatPage.computerOn") : computer === "off" ? t("chatPage.computerOff") : undefined}
        edge={inTray || selected ? "hover" : "app"}
      />
      {!rail && <span className="max-w-full truncate text-small font-medium">{agent.name}</span>}
    </>
  );
  return (
    <li
      className="group relative min-w-0"
      draggable={drag !== null}
      onDragStart={drag?.onDragStart}
      onDragEnd={drag?.onDragEnd}
      {...drag?.zone}
      onContextMenu={hasMenu ? (event) => { event.preventDefault(); setMenuOpen(true); } : undefined}
    >
      {href !== null ? (
        <Link href={href} onClick={onNavigate} draggable={false} aria-label={label} title={label} aria-current={selected ? "true" : undefined} className={cls}>
          {body}
        </Link>
      ) : (
        <button type="button" onClick={onOpenChat} draggable={false} aria-label={label} title={label} aria-current={selected ? "true" : undefined} className={cls}>
          {body}
        </button>
      )}
      {hasMenu && !rail && (
        <div className={cn("absolute right-0.5 top-0.5", !menuOpen && "opacity-0 focus-within:opacity-100 group-hover:opacity-100 touch:opacity-100")}>
          <Menu
            open={menuOpen}
            onOpenChange={setMenuOpen}
            trigger={
              <button
                type="button"
                aria-label={t("sidebar.agentActions", { name: agent.name })}
                className="inline-flex size-6 cursor-pointer items-center justify-center rounded-inner text-muted hover:bg-hover hover:text-ink touch:size-9"
              >
                <MoreHorizontal size={14} aria-hidden="true" />
              </button>
            }
          >
            {onEdit && <MenuItem onSelect={onEdit} icon={<Settings size={14} />}>{t("sidebar.agentSettings")}</MenuItem>}
            {onChangeLead && (
              <MenuItem onSelect={onChangeLead} icon={<Crown size={14} />}>{isLead ? t("sidebar.removeLead") : t("sidebar.makeLead")}</MenuItem>
            )}
            {grouping && (offersGroupWith || grouping.onRemove) && (
              <>
                {(onEdit || onChangeLead) && <MenuSeparator />}
                {offersGroupWith && (
                  <MenuSub label={t("groups.groupWith")} icon={<Layers size={14} />}>
                    {grouping.groups.map((group) => (
                      <MenuItem key={`g${group.id}`} onSelect={() => grouping.onGroupWith({ kind: "group", id: group.id })} icon={<Layers size={14} />}>
                        <span className="min-w-0 flex-1 truncate">{group.name}</span>
                        <span className="shrink-0 text-small text-muted">{group.agent_ids.length}</span>
                      </MenuItem>
                    ))}
                    {grouping.groups.length > 0 && grouping.agents.length > 0 && <MenuSeparator />}
                    {grouping.agents.map((other) => (
                      <MenuItem key={`a${other.id}`} onSelect={() => grouping.onGroupWith({ kind: "agent", id: other.id })} icon={<Avatar agentId={other.id} name={other.name} size="xs" />}>
                        <span className="min-w-0 flex-1 truncate">{other.name}</span>
                      </MenuItem>
                    ))}
                  </MenuSub>
                )}
                {grouping.onRemove && <MenuItem onSelect={grouping.onRemove} icon={<UserMinus size={14} />}>{t("groups.removeFrom")}</MenuItem>}
              </>
            )}
            {onDelete && (
              <>
                {(onEdit || onChangeLead || grouping) && <MenuSeparator />}
                <MenuItem onSelect={onDelete} danger icon={<Trash2 size={14} />}>{t("sidebar.deleteAgent")}</MenuItem>
              </>
            )}
          </Menu>
        </div>
      )}
    </li>
  );
}
