"use client";

import { Archive, LayoutGrid, Monitor, Plus, Repeat, Search, SlidersHorizontal, SquareCheck, Sun, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import type { Agent, Thread } from "@/lib/api";
import { groupThreads, pinnedTiles } from "@/lib/agent-groups";
import type { TeamState } from "@/lib/collaboration";
import { cn } from "@/lib/cn";
import { can } from "@/lib/permissions";
import { useT } from "@/lib/use-i18n";
import { agentActivities, computerBadge, recentVisible, sidebarAgents, waitingByThread, waitingRows } from "@/lib/sidebar";
import type { NeedsYouRow } from "@/lib/needs-you";
import { useSession } from "@/components/AuthGate";
import { ConversationSearch } from "@/components/chat/ConversationSearch";
import { type AvatarActivity } from "@/components/ui/Avatar";
import { IconButton } from "@/components/ui/IconButton";
import { SkeletonList } from "@/components/ui/Skeleton";
import { Wordmark } from "@/components/ui/Wordmark";
import { openCommandPalette } from "./CommandPalette";
import { PinnedAgents, useAgentGroups } from "./PinnedAgents";
import { ThreadRow, type RowActions } from "./ThreadRow";
import { useUnread } from "./useUnread";
import { WorkspaceMenu } from "./WorkspaceMenu";
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

// The app's left column (design: Main.html). Wordmark and new chat, search, what waits for you,
// pinned agents and groups, recent chats, the labelled navigation, and who is signed in with their
// menu. `rail` is the 72 px collapsed form: avatars and icons only, every control keeping its
// accessible name. Workflows and Clients are in the footer menu and the command palette.
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
  navigate,
  collaboration,
  workspaces,
  attention = null,
  computers = null,
  person = null,
  team = null,
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
  // Offered in the footer menu (it is not in the design's navigation).
  onOpenWorkflows?: () => void;
  // Owner or admin: Apps, Computers and (in the footer menu) Clients and notifications.
  showApps?: boolean;
  onNavigate?: () => void;
  // How the sidebar changes page itself (Message all, the footer menu); a host with a leave
  // guard passes its own. Default: the router.
  navigate?: (href: string) => void;
  collaboration?: ReactNode;
  // The hosted company switcher (components/shell/WorkspaceSwitcher.tsx); absent on the desktop and self-hosted.
  workspaces?: ReactNode;
  // The needs-you rows (approvals, questions and tasks due become the "Waiting for you" band); null while unknown.
  attention?: NeedsYouRow[] | null;
  // Each agent's computer state by agent id; null while unknown.
  computers?: Map<number, string> | null;
  // Who is signed in, for the footer.
  person?: { name: string; detail?: string | null } | null;
  // GET /team: its name is the workspace's in the footer ("Luke · LH Tech").
  team?: TeamState | null;
  rail?: boolean;
  // The nav entry for the page on screen ("agents", "computers"), marked as current.
  current?: string | null;
  // With it, the Agents entry and "All agents" are links to the agents page instead of onManageAgents.
  agentsHref?: string;
}) {
  const t = useT();
  const router = useRouter();
  const { session } = useSession();
  const { updateAvailable, latestVersion } = useVersionUpdate();
  const [showAll, setShowAll] = useState(false);
  const [openGroupId, setOpenGroupId] = useState<number | null>(null);
  const listed = sidebarAgents(agents);
  const { groups, settled: groupsSettled, reload: reloadGroups } = useAgentGroups(agents);
  // Until the groups are known, an agent in one waits for its stack instead of showing on its own.
  const grid = pinnedTiles(groupsSettled ? listed : listed.filter((agent) => agent.group_id == null), groups);
  const unread = useUnread(threads, selectedThreadId);
  const waiting = waitingRows(attention);
  const waitingLines = waitingByThread(attention);
  const firstWaiting = waiting.find((row) => row.thread_id !== null)?.thread_id ?? null;
  const activities = agentActivities({ live, threads, waitingThreadIds: waitingLines.keys() });
  const push = navigate ?? ((href: string) => router.push(href));
  // Arranging groups is editing agents: the manage scope with the agents permission, or admin.
  const canArrange = session === null || session.scopes.includes("admin") || (session.scopes.includes("manage") && can(session.permissions, "agents"));

  // The open tray belongs to a stack on screen: a group that went (ungrouped, emptied) shows none.
  // Group ids are never reused, so a stale id cannot open another group's tray later.
  const openStack = grid.tiles.find((tile) => tile.kind === "group" && tile.group.id === openGroupId);
  const openGroup = openStack?.kind === "group" ? openStack.group : null;

  const names = new Map((agents ?? []).map((agent) => [agent.id, agent.name]));
  const recentThreads = groupThreads(threads ?? [], openGroup);
  const shownThreads = recentVisible(
    recentThreads,
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
  const activityOf = (agentId: number): AvatarActivity => activities.get(agentId) ?? null;
  const computerOf = (agentId: number | null | undefined) => (agentId == null || !computers ? null : computerBadge(computers.get(agentId)));

  // The design's navigation (Main.html). Results has no page yet, so it is not listed.
  const nav: NavEntry[] = [
    onOpenToday && { key: "today", label: t("sidebar.today"), icon: <Sun size={16} aria-hidden="true" />, onClick: go(onOpenToday) },
    agentsHref && agents !== null
      ? { key: "agents", label: t("sidebar.agents"), icon: <Users size={16} aria-hidden="true" />, href: agentsHref }
      : onManageAgents && { key: "agents", label: t("sidebar.agents"), icon: <Users size={16} aria-hidden="true" />, onClick: go(onManageAgents) },
    onOpenPlanner && { key: "tasks", label: t("sidebar.tasks"), icon: <SquareCheck size={16} aria-hidden="true" />, onClick: go(onOpenPlanner) },
    onOpenRoutines && { key: "routines", label: t("sidebar.routines"), icon: <Repeat size={16} aria-hidden="true" />, onClick: go(onOpenRoutines) },
    showApps && { key: "apps", label: t("sidebar.apps"), icon: <LayoutGrid size={16} aria-hidden="true" />, href: "/apps/" },
    showApps && { key: "computers", label: t("sidebarNav.computers"), icon: <Monitor size={16} aria-hidden="true" />, href: "/computers/" },
    {
      key: "settings",
      label: t("sidebar.settings"),
      icon: <SlidersHorizontal size={16} aria-hidden="true" />,
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
    // Review: the first conversation that waits, else the needs-you card (Today).
    return firstWaiting !== null ? (
      <Link href={`/chat?thread=${firstWaiting}`} onClick={onNavigate} aria-label={label} title={rail ? label : undefined} className={cls}>{body}</Link>
    ) : onOpenToday ? (
      <button type="button" onClick={go(onOpenToday)} aria-label={label} title={rail ? label : undefined} className={cls}>{body}</button>
    ) : null;
  })();

  const pinnedHeader = !rail && (
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
  );

  const tiles = agents !== null && grid.tiles.length > 0 ? (
    <PinnedAgents
      listed={listed}
      tiles={grid.tiles}
      pinned={grid.pinned}
      groups={groups}
      threads={threads}
      rail={rail}
      selectedAgentId={selectedAgentId}
      leadAgentId={leadAgentId}
      activityOf={activityOf}
      computerOf={computerOf}
      openGroupId={openGroupId}
      onOpenGroup={setOpenGroupId}
      canArrange={canArrange}
      onArranged={reloadGroups}
      navigate={push}
      onNavigate={onNavigate}
      onNewChat={(agentId) => newChat(agentId)}
      menu={{
        onEdit: onEditAgent,
        onChangeLead: onChangeLead ? (agent) => void onChangeLead(agent, leadAgentId === agent.id) : undefined,
        onDelete: onDeleteAgent,
      }}
      header={pinnedHeader}
    />
  ) : !rail && agents !== null && listed.length === 0 && onNewAgent ? (
    <button type="button" onClick={go(onNewAgent)} className="rounded-field px-2.5 py-1.5 text-left text-small text-muted hover:bg-hover/60 hover:text-ink">
      {t("sidebar.createAgent")}
    </button>
  ) : null;

  const recentTitle = openGroup ? t("groups.recentIn", { name: openGroup.name }) : t("sidebar.recent");
  const recent = (
    <section aria-label={recentTitle} className="flex flex-col gap-0.5 border-t border-line pt-2">
      <div className="flex items-center justify-between px-2.5 pb-1 text-small font-medium text-muted">
        <span className="truncate">{recentTitle}</span>
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
        {threads !== null && recentThreads.length === 0 && (
          <li className="px-2.5 py-2 text-small text-muted">
            {openGroup ? t("groups.emptyRecent") : showArchived ? t("sidebar.emptyArchived") : t("sidebar.emptyTitle")}
          </li>
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
        {recentThreads.length > RECENT_LIMIT && (
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
    <WorkspaceMenu
      person={person ?? { name: t("sidebar.you") }}
      workspace={team?.team?.name?.trim() || null}
      rail={rail}
      admin={showApps}
      onOpenWorkflows={onOpenWorkflows}
      navigate={push}
      onNavigate={onNavigate}
    />
  );

  if (rail) {
    return (
      <nav aria-label={t("shell.conversations")} className="flex h-full min-h-0 flex-col items-stretch gap-3 bg-app px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-4 text-ink">
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
      <div className="flex shrink-0 items-center justify-between pl-2.5 pr-1.5">
        <Wordmark />
        <IconButton label={t("shell.newChat")} onClick={() => newChat()}>
          <Plus size={16} />
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
