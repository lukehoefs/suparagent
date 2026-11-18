"use client";

import { FileText, LayoutGrid, MessageSquare, Monitor, Plus, Repeat, Search, SquareCheck, Sun, Users, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import type { Agent, Thread } from "@/lib/api";
import { groupThreads, pinnedTiles } from "@/lib/agent-groups";
import type { TeamState } from "@/lib/collaboration";
import { cn } from "@/lib/cn";
import { currentSheetPage, sheetPages, shellPages, TODAY_HREF, type SheetPageKey } from "@/lib/shell-nav";
import { can } from "@/lib/permissions";
import { useT } from "@/lib/use-i18n";
import {
  agentActivities,
  agentComputerBadge,
  hasMoreBelow,
  recentVisible,
  sidebarAgents,
  waitingByThread,
  workingThreadIds,
} from "@/lib/sidebar";
import type { NeedsYouRow } from "@/lib/needs-you";
import { useSession } from "@/components/AuthGate";
import { ConversationSearch } from "@/components/chat/ConversationSearch";
import { type AvatarActivity } from "@/components/ui/Avatar";
import { IconButton } from "@/components/ui/IconButton";
import { SlidersIcon } from "@/components/ui/SlidersIcon";
import { SkeletonList } from "@/components/ui/Skeleton";
import { Wordmark } from "@/components/ui/Wordmark";
import { openCommandPalette } from "./CommandPalette";
import { PinnedAgents, useAgentGroups } from "./PinnedAgents";
import { ThreadRow, type RowActions } from "./ThreadRow";
import { useSignedInPerson } from "./usePerson";
import { useUnread } from "./useUnread";
import { refreshWaiting, useWaiting } from "./useWaiting";
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

// The phone menu's "Go to" tiles (design: MobileMenu.html): filled, 44 px, two across.
const SHEET_TILE =
  "flex h-touch w-full min-w-0 cursor-pointer items-center gap-2.5 rounded-field bg-inset px-3 text-body font-medium text-ink transition-colors duration-(--dur-fast) hover:bg-hover";

// `notice`: a short word shown beside the label (a dot in the rail) and the sentence it stands for.
type NavEntry = { key: SheetPageKey; label: string; icon: ReactNode; href?: string; onClick?: () => void; notice?: { word: string; label: string } };

// The design's icons, drawn at its 1.7 stroke. Settings is the design's own two-slider glyph.
const NAV_ICONS: Record<Exclude<SheetPageKey, "settings">, LucideIcon> = {
  today: Sun,
  chat: MessageSquare,
  agents: Users,
  tasks: SquareCheck,
  results: FileText,
  routines: Repeat,
  apps: LayoutGrid,
  computers: Monitor,
};

function navIcon(key: SheetPageKey, size: number): ReactNode {
  if (key === "settings") return <SlidersIcon size={size} />;
  const Icon = NAV_ICONS[key];
  return <Icon size={size} strokeWidth={1.7} aria-hidden="true" />;
}

// True while the scrolling list that holds `node` (its parent) has more below its visible end.
function useMoreBelow(node: HTMLElement | null): boolean {
  const [more, setMore] = useState(false);
  useEffect(() => {
    const box = node?.parentElement;
    if (!node || !box) return;
    const update = () => setMore(hasMoreBelow(box));
    // A ResizeObserver reports once as soon as it observes, so the first state needs no call here.
    const observer = new ResizeObserver(update);
    observer.observe(box);
    observer.observe(node);
    box.addEventListener("scroll", update, { passive: true });
    return () => {
      observer.disconnect();
      box.removeEventListener("scroll", update);
    };
  }, [node]);
  return node !== null && more;
}

// The app's left column (design: Main.html). Wordmark and new chat, search, what waits for you,
// pinned agents and groups, recent chats, the labelled navigation, and who is signed in with their
// menu. `rail` is the 72 px collapsed form: avatars and icons only, every control keeping its
// accessible name. `sheet` is the phone menu (design: MobileMenu.html, inside <MobileMenu>): what
// waits, the pinned agents four across, the "Go to" tiles, the conversation search and Recent (with
// each row's menu and the archive toggle), and who is signed in. Workflows, Clients, and Team &
// rooms are in the footer menu and the command palette.
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
  onOpenWorkflows,
  admin = true,
  onNavigate,
  navigate,
  workspaces,
  attention = null,
  computers = null,
  person = null,
  team = null,
  rail = false,
  sheet = false,
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
  // Offered in the footer menu (it is not in the design's navigation).
  onOpenWorkflows?: () => void;
  // Owner or admin: Today, Tasks, Results, Routines, Apps and Computers (lib/shell-nav.ts), and in
  // the footer menu Clients and notifications.
  admin?: boolean;
  onNavigate?: () => void;
  // How the sidebar changes page itself (Message all, the footer menu); a host with a leave
  // guard passes its own. Default: the router.
  navigate?: (href: string) => void;
  // The hosted company switcher (components/shell/WorkspaceSwitcher.tsx); absent on the desktop and self-hosted.
  workspaces?: ReactNode;
  // The host's needs-you rows; null while unknown. The "Waiting for you" band and the waiting lines
  // come from Today's list (components/shell/useWaiting.ts); these count by the same rule only
  // while the Today brief cannot be read.
  attention?: NeedsYouRow[] | null;
  // Each agent's own (Docker) computer state by agent id; null while unknown. An agent's cloud
  // computer comes with the agent (remote_computer) and wins.
  computers?: Map<number, string> | null;
  // Who is signed in, for the footer. Left out: the session's person, or the owner's profile name
  // (components/shell/usePerson.ts).
  person?: { name: string; detail?: string | null } | null;
  // GET /team: its name is the workspace's in the footer ("Luke · LH Tech").
  team?: TeamState | null;
  rail?: boolean;
  sheet?: boolean;
  // The nav entry for the page on screen (lib/shell-nav.ts currentShellPage), marked as current.
  current?: string | null;
  // With it, the Agents entry and "All agents" are links to the agents page instead of onManageAgents.
  agentsHref?: string;
}) {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const { session } = useSession();
  const { updateAvailable, latestVersion } = useVersionUpdate();
  const ownPerson = useSignedInPerson();
  // What waits (owner and admin): the list Today shows under "Waiting for you", so the band says
  // its number; the answers running now give the working dots and the tool an approval waits on.
  const waiting = useWaiting(admin, attention);
  const running = waiting.running;
  // The conversation list moved (a message, a new chat): what waits may have too.
  const threadsVersion = useMemo(() => threads?.map((thread) => `${thread.id}:${thread.updated_at}`).join(",") ?? "", [threads]);
  useEffect(() => {
    if (admin && threadsVersion) refreshWaiting();
  }, [admin, threadsVersion]);
  const [showAll, setShowAll] = useState(false);
  const [openGroupId, setOpenGroupId] = useState<number | null>(null);
  const [listNode, setListNode] = useState<HTMLDivElement | null>(null);
  const moreBelow = useMoreBelow(listNode);
  const goToId = useId();
  const listed = sidebarAgents(agents);
  const { groups, settled: groupsSettled, reload: reloadGroups } = useAgentGroups(agents);
  // Until the groups are known, an agent in one waits for its stack instead of showing on its own.
  const grid = pinnedTiles(groupsSettled ? listed : listed.filter((agent) => agent.group_id == null), groups);
  const unread = useUnread(threads, selectedThreadId);
  const waitingCount = waiting.items?.length ?? 0;
  const waitingLines = waitingByThread(waiting.rows, running);
  const working = workingThreadIds(running);
  // The open conversation's own live state is newer than the last read of the running answers.
  if (live.threadId !== null) working.delete(live.threadId);
  let firstWaiting: number | null = null;
  for (const item of waiting.items ?? []) {
    const threadId = item.type === "approval" ? item.threadId : item.row.thread_id;
    if (threadId !== null) {
      firstWaiting = threadId;
      break;
    }
  }
  const activities = agentActivities({ live, threads, waitingThreadIds: waitingLines.keys(), workingThreadIds: working });
  const push = navigate ?? ((href: string) => router.push(href));
  // Arranging groups is editing agents: the manage scope with the agents permission, or admin.
  const canArrange = session === null || session.scopes.includes("admin") || (session.scopes.includes("manage") && can(session.permissions, "agents"));

  // The open tray belongs to a stack on screen: a group that went (ungrouped, emptied) shows none.
  // Group ids are never reused, so a stale id cannot open another group's tray later.
  const openStack = grid.tiles.find((tile) => tile.kind === "group" && tile.group.id === openGroupId);
  const openGroup = openStack?.kind === "group" ? openStack.group : null;

  const names = new Map((agents ?? []).map((agent) => [agent.id, agent.name]));
  const byId = new Map((agents ?? []).map((agent) => [agent.id, agent]));
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
  // The badge: the agent's cloud computer (green while its gateway answers), else its own computer.
  const computerOf = (agentId: number | null | undefined) =>
    agentId == null ? null : agentComputerBadge(byId.get(agentId)?.remote_computer, computers?.get(agentId));
  // What a waiting conversation's row says (design: "Atlas wants to use searxng_web_search"); the
  // needs-you row's own title while the tool or the agent is not known.
  const waitingText = (thread: Thread): string | undefined => {
    const line = waitingLines.get(thread.id);
    if (!line) return undefined;
    const name = thread.agent_id != null ? names.get(thread.agent_id) : undefined;
    return line.tool && name ? t("approval.wantsToUse", { name, tool: line.tool }) : line.title;
  };

  // The design's navigation (Main.html), every entry a page: lib/shell-nav.ts lists them in order.
  const navLabels: Record<SheetPageKey, string> = {
    today: t("sidebar.today"),
    chat: t("sidebarMenu.chat"),
    agents: t("sidebar.agents"),
    tasks: t("sidebar.tasks"),
    results: t("results.nav"),
    routines: t("sidebar.routines"),
    apps: t("sidebar.apps"),
    computers: t("sidebarNav.computers"),
    settings: t("sidebar.settings"),
  };
  const entryFor = (page: { key: SheetPageKey; href: string }, iconSize: number): NavEntry[] => {
    const entry = { key: page.key, label: navLabels[page.key], icon: navIcon(page.key, iconSize) };
    // Agents links to the agents pages once the list has loaded; a host without them opens its own.
    if (page.key === "agents") {
      if (agentsHref && agents !== null) return [{ ...entry, href: agentsHref }];
      return onManageAgents ? [{ ...entry, onClick: go(onManageAgents) }] : [];
    }
    if (page.key === "settings" && updateAvailable) {
      const label = latestVersion ? t("shell.updateAvailable", { version: latestVersion }) : t("shell.updateAvailableAny");
      return [{ ...entry, href: page.href, notice: { word: t("shell.update"), label } }];
    }
    return [{ ...entry, href: page.href }];
  };
  const nav: NavEntry[] = sheet ? [] : shellPages(admin).flatMap((page) => entryFor(page, 16));
  const sheetNav: NavEntry[] = sheet ? sheetPages(admin).flatMap((page) => entryFor(page, 18)) : [];
  const sheetCurrent = sheet ? currentSheetPage(pathname) : null;

  const waitingRow = waitingCount > 0 && (() => {
    const label = t("sidebar.waitingLabel", { n: waitingCount });
    const body = (
      <>
        <span
          className={cn(
            "inline-flex shrink-0 items-center justify-center rounded-full bg-warning-on px-1.5 text-[12px] font-semibold text-surface",
            sheet ? "h-6 min-w-6" : "h-[22px] min-w-[22px]",
          )}
        >
          {waitingCount}
        </span>
        {!rail && <span className="flex-1 truncate">{t("status.waiting")}</span>}
        {!rail && <span className={sheet ? undefined : "font-medium"}>{t("sidebar.review")}</span>}
      </>
    );
    const cls = cn(
      "flex shrink-0 cursor-pointer items-center gap-2.5 bg-warning-bg font-semibold text-warning-on transition-opacity hover:opacity-90",
      // The phone sheet's band is the design's larger one (MobileMenu.html: 48 px, 12 px corners).
      sheet ? "h-12 rounded-[12px] px-3 text-body" : "h-10 rounded-field text-label touch:h-touch",
      !sheet && (rail ? "justify-center px-0" : "px-2.5"),
    );
    // Review: the Today page, which lists everything waiting with its answers (design: Main.html);
    // without it, the first conversation that waits.
    const href = admin ? TODAY_HREF : firstWaiting !== null ? `/chat?thread=${firstWaiting}` : null;
    return href !== null ? (
      <Link href={href} onClick={onNavigate} aria-label={label} title={rail ? label : undefined} className={cls}>{body}</Link>
    ) : null;
  })();

  const pinnedTitle = grid.pinned ? t("sidebar.pinned") : t("sidebar.agents");
  // On the phone the "Go to" tiles hold Agents, so the header is the label alone (MobileMenu.html).
  const pinnedHeader = sheet ? (
    <span className="pb-2.5 text-small font-medium text-muted">{pinnedTitle}</span>
  ) : !rail && (
    <div className="flex items-center justify-between px-2.5 text-small font-medium text-muted">
      <span>{pinnedTitle}</span>
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
      columns={sheet ? 4 : 3}
      surface={sheet}
      selectedAgentId={selectedAgentId}
      // The open conversation's row in Recent marks the selection (design: Chat.html); the tile
      // is filled only on the agent's own pages, where no conversation is open.
      highlightSelected={selectedThreadId === null}
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

  // Text controls at the foot of Recent, shown at rest (touch has no hover).
  const footButton = "inline-flex min-h-8 cursor-pointer items-center rounded-field px-2.5 text-left text-small font-medium text-muted hover:bg-hover/60 hover:text-ink touch:min-h-touch";
  const recentTitle = openGroup ? t("groups.recentIn", { name: openGroup.name }) : t("sidebar.recent");
  const recent = (
    <section aria-label={recentTitle} className="flex flex-col gap-0.5 border-t border-line pt-2">
      <div className="truncate px-2.5 pb-1 text-small font-medium text-muted">{recentTitle}</div>
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
              status={{ working: open ? live.working : working.has(thread.id), waiting: (open && live.waiting) || waitingLines.has(thread.id) }}
              waitingLine={waitingText(thread)}
              computer={computerOf(thread.agent_id)}
              unread={unread.has(thread.id)}
              actions={actions}
              onNavigate={onNavigate}
            />
          );
        })}
      </ul>
      {threads !== null && (
        <div className="flex flex-wrap items-center justify-between gap-x-2">
          {recentThreads.length > RECENT_LIMIT && (
            <button type="button" aria-expanded={showAll} onClick={() => setShowAll((on) => !on)} className={footButton}>
              {showAll ? t("sidebar.showFewer") : t("sidebar.showAll")}
            </button>
          )}
          <button type="button" onClick={onToggleArchived} className={footButton}>
            {showArchived ? t("sidebar.hideArchived") : t("sidebar.showArchived")}
          </button>
        </div>
      )}
    </section>
  );

  const footer = (
    <WorkspaceMenu
      person={person ?? ownPerson}
      workspace={team?.team?.name?.trim() || null}
      rail={rail}
      sheet={sheet}
      admin={admin}
      teamReady={team !== null}
      onOpenWorkflows={onOpenWorkflows}
      navigate={push}
      onNavigate={onNavigate}
    />
  );

  if (sheet) {
    return (
      <nav aria-label={t("sidebar.main")} className="flex flex-col gap-3.5 text-ink">
        {waitingRow}
        {tiles}
        <div id={goToId} className="text-small font-medium text-muted">{t("sidebarMenu.goTo")}</div>
        <ul aria-labelledby={goToId} className="grid grid-cols-2 gap-2">
          {sheetNav.map((entry, index) => {
            const isCurrent = entry.key === sheetCurrent;
            // A last tile alone in its row takes the whole row.
            const wide = sheetNav.length % 2 === 1 && index === sheetNav.length - 1;
            const notice = entry.notice && (
              <span title={entry.notice.label} className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full bg-accent-bg px-1.5 text-[11px] font-semibold leading-[18px] text-accent-text">
                <span aria-hidden="true" className="size-1.5 rounded-full bg-accent" />
                {entry.notice.word}
                <span className="sr-only">{`: ${entry.notice.label}`}</span>
              </span>
            );
            const body = (
              <>
                {entry.icon}
                <span className="truncate">{entry.label}</span>
                {notice}
              </>
            );
            return (
              <li key={entry.key} className={cn("min-w-0", wide && "col-span-2")}>
                {entry.href ? (
                  <Link href={entry.href} onClick={onNavigate} aria-current={isCurrent ? "page" : undefined} className={cn(SHEET_TILE, isCurrent && "bg-hover")}>
                    {body}
                  </Link>
                ) : (
                  <button type="button" onClick={entry.onClick} aria-current={isCurrent ? "page" : undefined} className={cn(SHEET_TILE, isCurrent && "bg-hover")}>
                    {body}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
        {/* The conversations, as in the side column: search over every title and message (archived
            ones too), and Recent with each row's menu (rename, archive, delete) and Show all and
            Show archived at its foot. A phone has no other place for them. Its field is the
            phone's 44 px whatever the pointer, as every control in this sheet. */}
        <div className="[&_input[type=text]]:h-touch [&_input[type=text]]:pr-3">
          <ConversationSearch agentNames={names} onNavigate={onNavigate}>
            {recent}
          </ConversationSearch>
        </div>
        {error && <p role="alert" className="text-small text-danger">{error}</p>}
        {workspaces}
        {footer}
      </nav>
    );
  }

  if (rail) {
    return (
      <nav aria-label={t("shell.conversations")} className="flex h-full min-h-0 flex-col items-stretch gap-3 px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-4 text-ink">
        <div className="flex flex-col items-center gap-1">
          <IconButton label={t("shell.newChat")} onClick={() => newChat()}>
            <Plus size={18} strokeWidth={1.7} />
          </IconButton>
          <IconButton label={t("palette.open")} onClick={openCommandPalette}>
            <Search size={17} strokeWidth={1.7} />
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
    <nav aria-label={t("shell.conversations")} className="flex h-full min-h-0 flex-col gap-3 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-4 text-ink">
      <div className="flex shrink-0 items-center justify-between pl-2.5 pr-1.5">
        <Wordmark />
        <IconButton label={t("shell.newChat")} onClick={() => newChat()}>
          <Plus size={16} strokeWidth={1.7} />
        </IconButton>
      </div>
      {/* The list scrolls under the navigation; while more sits below, its last 24 px fade out, so
          a row cut at the edge reads as "scroll for more" (the scrollbar is hidden). */}
      <div className={cn("-mb-3 flex min-h-0 flex-1 flex-col", moreBelow && "[mask-image:linear-gradient(to_bottom,black_calc(100%_-_24px),transparent)]")}>
        <ConversationSearch agentNames={names} onNavigate={onNavigate} onJump={openCommandPalette}>
          <div ref={setListNode} className="flex flex-col gap-3">
            {waitingRow}
            {tiles}
            {recent}
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
