"use client";

import { Menu as MenuIcon } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, ApiError, type Agent, type Thread } from "@/lib/api";
import { AGENTS_HREF, editAgentHref, newAgentHref, parseAgentId } from "@/lib/agent-pages";
import { can } from "@/lib/permissions";
import { collaboration, type TeamState } from "@/lib/collaboration";
import type { NeedsYouRow } from "@/lib/needs-you";
import { ROLE_LABELS } from "@/lib/people";
import { SIDEBAR_INLINE, useMediaQuery } from "@/lib/use-media-query";
import { useT } from "@/lib/use-i18n";
import { useSession } from "@/components/AuthGate";
import { RoomList } from "@/components/chat/RoomList";
import { TeamPanel } from "@/components/chat/TeamPanel";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Drawer } from "@/components/ui/Drawer";
import { IconButton } from "@/components/ui/IconButton";
import { Wordmark } from "@/components/ui/Wordmark";
import { CommandPalette } from "./CommandPalette";
import { Sidebar } from "./Sidebar";
import { SidebarFrame } from "./SidebarFrame";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";

// What the pages inside the shell can read and refresh. They share the sidebar's lists, so a create,
// rename or delete on a page shows in the sidebar at once.
export type AppShellData = {
  agents: Agent[] | null;
  threads: Thread[] | null;
  team: TeamState | null;
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
};

const ShellContext = createContext<AppShellData | null>(null);

export function useAppShell(): AppShellData {
  const value = useContext(ShellContext);
  if (!value) throw new Error("useAppShell is used outside AppShell");
  return value;
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
  const mayManageAgents = can(session?.permissions, "agents");
  const sidebarInline = useMediaQuery(SIDEBAR_INLINE);

  const [agents, setAgents] = useState<Agent[] | null>(null);
  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [team, setTeam] = useState<TeamState | null>(null);
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

  const refreshAgents = useCallback(() => setAgentTick((n) => n + 1), []);
  const refreshThreads = useCallback(() => setThreadTick((n) => n + 1), []);
  const refreshTeam = useCallback(() => setTeamTick((n) => n + 1), []);

  const location = `${pathname}?${params.toString()}`;
  const drawerOpen = drawerAt === location;
  const setDrawerOpen = (open: boolean) => setDrawerAt(open ? location : null);

  useEffect(() => {
    let alive = true;
    api.listAgents(true)
      .then((list) => { if (alive) { setAgents(list); setLoadError(null); } })
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
    let alive = true;
    collaboration.team().then((value) => { if (alive) setTeam(value); }).catch(() => { if (alive) setTeam(null); });
    return () => { alive = false; };
  }, [teamTick, agentTick]);

  // The waiting row and the computer badges: owner and admin only, like their endpoints.
  useEffect(() => {
    if (!isAdmin) return;
    let alive = true;
    const read = () => {
      api.peekNeedsYou().then((card) => { if (alive) setAttention(card.items); }).catch(() => { if (alive) setAttention(null); });
      api.listComputers()
        .then((list) => { if (alive) setComputers(new Map(list.map((computer) => [computer.agent_id, computer.state]))); })
        .catch(() => { if (alive) setComputers(null); });
    };
    read();
    const timer = window.setInterval(read, ATTENTION_EVERY_MS);
    return () => { alive = false; window.clearInterval(timer); };
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

  const onAgentsPage = pathname?.startsWith("/agents") ?? false;
  const selectedAgentId = pathname?.startsWith("/agents/edit") ? parseAgentId(params.get("id")) : null;
  const leadAgentId = team?.team?.lead_agent_id ?? null;

  const renderSidebar = (rail: boolean) => (
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
      onNewChat={(agentId) => router.push(agentId ? `/chat/?agent=${agentId}` : "/chat/")}
      agentsHref={agents !== null ? AGENTS_HREF : undefined}
      current={onAgentsPage ? "agents" : null}
      onNewAgent={agents !== null && mayManageAgents ? () => router.push(newAgentHref()) : undefined}
      onEditAgent={isAdmin ? (agent) => router.push(editAgentHref(agent.id)) : undefined}
      onDeleteAgent={agents !== null && isAdmin ? (agent) => setDeleting(agent) : undefined}
      leadAgentId={leadAgentId}
      onChangeLead={isAdmin ? async (agent, remove) => {
        await manage(async () => { setTeam(await (remove ? collaboration.clearLead(agent.id) : collaboration.lead(agent.id))); });
        refreshAgents();
      } : undefined}
      onOpenToday={isAdmin ? () => router.push("/chat/?view=today") : undefined}
      onOpenRoutines={isAdmin && agents !== null ? () => router.push("/chat/?view=routines") : undefined}
      onOpenPlanner={isAdmin && agents !== null ? () => router.push("/chat/?view=planner") : undefined}
      onOpenWorkflows={isAdmin && agents !== null ? () => router.push("/chat/?view=workflows") : undefined}
      showApps={isAdmin}
      onNavigate={() => setDrawerOpen(false)}
      workspaces={<WorkspaceSwitcher onNavigate={() => setDrawerOpen(false)} />}
      collaboration={<RoomList selected={null} onTeam={() => setTeamOpen(true)} onNavigate={() => setDrawerOpen(false)} />}
      attention={attention}
      computers={computers}
      person={session ? { name: session.display_name || session.label || t("sidebar.you"), detail: session.role ? ROLE_LABELS[session.role] : null } : null}
      rail={rail}
    />
  );

  const value: AppShellData = {
    agents, threads, team, computers, attention, refreshAgents, refreshThreads, refreshTeam, isAdmin, mayManageAgents, loadError,
  };

  return (
    <ShellContext.Provider value={value}>
      <div className="relative flex h-dvh">
        <CommandPalette agents={agents} threads={threads} onNewChat={(agentId) => router.push(agentId ? `/chat/?agent=${agentId}` : "/chat/")} />
        {sidebarInline ? (
          <SidebarFrame>{(rail) => renderSidebar(rail)}</SidebarFrame>
        ) : (
          <Drawer open={drawerOpen} onOpenChange={setDrawerOpen} label={t("shell.conversations")}>{renderSidebar(false)}</Drawer>
        )}
        <div className="flex min-w-0 flex-1 flex-col bg-surface">
          {!sidebarInline && (
            <div className="flex h-[52px] shrink-0 items-center justify-between border-b border-line bg-app pl-4 pr-3 pt-[env(safe-area-inset-top)]">
              <Wordmark className="text-[18px]" />
              <IconButton label={t("shell.openSidebar")} onClick={() => setDrawerOpen(true)}>
                <MenuIcon size={20} />
              </IconButton>
            </div>
          )}
          <main id="content" className="min-h-0 flex-1 overflow-y-auto">{children}</main>
        </div>
      </div>
      {teamOpen && agents !== null && <TeamPanel agents={agents} onClose={() => setTeamOpen(false)} onChanged={() => { refreshAgents(); refreshTeam(); }} />}
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
