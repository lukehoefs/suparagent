"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { BASE_PATH } from "@/lib/paths";
import { removeAgentFromClients } from "@/components/agents/agent-clients";
import { api, ApiError, type Agent, type Thread } from "@/lib/api";
import { AGENTS_HREF, editAgentHref, newAgentHref, parseAgentId } from "@/lib/agent-pages";
import { can } from "@/lib/permissions";
import { collaboration, type TeamState } from "@/lib/collaboration";
import type { NeedsYouRow } from "@/lib/needs-you";
import { currentShellPage, TODAY_HREF } from "@/lib/shell-nav";
import { SIDEBAR_INLINE, useMediaQuery } from "@/lib/use-media-query";
import { useT } from "@/lib/use-i18n";
import { useSession } from "@/components/AuthGate";
import { TeamPanel } from "@/components/chat/TeamPanel";
import { forgetAgentPicture, prunePictures, setPicturesEnabled } from "@/components/ui/AvatarPictures";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { IconButton } from "@/components/ui/IconButton";
import { MenuGlyph } from "@/components/ui/MenuGlyph";
import { OfflineBanner } from "@/components/ui/OfflineBanner";
import { Wordmark } from "@/components/ui/Wordmark";
import { CommandPalette, openCommandPalette } from "./CommandPalette";
import { MobileMenu } from "./MobileMenu";
import { Sidebar } from "./Sidebar";
import { SidebarFrame } from "./SidebarFrame";
import { useTeamPanelHost } from "./teamPanel";
import { useWaiting } from "./useWaiting";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";

// What the pages inside the shell can read and refresh. They share the sidebar's lists, so a create,
// rename or delete on a page shows in the sidebar at once.
export type AppShellData = {
  agents: Agent[] | null;
  threads: Thread[] | null;
  team: TeamState | null;
  // "loading" until the first answer, "failed" when GET /team could not be read (team is then null).
  teamStatus: "loading" | "ready" | "failed";
  // Opens the team panel (members, lead, delegation) that the shell hosts.
  openTeam: () => void;
  computers: Map<number, string> | null;
  attention: NeedsYouRow[] | null;
  refreshAgents: () => void;
  refreshThreads: () => void;
  refreshTeam: () => void;
  // Owner or admin: may delete agents, edit the team, see clients, counts and computers.
  isAdmin: boolean;
  // May create agents and change them (the "agents" permission).
  mayManageAgents: boolean;
  // Why the lists could not load (local execution off, the backend down).
  loadError: string | null;
  // A page says it holds unsaved work (use useLeaveGuard); while any does, leaving asks first.
  registerUnsaved: (id: string, dirty: boolean) => void;
};

const ShellContext = createContext<AppShellData | null>(null);

export function useAppShell(): AppShellData {
  const value = useContext(ShellContext);
  if (!value) throw new Error("useAppShell is used outside AppShell");
  return value;
}

/**
 * While `dirty`, leaving the page asks before discarding: in-app links, the sidebar, the command
 * palette and the browser's Back and Forward get the leave dialog; reload and close get the
 * browser's own prompt. The registration ends when the page unmounts, so a page that stays
 * mounted keeps its guard.
 */
export function useLeaveGuard(dirty: boolean): void {
  const { registerUnsaved } = useAppShell();
  const id = useId();
  useEffect(() => {
    registerUnsaved(id, dirty);
    return () => registerUnsaved(id, false);
  }, [id, dirty, registerUnsaved]);
}

// The leave dialog's target when the browser's Back or Forward was held.
const HISTORY_STEP = "\u0000history";

// Same page, same query (in any order), trailing slash or not.
function sameAddress(a: URL, b: Location | URL): boolean {
  const trim = (path: string) => path.replace(/\/+$/, "") || "/";
  const query = (search: string) => {
    const params = new URLSearchParams(search);
    params.sort();
    return params.toString();
  };
  return trim(a.pathname) === trim(b.pathname) && query(a.search) === query(b.search);
}

// True when a router address (no deployment prefix) is the page already shown.
function isCurrentAddress(href: string): boolean {
  return sameAddress(new URL(`${BASE_PATH}${href}`, window.location.origin), window.location);
}

// An in-app address from a link, without the deployment prefix (the router adds it back).
function inAppHref(anchor: HTMLAnchorElement): string | null {
  // A page that asks in its own words marks its links data-own-leave-guard.
  if ((anchor.target && anchor.target !== "_self") || anchor.hasAttribute("download") || anchor.hasAttribute("data-own-leave-guard")) return null;
  const url = new URL(anchor.href, window.location.href);
  if (url.origin !== window.location.origin) return null;
  if (sameAddress(url, window.location)) return null;
  let path = url.pathname;
  if (BASE_PATH) {
    // Outside this app (the account site, downloads): the browser leaves and asks with beforeunload.
    if (path !== BASE_PATH && !path.startsWith(`${BASE_PATH}/`)) return null;
    path = path.slice(BASE_PATH.length) || "/";
  }
  return `${path}${url.search}${url.hash}`;
}

const THREADS_EVERY_MS = 15_000;
const ATTENTION_EVERY_MS = 60_000;

// The app frame for the pages outside the chat (design: Main.html): the same sidebar, loaded here,
// and the page in the content column. Mount it inside AuthGate; the chat page keeps its own frame.
export function AppShell({ children }: { children: ReactNode }) {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { session } = useSession();
  const isAdmin = session === null || session.scopes.includes("admin");
  // Creating and changing agents needs the "agents" permission and a session that may manage (a
  // paired chat-only device has neither, even with no permission list).
  const mayManageAgents = isAdmin || (session !== null && session.scopes.includes("manage") && can(session.permissions, "agents"));
  const sidebarInline = useMediaQuery(SIDEBAR_INLINE);

  const [agents, setAgents] = useState<Agent[] | null>(null);
  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [team, setTeam] = useState<TeamState | null>(null);
  const [teamStatus, setTeamStatus] = useState<"loading" | "ready" | "failed">("loading");
  // One GET /team at a time: a refresh asked for while one is in flight runs when it ends, so a
  // slow answer is never cancelled by the next poll.
  const teamInFlight = useRef(false);
  const teamAgain = useRef(false);
  const [computers, setComputers] = useState<Map<number, string> | null>(null);
  const [attention, setAttention] = useState<NeedsYouRow[] | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [agentTick, setAgentTick] = useState(0);
  const [threadTick, setThreadTick] = useState(0);
  const [teamTick, setTeamTick] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  // The drawer belongs to the address it was opened on, so moving to another page closes it.
  const [drawerAt, setDrawerAt] = useState<string | null>(null);
  const [teamOpen, setTeamOpen] = useState(false);
  const [deleting, setDeleting] = useState<Agent | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [unsavedIds, setUnsavedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [leaveTo, setLeaveTo] = useState<string | null>(null);
  const unsaved = unsavedIds.size > 0;
  const registerUnsaved = useCallback((id: string, dirty: boolean) => {
    setUnsavedIds((current) => {
      if (current.has(id) === dirty) return current;
      const next = new Set(current);
      if (dirty) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);
  // Set once the person confirmed leaving, so the guards let the navigation through; cleared when
  // the address changes (a page that stays mounted guards again).
  const leaving = useRef(false);
  // Every way out of the page that the shell controls goes through here. The page already shown
  // is not a way out: its drafts stay, and so does its guard.
  const go = useCallback((href: string) => {
    if (isCurrentAddress(href)) return;
    if (unsaved && !leaving.current) setLeaveTo(href);
    else router.push(href);
  }, [unsaved, router]);

  // Unsaved work: the browser asks on reload or close, and a click on any in-app link (the
  // sidebar's included) is held for the leave dialog. Capture phase, so it runs before the link.
  useEffect(() => {
    if (!unsaved) return;
    const warn = (event: BeforeUnloadEvent) => {
      if (leaving.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    const hold = (event: MouseEvent) => {
      if (leaving.current || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      const href = anchor ? inAppHref(anchor) : null;
      if (!href) return;
      event.preventDefault();
      event.stopPropagation();
      setLeaveTo(href);
    };
    // Back and Forward: a copy of this entry sits on top of the history, so the browser's step
    // lands on the same page. Put the copy back and ask; confirming takes the step for real.
    if (!(window.history.state as { leaveGuard?: boolean } | null)?.leaveGuard) {
      window.history.pushState({ leaveGuard: true }, "", window.location.href);
    }
    const step = () => {
      if (leaving.current) return;
      window.history.pushState({ leaveGuard: true }, "", window.location.href);
      setLeaveTo(HISTORY_STEP);
    };
    window.addEventListener("beforeunload", warn);
    window.addEventListener("popstate", step);
    document.addEventListener("click", hold, true);
    return () => {
      window.removeEventListener("beforeunload", warn);
      window.removeEventListener("popstate", step);
      document.removeEventListener("click", hold, true);
    };
  }, [unsaved]);

  const refreshAgents = useCallback(() => setAgentTick((n) => n + 1), []);
  const refreshThreads = useCallback(() => setThreadTick((n) => n + 1), []);
  const refreshTeam = useCallback(() => setTeamTick((n) => n + 1), []);

  const location = `${pathname}?${params.toString()}`;
  useEffect(() => {
    leaving.current = false;
  }, [location]);
  const drawerOpen = drawerAt === location;
  const setDrawerOpen = (open: boolean) => setDrawerAt(open ? location : null);

  // Agents' pictures are an admin-only read: a member's page never asks for them.
  useEffect(() => {
    setPicturesEnabled(isAdmin);
  }, [isAdmin]);

  useEffect(() => {
    let alive = true;
    api.listAgents(true)
      .then((list) => { if (alive) { prunePictures(list.map((agent) => ({ id: agent.id, created_at: agent.created_at }))); setAgents(list); setLoadError(null); } })
      .catch((err: unknown) => {
        if (!alive) return;
        // 404: a backend without agents. Anything else is said, never shown as an empty list.
        if (err instanceof ApiError && err.status === 404) setAgents([]);
        else setLoadError(err instanceof Error ? err.message : t("shell.loadFailed"));
      });
    return () => { alive = false; };
  }, [agentTick, t]);

  useEffect(() => {
    let alive = true;
    const read = () => {
      if (document.hidden) return;
      api.listThreads(showArchived).then((list) => { if (alive) setThreads(list); }).catch(() => {});
    };
    read();
    const timer = window.setInterval(read, THREADS_EVERY_MS);
    return () => { alive = false; window.clearInterval(timer); };
  }, [showArchived, threadTick]);

  useEffect(() => {
    const load = () => {
      if (teamInFlight.current) {
        teamAgain.current = true;
        return;
      }
      teamInFlight.current = true;
      collaboration.team()
        .then((value) => { setTeam(value); setTeamStatus("ready"); })
        .catch(() => { setTeam(null); setTeamStatus("failed"); })
        .finally(() => {
          teamInFlight.current = false;
          if (teamAgain.current) {
            teamAgain.current = false;
            load();
          }
        });
    };
    load();
  }, [teamTick, agentTick]);

  // The needs-you rows (pages read them through the shell; the waiting counts fall back on them
  // while the Today brief cannot be read) and the computer badges: owner and admin only, like their
  // endpoints.
  useEffect(() => {
    if (!isAdmin) return;
    let alive = true;
    // Not while the tab is hidden; once it shows again, read at once.
    const read = () => {
      if (document.hidden) return;
      api.peekNeedsYou().then((card) => { if (alive) setAttention(card.items); }).catch(() => { if (alive) setAttention(null); });
      api.listComputers()
        .then((list) => { if (alive) setComputers(new Map(list.map((computer) => [computer.agent_id, computer.state]))); })
        .catch(() => { if (alive) setComputers(null); });
    };
    read();
    const timer = window.setInterval(read, ATTENTION_EVERY_MS);
    document.addEventListener("visibilitychange", read);
    return () => { alive = false; window.clearInterval(timer); document.removeEventListener("visibilitychange", read); };
  }, [isAdmin, agentTick]);

  const manage = async (run: () => Promise<unknown>) => {
    setActionError(null);
    try {
      await run();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t("shell.actionFailed"));
    } finally {
      refreshThreads();
    }
  };

  const onNewChat = useCallback((agentId?: number) => go(agentId ? `/chat/?agent=${agentId}` : "/chat/"), [go]);
  // The sidebar marks the page on screen: every page in its navigation sits in this shell.
  const currentPage = currentShellPage(pathname);
  // A page an agent made is marked too (its sidebar key is page:<id>, lib/ui-config.ts).
  const customPage = pathname?.startsWith("/custom") ? params.get("id") : null;
  // The phone bar's "N waiting" pill (design: MobileToday.html, on Today too) opens Today, owner
  // and admin only. It counts what Today lists under "Waiting for you" from the reads the sidebar's
  // band and the command palette share (components/shell/useWaiting.ts), so all of them and
  // Today's own badge say one number.
  const pillShown = isAdmin && !sidebarInline;
  const pillCount = useWaiting(pillShown, attention).items?.length ?? 0;
  // The team panel is offered from the footer menu and the command palette once the team is known.
  useTeamPanelHost(agents !== null && team !== null, () => setTeamOpen(true));
  const selectedAgentId = pathname?.startsWith("/agents/edit") ? parseAgentId(params.get("id")) : null;
  const leadAgentId = team?.team?.lead_agent_id ?? null;

  const renderSidebar = (rail: boolean, sheet = false) => (
    <Sidebar
      agents={agents}
      threads={threads}
      selectedThreadId={null}
      selectedAgentId={selectedAgentId}
      live={{ threadId: null, agentId: null, working: false, waiting: false }}
      showArchived={showArchived}
      onToggleArchived={() => setShowArchived((on) => !on)}
      actions={{
        onRename: (id, title) => void manage(() => api.updateThread(id, { title })),
        onArchive: (id, archived) => void manage(() => api.updateThread(id, { archived })),
        onDelete: (id) => void manage(() => api.deleteThread(id)),
      }}
      error={actionError}
      onNewChat={onNewChat}
      agentsHref={agents !== null ? AGENTS_HREF : undefined}
      current={customPage ? `page:${customPage}` : currentPage}
      navigate={go}
      team={team}
      onNewAgent={agents !== null && mayManageAgents ? () => go(newAgentHref()) : undefined}
      onEditAgent={isAdmin ? (agent) => go(editAgentHref(agent.id)) : undefined}
      onDeleteAgent={agents !== null && isAdmin ? (agent) => setDeleting(agent) : undefined}
      leadAgentId={leadAgentId}
      onChangeLead={isAdmin ? async (agent, remove) => {
        await manage(async () => { setTeam(await (remove ? collaboration.clearLead(agent.id) : collaboration.lead(agent.id))); });
        refreshAgents();
      } : undefined}
      onOpenWorkflows={isAdmin && agents !== null ? () => go("/chat/?view=workflows") : undefined}
      admin={isAdmin}
      onNavigate={() => setDrawerOpen(false)}
      workspaces={<WorkspaceSwitcher onNavigate={() => setDrawerOpen(false)} />}
      attention={attention}
      computers={computers}
      rail={rail}
      sheet={sheet}
    />
  );

  const value: AppShellData = {
    agents, threads, team, teamStatus, openTeam: () => setTeamOpen(true), computers, attention, refreshAgents, refreshThreads, refreshTeam, isAdmin, mayManageAgents, loadError, registerUnsaved,
  };

  return (
    <ShellContext.Provider value={value}>
      <div className="relative flex h-dvh overflow-clip">
        <CommandPalette agents={agents} threads={threads} attention={attention} onNewChat={onNewChat} navigate={go} />
        {sidebarInline ? (
          <SidebarFrame>{(rail) => renderSidebar(rail)}</SidebarFrame>
        ) : (
          <MobileMenu open={drawerOpen} onOpenChange={setDrawerOpen} label={t("sidebarMenu.menu")}>{renderSidebar(false, true)}</MobileMenu>
        )}
        {/* The column itself is clear: the phone bar sits on the canvas and its wash, as the sidebar
            does; the page below it is on the surface (<main>), and so is the offline banner. */}
        <div className="flex min-w-0 flex-1 flex-col">
          {!sidebarInline && (
            // The phone bar (design: MobileToday.html): 56 px under the safe area, 16 px left, 8 px right.
            // glass-canvas: a little translucent over the canvas wash; nothing scrolls under it, so no blur.
            <div className="flex h-[calc(3.5rem+env(safe-area-inset-top))] shrink-0 items-center justify-between border-b border-line glass-canvas pl-4 pr-2 pt-[env(safe-area-inset-top)]">
              <Wordmark className="text-[18px]" />
              <div className="flex items-center gap-1">
                {pillCount > 0 && (
                  <Link
                    href={TODAY_HREF}
                    title={t("sidebar.waitingLabel", { n: pillCount })}
                    className="inline-flex h-touch items-center rounded-field px-1"
                  >
                    <span className="inline-flex h-7 items-center rounded-full bg-warning-bg px-2.5 text-[12px] font-semibold text-warning-on">
                      {t("today.waiting.count", { count: pillCount })}
                    </span>
                  </Link>
                )}
                {/* The palette (recent chats, agents, pages) opens here; the menu holds the conversation search.
                    The bar is the phone's only, so its buttons are the phone's 44 px, in ink (MobileToday.html). */}
                <IconButton label={t("search.placeholder")} onClick={openCommandPalette} className="size-11 text-ink">
                  <Search size={20} strokeWidth={1.7} />
                </IconButton>
                <IconButton label={t("sidebarMenu.openMenu")} aria-haspopup="dialog" onClick={() => setDrawerOpen(true)} className="size-11 text-ink">
                  <MenuGlyph size={20} />
                </IconButton>
              </div>
            </div>
          )}
          {/* Offline: on the page colour, as part of the page under it, never on a canvas strip that
              cuts the banner's corners against the page. Hidden while online. */}
          <div className="shrink-0 bg-surface px-4 pt-3 empty:hidden"><OfflineBanner /></div>
          <main id="content" className="min-h-0 flex-1 overflow-y-auto bg-surface">{children}</main>
        </div>
      </div>
      {teamOpen && agents !== null && <TeamPanel agents={agents} onClose={() => setTeamOpen(false)} onChanged={() => { refreshAgents(); refreshTeam(); }} />}
      <ConfirmDialog
        open={leaveTo !== null}
        onOpenChange={(open) => { if (!open) setLeaveTo(null); }}
        title={t("shell.leaveTitle")}
        description={t("shell.leaveBody")}
        confirmLabel={t("shell.leaveConfirm")}
        cancelLabel={t("shell.stay")}
        danger
        onConfirm={() => {
          const href = leaveTo;
          setLeaveTo(null);
          if (!href) return;
          // The registrations stay: the pages that unmount end theirs, and one that stays keeps it.
          leaving.current = true;
          if (href === HISTORY_STEP) window.history.go(-2);
          else router.push(href);
        }}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => { if (!open) setDeleting(null); }}
        title={deleting ? t("shell.deleteAgentTitle", { name: deleting.name }) : ""}
        description={t("shell.deleteAgentBody")}
        confirmLabel={t("shell.deleteAgentConfirm")}
        cancelLabel={t("common.cancel")}
        danger
        loading={deleteBusy}
        onConfirm={async () => {
          if (!deleting) return;
          setDeleteBusy(true);
          try {
            await api.deleteAgent(deleting.id);
            forgetAgentPicture(deleting.id);
            await removeAgentFromClients(deleting.id);
            if (selectedAgentId === deleting.id) router.push(AGENTS_HREF);
            setDeleting(null);
            refreshAgents();
            refreshThreads();
          } catch (err) {
            setActionError(err instanceof Error ? err.message : t("shell.actionFailed"));
            setDeleting(null);
          } finally {
            setDeleteBusy(false);
          }
        }}
      />
    </ShellContext.Provider>
  );
}
