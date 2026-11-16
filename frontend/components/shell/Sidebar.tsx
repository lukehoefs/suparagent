"use client";

import {
  Archive,
  Building2,
  CalendarClock,
  CalendarDays,
  Columns3,
  Crown,
  GitBranch,
  LayoutGrid,
  MoreHorizontal,
  Plus,
  Search,
  Settings,
  Trash2,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import type { Agent, Thread } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/use-i18n";
import { agentTarget, computerBadge, gridAgents, recentVisible, sidebarAgents, waitingByThread, waitingRows } from "@/lib/sidebar";
import type { NeedsYouRow } from "@/lib/needs-you";
import { ConversationSearch } from "@/components/chat/ConversationSearch";
import { Avatar, type AvatarActivity } from "@/components/ui/Avatar";
import { IconButton } from "@/components/ui/IconButton";
import { Menu, MenuItem, MenuSeparator } from "@/components/ui/Menu";
import { SkeletonList } from "@/components/ui/Skeleton";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { Wordmark } from "@/components/ui/Wordmark";
import { openCommandPalette } from "./CommandPalette";
import { ThreadRow, type RowActions } from "./ThreadRow";
import { useUnread } from "./useUnread";
import { useVersionUpdate } from "@/lib/use-version-update";

export type SidebarLive = {
  // The open conversation and its agent are the only ones whose live state this page knows.
  threadId: number | null;
  agentId: number | null;
  working: boolean;
  waiting: boolean;
};

// How many conversations Recent lists before "Show all"; anything needing attention is always listed.
const RECENT_LIMIT = 8;

const NAV_CURRENT = "bg-hover text-ink";

const NAV_ITEM =
  "flex h-control-md min-w-0 cursor-pointer items-center gap-2 rounded-field px-2 text-label font-medium text-muted transition-colors duration-(--dur-fast) hover:bg-hover/60 hover:text-ink touch:h-touch";

// `notice`: a short word shown beside the label (a dot in the rail) and the sentence it stands for.
type NavEntry = { key: string; label: string; icon: ReactNode; href?: string; onClick?: () => void; notice?: { word: string; label: string } };

// The app's left column (design: Main.html). Search, what waits for you, pinned agents, recent
// chats, the labelled navigation and who is signed in. `rail` is the 72 px collapsed form: avatars
// and icons only, every control keeping its accessible name.
export function Sidebar({
  agents,
  threads,
  selectedThreadId,
  selectedAgentId,
  live,
  showArchived,
  onToggleArchived,
  actions,
  error,
  onNewChat,
  onManageAgents,
  onDeleteAgent,
  onEditAgent,
  onChangeLead,
  leadAgentId = null,
  onNewAgent,
  onOpenToday,
  onOpenRoutines,
  onOpenPlanner,
  onOpenWorkflows,
  showApps = true,
  onNavigate,
  collaboration,
  workspaces,
  attention = null,
  computers = null,
  person = null,
  rail = false,
  current = null,
  agentsHref,
}: {
  agents: Agent[] | null;
  threads: Thread[] | null;
  selectedThreadId: number | null;
  selectedAgentId: number | null;
  live: SidebarLive;
  showArchived: boolean;
  onToggleArchived: () => void;
  actions: RowActions;
  error: string | null;
  onNewChat: (agentId?: number) => void;
  onManageAgents?: () => void;
  onDeleteAgent?: (agent: Agent) => void;
  onEditAgent?: (agent: Agent) => void;
  onChangeLead?: (agent: Agent, remove: boolean) => Promise<void>;
  leadAgentId?: number | null;
  onNewAgent?: () => void;
  onOpenToday?: () => void;
  onOpenRoutines?: () => void;
  onOpenPlanner?: () => void;
  onOpenWorkflows?: () => void;
  // The Apps page is for admins; a member is not offered it.
  showApps?: boolean;
  onNavigate?: () => void;
  collaboration?: ReactNode;
  // The hosted company switcher (components/shell/WorkspaceSwitcher.tsx); absent on the desktop and self-hosted.
  workspaces?: ReactNode;
  // The needs-you rows (approvals and questions become the "Waiting for you" row); null while unknown.
  attention?: NeedsYouRow[] | null;
  // Each agent's computer state by agent id; null while unknown.
  computers?: Map<number, string> | null;
  // Who is signed in, for the footer.
  person?: { name: string; detail?: string | null } | null;
  rail?: boolean;
  // The nav entry for the page on screen ("agents"), marked as current.
  current?: string | null;
  // With it, the Agents entry and "All agents" are links to the agents page instead of onManageAgents.
  agentsHref?: string;
}) {
  const t = useT();
  const { updateAvailable, latestVersion } = useVersionUpdate();
  const [showAll, setShowAll] = useState(false);
  const listed = sidebarAgents(agents);
  const grid = gridAgents(listed);
  const unread = useUnread(threads, selectedThreadId);
  const waiting = waitingRows(attention);
  const waitingLines = waitingByThread(attention);
  const firstWaiting = waiting.find((row) => row.thread_id !== null)?.thread_id ?? null;

  const names = new Map((agents ?? []).map((agent) => [agent.id, agent.name]));
  const shownThreads = recentVisible(
    threads ?? [],
    RECENT_LIMIT,
    (thread) =>
      thread.id === selectedThreadId ||
      thread.id === live.threadId ||
      unread.has(thread.id) ||
      waitingLines.has(thread.id) ||
      thread.session_state === "broken",
    showAll,
  );

  const go = (run: () => void) => () => {
    run();
    onNavigate?.();
  };
  const newChat = (agentId?: number) => go(() => onNewChat(agentId))();
  const activityOf = (agentId: number): AvatarActivity =>
    live.agentId === agentId ? (live.waiting ? "waiting" : live.working ? "working" : null) : null;
  const computerOf = (agentId: number | null | undefined) => (agentId == null || !computers ? null : computerBadge(computers.get(agentId)));

  const nav: NavEntry[] = [
    onOpenToday && { key: "today", label: t("sidebar.today"), icon: <CalendarDays size={16} aria-hidden="true" />, onClick: go(onOpenToday) },
    agentsHref && agents !== null
      ? { key: "agents", label: t("sidebar.agents"), icon: <Users size={16} aria-hidden="true" />, href: agentsHref }
      : onManageAgents && { key: "agents", label: t("sidebar.agents"), icon: <Users size={16} aria-hidden="true" />, onClick: go(onManageAgents) },
    onOpenPlanner && { key: "tasks", label: t("sidebar.tasks"), icon: <Columns3 size={16} aria-hidden="true" />, onClick: go(onOpenPlanner) },
    onOpenRoutines && { key: "routines", label: t("sidebar.routines"), icon: <CalendarClock size={16} aria-hidden="true" />, onClick: go(onOpenRoutines) },
    showApps && { key: "apps", label: t("sidebar.apps"), icon: <LayoutGrid size={16} aria-hidden="true" />, href: "/apps/" },
    onOpenWorkflows && { key: "workflows", label: "Workflows", icon: <GitBranch size={16} aria-hidden="true" />, onClick: go(onOpenWorkflows) },
    showApps && { key: "clients", label: "Clients", icon: <Building2 size={16} aria-hidden="true" />, href: "/clients/" },
    {
      key: "settings",
      label: t("sidebar.settings"),
      icon: <Settings size={16} aria-hidden="true" />,
      href: "/settings/",
      notice: updateAvailable
        ? { word: t("shell.update"), label: latestVersion ? t("shell.updateAvailable", { version: latestVersion }) : t("shell.updateAvailableAny") }
        : undefined,
    },
  ].filter(Boolean) as NavEntry[];

  const waitingRow = waiting.length > 0 && (() => {
    const label = t("sidebar.waitingLabel", { n: waiting.length });
    const body = (
      <>
        <span className="inline-flex h-[22px] min-w-[22px] shrink-0 items-center justify-center rounded-full bg-warning-on px-1.5 text-[12px] font-semibold text-surface">
          {waiting.length}
        </span>
        {!rail && <span className="flex-1 truncate">{t("status.waiting")}</span>}
        {!rail && <span className="font-medium">{t("sidebar.review")}</span>}
      </>
    );
    const cls = cn(
      "flex h-10 shrink-0 cursor-pointer items-center gap-2.5 rounded-field bg-warning-bg text-label font-semibold text-warning-on transition-opacity hover:opacity-90 touch:h-touch",
      rail ? "justify-center px-0" : "px-2.5",
    );
    return firstWaiting !== null ? (
      <Link href={`/chat?thread=${firstWaiting}`} onClick={onNavigate} aria-label={label} title={rail ? label : undefined} className={cls}>{body}</Link>
    ) : onOpenToday ? (
      <button type="button" onClick={go(onOpenToday)} aria-label={label} title={rail ? label : undefined} className={cls}>{body}</button>
    ) : null;
  })();

  const tiles = agents !== null && grid.agents.length > 0 && (
    <section aria-label={grid.pinned ? t("sidebar.pinned") : t("sidebar.agents")} className="flex flex-col gap-1">
      {!rail && (
        <div className="flex items-center justify-between px-2.5 text-small font-medium text-muted">
          <span>{grid.pinned ? t("sidebar.pinned") : t("sidebar.agents")}</span>
          {agentsHref ? (
            <Link href={agentsHref} onClick={onNavigate} className="cursor-pointer hover:text-ink">
              {t("sidebar.allAgents")}
            </Link>
          ) : onManageAgents && (
            <button type="button" onClick={go(onManageAgents)} className="cursor-pointer hover:text-ink">
              {t("sidebar.allAgents")}
            </button>
          )}
        </div>
      )}
      <ul className={cn("grid gap-0.5", rail ? "grid-cols-1" : "grid-cols-3")}>
        {grid.agents.map((agent) => (
          <AgentTile
            key={agent.id}
            agent={agent}
            rail={rail}
            selected={selectedAgentId === agent.id}
            activity={activityOf(agent.id)}
            computer={computerOf(agent.id)}
            isLead={leadAgentId === agent.id}
            href={(() => {
              const target = agentTarget(threads, agent.id);
              return target.kind === "thread" ? `/chat?thread=${target.id}` : null;
            })()}
            onOpenChat={() => newChat(agent.id)}
            onNavigate={onNavigate}
            onEdit={onEditAgent ? () => onEditAgent(agent) : undefined}
            onChangeLead={onChangeLead ? () => void onChangeLead(agent, leadAgentId === agent.id) : undefined}
            onDelete={onDeleteAgent ? () => onDeleteAgent(agent) : undefined}
          />
        ))}
      </ul>
      {!rail && agents !== null && listed.length === 0 && onNewAgent && (
        <button type="button" onClick={go(onNewAgent)} className="rounded-field px-2.5 py-1.5 text-left text-small text-muted hover:bg-hover/60 hover:text-ink">
          {t("sidebar.createAgent")}
        </button>
      )}
    </section>
  );

  const recent = (
    <section aria-label={t("sidebar.recent")} className="flex flex-col gap-0.5 border-t border-line pt-2">
      <div className="flex items-center justify-between px-2.5 pb-1 text-small font-medium text-muted">
        <span>{t("sidebar.recent")}</span>
        <IconButton
          label={showArchived ? t("sidebar.hideArchived") : t("sidebar.showArchived")}
          pressed={showArchived}
          onClick={onToggleArchived}
          className="size-6 touch:size-9"
        >
          <Archive size={13} />
        </IconButton>
      </div>
      <ul className="flex flex-col gap-0.5">
        {threads === null && (
          <li>
            <SkeletonList rows={4} className="px-1 pt-1" />
          </li>
        )}
        {threads?.length === 0 && (
          <li className="px-2.5 py-2 text-small text-muted">{showArchived ? t("sidebar.emptyArchived") : t("sidebar.emptyTitle")}</li>
        )}
        {shownThreads.map((thread) => {
          const open = thread.id === live.threadId;
          return (
            <ThreadRow
              key={thread.id}
              thread={thread}
              selected={thread.id === selectedThreadId}
              agentName={thread.agent_id != null ? names.get(thread.agent_id) : undefined}
              status={{ working: open && live.working, waiting: (open && live.waiting) || waitingLines.has(thread.id) }}
              waitingLine={waitingLines.get(thread.id)}
              computer={computerOf(thread.agent_id)}
              unread={unread.has(thread.id)}
              actions={actions}
              onNavigate={onNavigate}
            />
          );
        })}
        {threads !== null && threads.length > RECENT_LIMIT && (
          <li>
            <button
              type="button"
              aria-expanded={showAll}
              onClick={() => setShowAll((on) => !on)}
              className="w-full cursor-pointer rounded-field px-2.5 py-1.5 text-left text-small font-medium text-muted hover:bg-hover/60 hover:text-ink touch:py-2.5"
            >
              {showAll ? t("sidebar.showFewer") : t("sidebar.showAll")}
            </button>
          </li>
        )}
      </ul>
    </section>
  );

  const footer = (
    <div className={cn("flex shrink-0 items-center gap-2.5 pt-2", rail ? "flex-col" : "px-1.5")}>
      <span
        role="img"
        aria-label={person?.name ?? t("sidebar.you")}
        title={rail ? person?.name ?? undefined : undefined}
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-hover text-[12px] font-semibold text-ink"
      >
        {(person?.name ?? "?").trim().charAt(0).toUpperCase() || "?"}
      </span>
      {!rail && (
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-label font-medium">{person?.name ?? t("sidebar.you")}</span>
          {person?.detail ? <span className="truncate text-small text-muted">{person.detail}</span> : null}
        </span>
      )}
      {/* Too wide for the 72 px rail; Settings has the same choice. */}
      {!rail && <ThemeToggle iconOnly />}
    </div>
  );

  if (rail) {
    return (
      <nav aria-label={t("shell.conversations")} className="flex h-full min-h-0 flex-col items-stretch gap-3 bg-app px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-4 text-ink">
        <div className="flex flex-col items-center gap-1">
          <IconButton label={t("shell.newChat")} onClick={() => newChat()}>
            <Plus size={18} />
          </IconButton>
          <IconButton label={t("palette.open")} onClick={openCommandPalette}>
            <Search size={17} />
          </IconButton>
        </div>
        {waitingRow}
        <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{tiles}</div>
        <ul aria-label={t("sidebar.main")} className="flex flex-col items-center gap-0.5 border-t border-line pt-2">
          {nav.map((entry) => {
            const name = entry.notice ? `${entry.label}: ${entry.notice.label}` : entry.label;
            const dot = entry.notice && <span aria-hidden="true" className="absolute right-1 top-1 size-2 rounded-full bg-accent" />;
            return (
              <li key={entry.key}>
                {entry.href ? (
                  <Link href={entry.href} onClick={onNavigate} aria-label={name} title={name} aria-current={entry.key === current ? "page" : undefined} className={cn(NAV_ITEM, "relative size-9 justify-center px-0", entry.key === current && NAV_CURRENT)}>
                    {entry.icon}
                    {dot}
                  </Link>
                ) : (
                  <button type="button" onClick={entry.onClick} aria-label={name} title={name} aria-current={entry.key === current ? "page" : undefined} className={cn(NAV_ITEM, "relative size-9 justify-center px-0", entry.key === current && NAV_CURRENT)}>
                    {entry.icon}
                    {dot}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
        {footer}
      </nav>
    );
  }

  return (
    <nav aria-label={t("shell.conversations")} className="flex h-full min-h-0 flex-col gap-3 bg-app px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-4 text-ink">
      <div className="flex shrink-0 items-center justify-between pl-2.5 pr-1">
        <Wordmark />
        <IconButton label={t("shell.newChat")} onClick={() => newChat()}>
          <Plus size={18} />
        </IconButton>
      </div>
      <div className="-mb-3 flex min-h-0 flex-1 flex-col">
        <ConversationSearch agentNames={names} onNavigate={onNavigate} onJump={openCommandPalette}>
          <div className="flex flex-col gap-3">
            {waitingRow}
            {tiles}
            {recent}
            {collaboration}
          </div>
        </ConversationSearch>
      </div>

      {error && <p role="alert" className="px-2.5 text-small text-danger">{error}</p>}

      <ul aria-label={t("sidebar.main")} className="grid shrink-0 grid-cols-2 gap-0.5 border-t border-line pt-2">
        {nav.map((entry) => {
          // The word needs room: an entry with a notice takes the whole row.
          const notice = entry.notice && (
            <span title={entry.notice.label} className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full bg-accent-bg px-1.5 text-[11px] font-semibold leading-[18px] text-accent-text">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-accent" />
              {entry.notice.word}
              <span className="sr-only">{`: ${entry.notice.label}`}</span>
            </span>
          );
          return (
            <li key={entry.key} className={cn("min-w-0", entry.notice && "col-span-2")}>
              {entry.href ? (
                <Link href={entry.href} onClick={onNavigate} aria-current={entry.key === current ? "page" : undefined} className={cn(NAV_ITEM, entry.key === current && NAV_CURRENT)}>
                  {entry.icon}
                  <span className="truncate">{entry.label}</span>
                  {notice}
                </Link>
              ) : (
                <button type="button" onClick={entry.onClick} aria-current={entry.key === current ? "page" : undefined} className={cn(NAV_ITEM, "w-full", entry.key === current && NAV_CURRENT)}>
                  {entry.icon}
                  <span className="truncate">{entry.label}</span>
                  {notice}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {workspaces}
      {footer}
    </nav>
  );
}

// One agent in the avatar grid: avatar with its activity dot and computer badge, the name under it,
// and the agent's menu (settings, lead, delete) on the "…" button or a right-click.
function AgentTile({
  agent,
  rail,
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
}: {
  agent: Agent;
  rail: boolean;
  selected: boolean;
  activity: AvatarActivity;
  computer: "on" | "off" | null;
  isLead: boolean;
  href: string | null;
  onOpenChat: () => void;
  onNavigate?: () => void;
  onEdit?: () => void;
  onChangeLead?: () => void;
  onDelete?: () => void;
}) {
  const t = useT();
  const [menuOpen, setMenuOpen] = useState(false);
  const hasMenu = Boolean(onEdit || onChangeLead || onDelete);
  const state = [
    activity === "working" ? t("status.working") : activity === "waiting" ? t("status.waiting") : null,
    computer === "on" ? t("sidebar.computerOn") : computer === "off" ? t("sidebar.computerOff") : null,
    isLead ? t("sidebar.lead") : null,
  ].filter(Boolean);
  const label = [t("sidebar.chatWith", { name: agent.name }), ...state].join(", ");
  const cls = cn(
    "flex w-full min-w-0 cursor-pointer flex-col items-center gap-1.5 rounded-card px-1 py-2.5 text-ink transition-colors duration-(--dur-fast)",
    selected ? "bg-hover" : "hover:bg-hover/60",
    rail && "py-1.5",
  );
  const body = (
    <>
      <Avatar agentId={agent.id} name={agent.name} size={rail ? "md" : "xl"} activity={activity} computer={computer} />
      {!rail && <span className="max-w-full truncate text-small font-medium">{agent.name}</span>}
    </>
  );
  return (
    <li
      className="group relative min-w-0"
      onContextMenu={hasMenu ? (event) => { event.preventDefault(); setMenuOpen(true); } : undefined}
    >
      {href !== null ? (
        <Link href={href} onClick={onNavigate} aria-label={label} title={rail ? label : undefined} aria-current={selected ? "true" : undefined} className={cls}>
          {body}
        </Link>
      ) : (
        <button type="button" onClick={onOpenChat} aria-label={label} title={rail ? label : undefined} aria-current={selected ? "true" : undefined} className={cls}>
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
            {onDelete && (
              <>
                {(onEdit || onChangeLead) && <MenuSeparator />}
                <MenuItem onSelect={onDelete} danger icon={<Trash2 size={14} />}>{t("sidebar.deleteAgent")}</MenuItem>
              </>
            )}
          </Menu>
        </div>
      )}
    </li>
  );
}
