"use client";

import { Bot, Plus, Search } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { api, ApiError, type Agent, type Engine, type PortalClient } from "@/lib/api";
import { agentChatHref, BLUEPRINTS_HREF, editAgentHref, newAgentHref } from "@/lib/agent-pages";
import { collaboration } from "@/lib/collaboration";
import { agentStatus, clientAgentIds, clientsCovering, engineSummary, splitRoster, waitingAgentIds } from "@/lib/roster";
import { computerBadge } from "@/lib/sidebar";
import { useT } from "@/lib/use-i18n";
import { filterAgents } from "@/components/chat/agents/agent-list";
import { useAppShell } from "@/components/shell/AppShell";
import { forgetAgentPicture } from "@/components/ui/AvatarPictures";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input, Select } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { Card } from "@/components/ui/Surface";
import { Switch } from "@/components/ui/Switch";
import { useToast } from "@/components/ui/Toast";
import { AgentCard, type CardActions } from "./roster/AgentCard";
import { LinkButton } from "@/components/ui/LinkButton";
import { removeAgentFromClients } from "./agent-clients";
import { TeamSection } from "./roster/TeamSection";
import { useAgentCounts } from "./roster/useAgentCounts";

// GET /team is the only live per-agent state; read it this often while the page is in view.
const TEAM_EVERY_MS = 5_000;
// The old agents dialog keeps import, export, migration, templates and duplicate until they move here.
const AGENTS_DIALOG_HREF = "/chat/?view=agents";
const GRID = "grid grid-cols-[repeat(auto-fill,minmax(min(300px,100%),1fr))] gap-4";

// The Agents roster and Team section (design: Agents.html), inside the app shell. Lists come from
// the shell (useAppShell); the page adds the engines, the clients (admin), the skill and tool
// counts (admin, as cards come into view) and a 5 s team poll while visible.
export function AgentsRoster() {
  const t = useT();
  const toast = useToast();
  const { agents, threads, team, teamStatus, openTeam, attention, refreshAgents, refreshThreads, refreshTeam, isAdmin, mayManageAgents, loadError } = useAppShell();
  const archivedHeadingId = useId();

  const [query, setQuery] = useState("");
  const [clientId, setClientId] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  // undefined while loading, null when the list could not be read.
  const [engines, setEngines] = useState<Engine[] | null | undefined>(undefined);
  const [clients, setClients] = useState<PortalClient[] | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [archiving, setArchiving] = useState<Agent | null>(null);
  const [deleting, setDeleting] = useState<Agent | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const { counts, request: requestCounts } = useAgentCounts(isAdmin);

  useEffect(() => {
    let alive = true;
    api.getEngines()
      .then((list) => { if (alive) setEngines(list); })
      .catch(() => { if (alive) setEngines(null); });
    return () => { alive = false; };
  }, []);

  // Clients are owner and admin data (GET /clients); a member would get 403, so it is not asked.
  useEffect(() => {
    if (!isAdmin) return;
    let alive = true;
    api.getClients()
      .then((response) => { if (alive) setClients(response.clients); })
      .catch(() => { if (alive) setClients(null); });
    return () => { alive = false; };
  }, [isAdmin]);

  // The team's live state, every 5 s while the page is visible; on return it is read at once.
  useEffect(() => {
    let timer: number | null = null;
    const tick = () => {
      refreshTeam();
    };
    const start = () => { if (timer === null) timer = window.setInterval(tick, TEAM_EVERY_MS); };
    const stop = () => { if (timer !== null) { window.clearInterval(timer); timer = null; } };
    const onVisibility = () => {
      if (document.hidden) stop();
      else { tick(); start(); }
    };
    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refreshTeam]);

  const engineLabels = useMemo(() => new Map((engines ?? []).map((engine) => [engine.id, engine.label])), [engines]);
  const { live, archived } = useMemo(() => splitRoster(agents), [agents]);
  const clientIds = clientAgentIds(clients, clientId);
  const filtering = query.trim() !== "" || clientIds !== null;
  const shown = (list: Agent[]) => filterAgents(list, query, engineLabels).filter((agent) => clientIds === null || clientIds.has(agent.id));
  const shownLive = shown(live);
  const shownArchived = showArchived ? shown(archived) : [];
  const waiting = useMemo(() => waitingAgentIds(attention, threads), [attention, threads]);
  const leadId = team?.team?.lead_agent_id ?? null;
  const clientsCount = clientsCovering(clients, new Set(live.map((agent) => agent.id)));
  const showClientFilter = isAdmin && clients !== null && clients.length > 0;
  const loaded = agents !== null;
  const empty = loaded && live.length === 0 && archived.length === 0;

  const subtitle = !loaded
    ? null
    : [
        t(live.length === 1 ? "roster.countAgentsOne" : "roster.countAgentsMany", { n: live.length }),
        clientsCount > 0 ? t(clientsCount === 1 ? "roster.countClientsOne" : "roster.countClientsMany", { n: clientsCount }) : null,
        filtering && live.length > 0 ? t("roster.countShown", { n: shownLive.length }) : null,
      ].filter(Boolean).join(" · ");

  const errorText = (err: unknown, agent: Agent) => {
    if (err instanceof ApiError && err.code === "agent_name_taken") return t("roster.nameTaken", { name: agent.name });
    return err instanceof Error && err.message ? err.message : t("shell.actionFailed");
  };

  const run = async (agent: Agent, action: () => Promise<unknown>, done?: string) => {
    setBusyId(agent.id);
    setActionError(null);
    try {
      await action();
      if (done) toast(done);
    } catch (err) {
      setActionError(errorText(err, agent));
    } finally {
      setBusyId(null);
      refreshAgents();
      refreshTeam();
    }
  };

  const confirmArchive = async () => {
    if (!archiving) return;
    const agent = archiving;
    setConfirmBusy(true);
    await run(agent, () => api.updateAgent(agent.id, { archived: true }), t("roster.archived", { name: agent.name }));
    setConfirmBusy(false);
    setArchiving(null);
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    const agent = deleting;
    setConfirmBusy(true);
    await run(agent, async () => { await api.deleteAgent(agent.id); forgetAgentPicture(agent.id); await removeAgentFromClients(agent.id); }, t("roster.deleted", { name: agent.name }));
    refreshThreads();
    setConfirmBusy(false);
    setDeleting(null);
  };

  const actionsFor = (agent: Agent, isArchived: boolean): CardActions => {
    const isLead = leadId === agent.id;
    return {
      onPin: mayManageAgents && !isArchived ? () => void run(agent, () => api.updateAgent(agent.id, { pinned: !agent.pinned })) : undefined,
      onLead: isAdmin && !isArchived
        ? () => void run(agent, () => (isLead ? collaboration.clearLead(agent.id) : collaboration.lead(agent.id)))
        : undefined,
      onArchive: mayManageAgents && !isArchived ? () => setArchiving(agent) : undefined,
      onRestore: mayManageAgents && isArchived
        ? () => void run(agent, () => api.updateAgent(agent.id, { archived: false }), t("roster.restored", { name: agent.name }))
        : undefined,
      onDelete: isAdmin ? () => setDeleting(agent) : undefined,
    };
  };

  const card = (agent: Agent, isArchived: boolean) => (
    <li key={agent.id} className="min-w-0">
      <AgentCard
        agent={agent}
        archived={isArchived}
        engine={engines === undefined ? null : engineSummary(agent, engines)}
        status={isArchived ? null : agentStatus(agent.id, team?.agents, waiting)}
        isLead={!isArchived && leadId === agent.id}
        computer={isArchived ? null : computerBadge(agent.computer?.state)}
        chatHref={isArchived ? null : agentChatHref(threads, agent.id)}
        settingsHref={!isArchived && (isAdmin || mayManageAgents) ? editAgentHref(agent.id) : null}
        counts={isAdmin && !isArchived ? counts.get(agent.id) ?? null : undefined}
        requestCounts={isAdmin ? requestCounts : undefined}
        actions={actionsFor(agent, isArchived)}
        busy={busyId === agent.id}
      />
    </li>
  );

  const newAgent = (
    <LinkButton href={newAgentHref()} variant="primary" icon={<Plus size={15} />}>{t("sidebar.newAgent")}</LinkButton>
  );

  let roster;
  if (!loaded) {
    roster = loadError ? null : (
      <div role="status" className={GRID}>
        <span className="sr-only">{t("roster.loading")}</span>
        {[0, 1, 2].map((key) => (
          <Card key={key} className="flex flex-col gap-3.5">
            <div className="flex items-center gap-3">
              <Skeleton className="size-10 rounded-full" />
              <div className="flex flex-1 flex-col gap-1.5">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
            <Skeleton className="h-6 w-40 rounded-full" />
            <Skeleton className="h-9 w-24" />
          </Card>
        ))}
      </div>
    );
  } else if (empty) {
    roster = (
      <Card>
        <EmptyState
          icon={<Bot size={24} />}
          title={t("roster.emptyTitle")}
          description={mayManageAgents ? t("roster.emptyManage") : t("roster.emptyMember")}
          action={mayManageAgents ? newAgent : undefined}
        />
      </Card>
    );
  } else if (live.length === 0) {
    roster = (
      <Card>
        <EmptyState icon={<Bot size={24} />} title={t("roster.noLiveTitle")} description={t("roster.noLiveBody")} />
      </Card>
    );
  } else if (shownLive.length === 0) {
    roster = (
      <EmptyState
        compact
        title={t("roster.noMatchTitle")}
        description={t("roster.noMatchBody")}
        action={<Button variant="ghost" onClick={() => { setQuery(""); setClientId(""); }}>{t("roster.clearFilters")}</Button>}
      />
    );
  } else {
    roster = <ul aria-label={t("sidebar.agents")} className={GRID}>{shownLive.map((agent) => card(agent, false))}</ul>;
  }

  return (
    <div className="flex flex-col gap-6 px-4 pb-10 pt-5 sm:px-8 sm:pt-7">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-h1 font-semibold tracking-[-0.02em] text-ink">{t("sidebar.agents")}</h1>
          {subtitle ? <p className="mt-1 text-body text-muted">{subtitle}</p> : null}
        </div>
        {loaded && !empty ? (
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <div className="relative w-full sm:w-60">
              <Search size={15} aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
              <Input type="search" value={query} onChange={(event) => setQuery(event.target.value)} aria-label={t("roster.search")} placeholder={t("roster.search")} className="pl-8" />
            </div>
            {showClientFilter ? (
              <Select
                aria-label={t("roster.filterByClient")}
                value={clientIds === null ? "" : clientId}
                onChange={(event) => setClientId(event.target.value)}
                options={[{ value: "", label: t("roster.allClients") }, ...clients.map((client) => ({ value: client.id, label: client.name }))]}
                className="w-48"
                triggerClassName="h-control touch:h-touch"
              />
            ) : null}
            {mayManageAgents ? <LinkButton href={BLUEPRINTS_HREF}>{t("roster.blueprints")}</LinkButton> : null}
            {mayManageAgents ? newAgent : null}
          </div>
        ) : null}
      </header>

      {loadError ? (
        <Banner tone="danger" action={<Button size="sm" onClick={refreshAgents}>{t("roster.retry")}</Button>}>{loadError}</Banner>
      ) : null}
      {actionError ? <Banner tone="danger" onDismiss={() => setActionError(null)}>{actionError}</Banner> : null}

      {roster}

      {loaded && (archived.length > 0 || mayManageAgents) ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          {archived.length > 0 ? (
            <label className="flex cursor-pointer items-center gap-2 text-label text-muted">
              <Switch checked={showArchived} onChange={setShowArchived} label={t("roster.showArchived")} />
              <span>{t("roster.showArchived")} ({archived.length})</span>
            </label>
          ) : <span />}
          {mayManageAgents ? <LinkButton href={AGENTS_DIALOG_HREF} variant="ghost" className="text-muted hover:text-ink">{t("roster.importMigrate")}</LinkButton> : null}
        </div>
      ) : null}

      {showArchived && archived.length > 0 ? (
        <section aria-labelledby={archivedHeadingId} className="flex flex-col gap-3">
          <h2 id={archivedHeadingId} className="text-h3 font-semibold text-ink">{t("roster.archivedHeading")}</h2>
          {shownArchived.length > 0 ? (
            <ul aria-labelledby={archivedHeadingId} className={GRID}>{shownArchived.map((agent) => card(agent, true))}</ul>
          ) : (
            <p className="text-small text-muted">{t("roster.noArchivedMatch")}</p>
          )}
        </section>
      ) : null}

      {/* Archived agents are never on a team, so with no live agent there is no team to draw. */}
      {loaded && live.length > 0 ? <TeamSection team={team} unavailable={teamStatus === "failed"} isAdmin={isAdmin} onManage={openTeam} /> : null}

      <ConfirmDialog
        open={archiving !== null}
        onOpenChange={(open) => { if (!open && !confirmBusy) setArchiving(null); }}
        title={archiving ? t("roster.archiveTitle", { name: archiving.name }) : ""}
        description={archiving ? t("roster.archiveBody", { name: archiving.name }) : undefined}
        confirmLabel={t("roster.archiveConfirm")}
        cancelLabel={t("common.cancel")}
        loading={confirmBusy}
        onConfirm={() => void confirmArchive()}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => { if (!open && !confirmBusy) setDeleting(null); }}
        title={deleting ? t("shell.deleteAgentTitle", { name: deleting.name }) : ""}
        description={t("shell.deleteAgentBody")}
        confirmLabel={t("shell.deleteAgentConfirm")}
        cancelLabel={t("common.cancel")}
        danger
        loading={confirmBusy}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}
