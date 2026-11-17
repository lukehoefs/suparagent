"use client";

// Agent settings (design: AgentSettings.html) at /agents/edit/?id=<id>&tab=<tab>: the header with
// Open chat and the More menu, then the Profile, Soul, Skills, Tools, Memory and Computer tabs.
// Tabs that hold drafts stay mounted once opened (hidden when inactive), so switching tabs never
// loses typing; leaving the page with unsaved work asks first.
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Ellipsis, MessageSquare } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type MouseEvent } from "react";
import { api, ApiError, type Agent, type Engine } from "@/lib/api";
import { AGENT_TABS, AGENTS_HREF, agentChatHref, editAgentHref, parseAgentId, parseAgentTab, type AgentTab } from "@/lib/agent-pages";
import { anyDirty, openTab, visibleTabs } from "@/lib/agent-settings";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/use-i18n";
import { useAppShell, useLeaveGuard } from "@/components/shell/AppShell";
import { Avatar } from "@/components/ui/Avatar";
import { forgetAgentPicture } from "@/components/ui/AvatarPictures";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { IconButton } from "@/components/ui/IconButton";
import { Menu, MenuItem, MenuSeparator } from "@/components/ui/Menu";
import { Skeleton, SkeletonList } from "@/components/ui/Skeleton";
import { Tab, TabList, TabPanel, Tabs } from "@/components/ui/Tabs";
import { SkillsPanel } from "@/components/chat/SkillsPanel";
import { SoulPanel } from "@/components/chat/SoulPanel";
import { ComputerTab } from "./settings/ComputerTab";
import { DuplicateDialog } from "./settings/DuplicateDialog";
import { ExportDialog } from "./settings/ExportDialog";
import { HistoryDialog } from "./settings/HistoryDialog";
import { MemoryTab } from "./settings/MemoryTab";
import { ProfileForm } from "./settings/ProfileForm";
import { RoutinesTab } from "./settings/RoutinesTab";
import { ToolsTab } from "./settings/ToolsTab";
import { removeAgentFromClients } from "./agent-clients";

const PAGE = "flex flex-col gap-6 px-4 pb-10 pt-5 md:px-8 md:pt-7";
const LINK_BUTTON =
  "inline-flex h-control shrink-0 items-center justify-center gap-2 rounded-field border border-line bg-raised px-3 text-label font-medium text-ink transition-colors duration-(--dur-fast) hover:bg-hover touch:h-touch";
const CLEAN: Record<AgentTab, boolean> = { profile: false, soul: false, skills: false, tools: false, memory: false, routines: false, computer: false };
// Panels stay mounted once opened and are hidden while another tab is active.
const PANEL = "max-w-[820px] focus-visible:outline-none data-[state=inactive]:hidden";

export function AgentSettingsPage() {
  const params = useSearchParams();
  const id = parseAgentId(params.get("id"));
  const tab = parseAgentTab(params.get("tab"));
  if (id === null) return <Missing />;
  return <AgentSettings key={id} agentId={id} tab={tab} />;
}

function Missing() {
  const t = useT();
  return (
    <div className={PAGE}>
      <EmptyState
        title={t("agentSettings.missing.title")}
        description={t("agentSettings.missing.body")}
        action={<Link href={AGENTS_HREF} className={LINK_BUTTON}>{t("sidebar.allAgents")}</Link>}
      />
    </div>
  );
}

function AgentSettings({ agentId, tab: asked }: { agentId: number; tab: AgentTab }) {
  const t = useT();
  const router = useRouter();
  const { agents, threads, refreshAgents, refreshThreads, refreshTeam, isAdmin, mayManageAgents } = useAppShell();
  // Admins manage every part of an agent; anyone else who may manage agents can only change the
  // agent's own fields (Profile and the memory switches): the other tabs' routes are admin-only.
  const canManage = mayManageAgents || isAdmin;
  const tabs = visibleTabs(AGENT_TABS, isAdmin);
  const tab = openTab(asked, tabs);
  const [agent, setAgent] = useState<Agent | null>(null);
  const [missing, setMissing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadTick, setLoadTick] = useState(0);
  const [engines, setEngines] = useState<Engine[] | null>(null);
  const [enginesFailed, setEnginesFailed] = useState(false);
  const [enginesTick, setEnginesTick] = useState(0);
  const [dirty, setDirty] = useState<Record<AgentTab, boolean>>(CLEAN);
  // Tabs opened so far: they stay mounted, so their drafts survive a switch.
  const [visited, setVisited] = useState<AgentTab[]>([tab]);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<"archive" | "delete" | null>(null);
  const [leaveTo, setLeaveTo] = useState<string | null>(null);
  // The More menu's Duplicate, Export and History dialogs.
  const [extra, setExtra] = useState<"duplicate" | "export" | "history" | null>(null);
  // Bumped by a restore from History: the tabs mount again from the restored agent (nothing in them
  // is unsaved then, since a restore waits for that).
  const [restored, setRestored] = useState(0);

  useEffect(() => {
    let live = true;
    api.getAgent(agentId)
      .then((value) => { if (live) { setAgent(value); setLoadError(null); } })
      .catch((err: unknown) => {
        if (!live) return;
        if (err instanceof ApiError && err.status === 404) setMissing(true);
        else setLoadError(err instanceof Error ? err.message : t("agentSettings.loadFailed"));
      });
    return () => { live = false; };
  }, [agentId, loadTick, t]);

  useEffect(() => {
    let live = true;
    api.getEngines()
      .then((value) => { if (live) { setEngines(value); setEnginesFailed(false); } })
      .catch(() => { if (live) { setEngines([]); setEnginesFailed(true); } });
    return () => { live = false; };
  }, [enginesTick]);

  const unsaved = anyDirty(dirty);
  // The shell asks before the browser or any other link (the sidebar too) leaves unsaved work.
  useLeaveGuard(unsaved);

  // One stable callback per tab, so a panel reporting its dirty state does not loop.
  const reportDirty = useMemo(
    () => Object.fromEntries(AGENT_TABS.map((key) => [
      key,
      (value: boolean) => setDirty((current) => (current[key] === value ? current : { ...current, [key]: value })),
    ])) as Record<AgentTab, (value: boolean) => void>,
    [],
  );

  const mergeAgent = useCallback((patch: Partial<Agent>) => setAgent((current) => (current ? { ...current, ...patch } : current)), []);
  const agentSaved = useCallback((next: Agent) => {
    setAgent(next);
    refreshAgents();
  }, [refreshAgents]);
  const computerChanged = useCallback(() => {
    setLoadTick((n) => n + 1);
    refreshAgents();
  }, [refreshAgents]);

  const changeTab = (value: string) => {
    const next = openTab(parseAgentTab(value), tabs);
    setVisited((current) => [...new Set([...current, tab, next])]);
    router.replace(editAgentHref(agentId, next), { scroll: false });
  };
  const shown = visited.includes(tab) ? visited : [...visited, tab];

  // In-page links ask before leaving unsaved work; the browser's own navigation uses beforeunload.
  const guard = (href: string) => (event: MouseEvent<HTMLAnchorElement>) => {
    if (!unsaved || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    setLeaveTo(href);
  };

  const act = async (work: () => Promise<void>) => {
    setBusy(true);
    setActionError(null);
    try {
      await work();
    } catch (err) {
      // Restoring fails when another agent took this name while it was archived.
      if (err instanceof ApiError && err.code === "agent_name_taken" && agent?.archived_at) {
        setActionError(t("agentSettings.archived.nameTaken", { name: agent.name }));
      } else {
        setActionError(err instanceof Error ? err.message : t("agentSettings.actionFailed"));
      }
      // Close a confirm dialog so the error banner is visible.
      setConfirming(null);
    } finally {
      setBusy(false);
    }
  };

  const setArchived = (archived: boolean) => act(async () => {
    if (!agent) return;
    agentSaved(await api.updateAgent(agent.id, { archived }));
    // Archiving also takes the agent off the team.
    refreshTeam();
    setConfirming(null);
  });

  const togglePin = () => act(async () => {
    if (!agent) return;
    agentSaved(await api.updateAgent(agent.id, { pinned: !agent.pinned }));
  });

  const remove = () => act(async () => {
    if (!agent) return;
    await api.deleteAgent(agent.id);
    forgetAgentPicture(agent.id);
    // Best effort: clients.json is a separate list, so drop the deleted agent from its clients too.
    await removeAgentFromClients(agent.id);
    setDirty(CLEAN);
    setConfirming(null);
    refreshAgents();
    refreshThreads();
    router.push(AGENTS_HREF);
  });

  if (missing) return <Missing />;

  if (agent === null) {
    return (
      <div className={PAGE}>
        {loadError ? (
          <Banner tone="danger" action={<Button size="sm" onClick={() => { setLoadError(null); setLoadTick((n) => n + 1); }}>{t("agentSettings.retry")}</Button>}>
            {loadError}
          </Banner>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <Skeleton className="size-10 rounded-full" />
              <div className="flex flex-col gap-1.5">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-3.5 w-28" />
              </div>
            </div>
            <SkeletonList rows={5} />
          </>
        )}
      </div>
    );
  }

  const archived = agent.archived_at !== null;
  const chatHref = agentChatHref(threads, agent.id);
  const canPin = canManage && !archived;

  return (
    <div className={PAGE}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar agentId={agent.id} name={agent.name} size="lg" className="size-10 text-[15px]" />
          <div className="min-w-0">
            <h1 className="truncate text-h2 font-semibold tracking-[-0.01em] text-ink">{agent.name}</h1>
            <p className="truncate text-small text-muted">
              {agent.title?.trim() && <>{agent.title} · </>}
              <Link href={AGENTS_HREF} onClick={guard(AGENTS_HREF)} data-own-leave-guard="" className="text-accent-text underline-offset-2 hover:underline">
                {t("sidebar.allAgents")}
              </Link>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!archived && (
            <Link href={chatHref} onClick={guard(chatHref)} data-own-leave-guard="" className={LINK_BUTTON}>
              <MessageSquare size={15} aria-hidden="true" />
              {t("agentSettings.openChat")}
            </Link>
          )}
          {canManage && (
            <Menu trigger={<IconButton label={t("agentSettings.more", { name: agent.name })} disabled={busy}><Ellipsis size={18} aria-hidden="true" /></IconButton>}>
              {canPin && (
                <MenuItem onSelect={() => void togglePin()}>{agent.pinned ? t("agentSettings.menu.unpin") : t("agentSettings.menu.pin")}</MenuItem>
              )}
              {!archived && <MenuItem onSelect={() => setExtra("duplicate")}>{t("agentProfile.menu.duplicate")}</MenuItem>}
              {isAdmin && <MenuItem onSelect={() => setExtra("export")}>{t("agentProfile.menu.export")}</MenuItem>}
              {isAdmin && <MenuItem onSelect={() => setExtra("history")}>{t("agentProfile.menu.history")}</MenuItem>}
              {(canPin || !archived || isAdmin) && <MenuSeparator />}
              {archived
                ? <MenuItem onSelect={() => void setArchived(false)}>{t("agentSettings.archived.restore")}</MenuItem>
                : <MenuItem onSelect={() => setConfirming("archive")}>{t("agentSettings.menu.archive")}</MenuItem>}
              {isAdmin && (
                <>
                  <MenuSeparator />
                  <MenuItem danger onSelect={() => setConfirming("delete")}>{t("common.delete")}</MenuItem>
                </>
              )}
            </Menu>
          )}
        </div>
      </div>

      {actionError && <Banner tone="danger" onDismiss={() => setActionError(null)}>{actionError}</Banner>}

      {archived && (
        <Banner
          tone="info"
          title={t("agentSettings.archived.title", { name: agent.name })}
          action={canManage ? <Button size="sm" onClick={() => void setArchived(false)} loading={busy}>{t("agentSettings.archived.restore")}</Button> : undefined}
        >
          {t("agentSettings.archived.body")}
        </Banner>
      )}

      {!canManage ? (
        <EmptyState title={t("agentSettings.noAccess.title")} description={t("agentSettings.noAccess.body")} />
      ) : (
        <Tabs key={restored} value={tab} onValueChange={changeTab} className="flex min-w-0 flex-col gap-6">
          <div className="flex min-w-0 flex-col gap-2">
            <TabList label={t("sidebar.agentSettings")}>
              {tabs.map((value) => (
                <Tab key={value} value={value}>
                  <span className="inline-flex items-center gap-1.5">
                    {t(`agentSettings.tab.${value}`)}
                    {dirty[value] && (
                      <>
                        <span aria-hidden="true" className="size-1.5 rounded-full bg-accent" />
                        <span className="sr-only">{t("agentSettings.unsaved")}</span>
                      </>
                    )}
                  </span>
                </Tab>
              ))}
            </TabList>
            {/* The other tabs' routes are admin-only; say so rather than leave the reader guessing. */}
            {!isAdmin && <p className="text-small text-muted">{t("agentSettings.ownerOnlyTabs")}</p>}
          </div>

          <TabPanel forceMount value="profile" className={PANEL}>
            {shown.includes("profile") && (
              <ProfileForm
                agent={agent}
                agents={agents}
                engines={engines}
                enginesFailed={enginesFailed}
                onRetryEngines={() => setEnginesTick((n) => n + 1)}
                isAdmin={isAdmin}
                onSaved={agentSaved}
                onTeamChanged={() => { refreshTeam(); refreshAgents(); }}
                onDirtyChange={reportDirty.profile}
              />
            )}
          </TabPanel>
          {tabs.includes("soul") && (
            <TabPanel forceMount value="soul" className={PANEL}>
              {shown.includes("soul") && <SoulPanel agent={agent} onDirtyChange={reportDirty.soul} active={tab === "soul"} />}
            </TabPanel>
          )}
          {tabs.includes("skills") && (
            <TabPanel forceMount value="skills" className={cn(PANEL, "max-w-[1100px]")}>
              {shown.includes("skills") && <SkillsPanel agent={agent} layout="page" onDirtyChange={reportDirty.skills} />}
            </TabPanel>
          )}
          {tabs.includes("tools") && (
            <TabPanel forceMount value="tools" className={PANEL}>
              {shown.includes("tools") && <ToolsTab agent={agent} isAdmin={isAdmin} onAgentSaved={agentSaved} onDirtyChange={reportDirty.tools} />}
            </TabPanel>
          )}
          <TabPanel forceMount value="memory" className={PANEL}>
            {shown.includes("memory") && (
              <MemoryTab agent={agent} isAdmin={isAdmin} onAgentChange={mergeAgent} onDirtyChange={reportDirty.memory} />
            )}
          </TabPanel>
          {tabs.includes("routines") && (
            <TabPanel forceMount value="routines" className={PANEL}>
              {/* Only while open: it holds no drafts, and its lists re-read while a run is going. */}
              {tab === "routines" && <RoutinesTab agent={agent} />}
            </TabPanel>
          )}
          {tabs.includes("computer") && (
            <TabPanel forceMount value="computer" className={PANEL}>
              {/* Only while open: the live view holds a connection and a control lease. */}
              {tab === "computer" && <ComputerTab agent={agent} engines={engines} onChanged={computerChanged} />}
            </TabPanel>
          )}
        </Tabs>
      )}

      {extra === "duplicate" && (
        <DuplicateDialog
          agent={agent}
          isAdmin={isAdmin}
          blocked={unsaved}
          onClose={() => setExtra(null)}
          onDuplicated={(copy) => {
            setExtra(null);
            refreshAgents();
            router.push(editAgentHref(copy.id));
          }}
        />
      )}
      {extra === "export" && isAdmin && <ExportDialog agent={agent} onClose={() => setExtra(null)} />}
      {extra === "history" && isAdmin && (
        <HistoryDialog
          agent={agent}
          engines={engines}
          blocked={unsaved}
          onClose={() => setExtra(null)}
          onRestored={(next) => {
            agentSaved(next);
            setRestored((n) => n + 1);
          }}
        />
      )}
      <ConfirmDialog
        open={confirming === "archive"}
        onOpenChange={(open) => { if (!open) setConfirming(null); }}
        title={t("agentSettings.archive.title", { name: agent.name })}
        description={t("agentSettings.archive.body")}
        confirmLabel={t("agentSettings.menu.archive")}
        cancelLabel={t("common.cancel")}
        loading={busy}
        onConfirm={() => void setArchived(true)}
      />
      <ConfirmDialog
        open={confirming === "delete"}
        onOpenChange={(open) => { if (!open) setConfirming(null); }}
        title={t("shell.deleteAgentTitle", { name: agent.name })}
        description={t("shell.deleteAgentBody")}
        confirmLabel={t("shell.deleteAgentConfirm")}
        cancelLabel={t("common.cancel")}
        danger
        loading={busy}
        onConfirm={() => void remove()}
      />
      <ConfirmDialog
        open={leaveTo !== null}
        onOpenChange={(open) => { if (!open) setLeaveTo(null); }}
        title={t("agentSettings.leave.title")}
        description={t("agentSettings.leave.body")}
        confirmLabel={t("agentSettings.leave.confirm")}
        cancelLabel={t("agentSettings.leave.stay")}
        danger
        onConfirm={() => {
          const href = leaveTo;
          setLeaveTo(null);
          if (href) router.push(href);
        }}
      />
    </div>
  );
}
