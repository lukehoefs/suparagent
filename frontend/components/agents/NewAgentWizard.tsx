"use client";

// New agent (design: NewAgent.html): three steps, Identity, Tools and Create, then the requests that
// need the new agent's id (connected apps, tool grants, soul, client, template skills), each with its own
// state and Retry. The agent is created once: after POST /agents returns, a retry only repeats the
// follow-up that failed.
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { useAppShell, useLeaveGuard } from "@/components/shell/AppShell";
import { Badge } from "@/components/ui/Badge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonList } from "@/components/ui/Skeleton";
import { Stepper } from "@/components/ui/Stepper";
import { Card } from "@/components/ui/Surface";
import { useToast } from "@/components/ui/Toast";
import { api, type Agent, type ApprovalMode } from "@/lib/api";
import { EMPTY_DRAFT, toInput, type Draft } from "@/lib/agent-draft";
import { AGENTS_HREF, BLUEPRINTS_HREF, agentChatHref, editAgentHref } from "@/lib/agent-pages";
import { blueprintById, type Blueprint } from "@/lib/blueprints";
import { agentAppOptions, levelOf, supportsConnectedApps } from "@/lib/connected-apps";
import {
  blueprintSeed,
  engineModelText,
  fitApprovalMode,
  followUpPlan,
  formKey,
  grantsFor,
  isNameTaken,
  normalizePicks,
  runOutcome,
  supportsToolGrants,
  withAgentInClient,
  type FollowUp,
  type FollowUpState,
} from "@/lib/new-agent";
import { installTemplateSkills, type AgentTemplate } from "@/lib/templates";
import { useT } from "@/lib/use-i18n";
import { AgentPreview } from "./new/AgentPreview";
import { CreateStep, type ReviewTools } from "./new/CreateStep";
import { FollowUpPanel } from "./new/FollowUpPanel";
import { IdentityStep } from "./new/IdentityStep";
import { appLevelText, approvalModeText } from "./new/labels";
import { LinkButton } from "@/components/ui/LinkButton";
import { ToolsStep } from "./new/ToolsStep";
import { useNewAgentData } from "./new/useNewAgentData";

type Step = 0 | 1 | 2;

const messageOf = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);

export function NewAgentWizard() {
  const t = useT();
  const shell = useAppShell();
  const params = useSearchParams();
  const blueprint = blueprintById(params.get("blueprint"));

  if (!shell.mayManageAgents) {
    return (
      <Page>
        <Header blueprint={null} />
        <Card>
          <EmptyState
            title={t("newAgent.noPermissionTitle")}
            description={t("newAgent.noPermissionBody")}
            action={<LinkButton href={AGENTS_HREF}>{t("sidebar.allAgents")}</LinkButton>}
          />
        </Card>
      </Page>
    );
  }
  // The live agents' names keep a blueprint's name unique, so wait for them (unless they cannot load).
  if (shell.agents === null && shell.loadError === null) {
    return (
      <Page>
        <Header blueprint={blueprint} />
        <SkeletonList rows={5} />
      </Page>
    );
  }
  return <NewAgentForm key={blueprint?.id ?? ""} blueprint={blueprint} />;
}

function NewAgentForm({ blueprint }: { blueprint: Blueprint | null }) {
  const t = useT();
  const router = useRouter();
  const toast = useToast();
  const { agents, threads, team, isAdmin: admin, refreshAgents, refreshTeam } = useAppShell();
  const data = useNewAgentData(admin);

  const [seed] = useState(() => blueprintSeed(blueprint, (agents ?? []).filter((agent) => agent.archived_at === null).map((agent) => agent.name)));
  const [draft, setDraft] = useState<Draft>(() => ({ ...EMPTY_DRAFT, name: seed.name, title: seed.title }));
  const [purpose, setPurpose] = useState(seed.purpose);
  const [clientId, setClientId] = useState("");
  const [picks, setPicks] = useState<Record<string, string[]>>({});
  const [makeLead, setMakeLead] = useState(false);
  const [template, setTemplate] = useState<AgentTemplate | null>(null);
  const [useTemplate, setUseTemplate] = useState(true);
  const [skillChoices, setSkillChoices] = useState<string[]>([]);
  const [step, setStep] = useState<Step>(0);
  const [nameError, setNameError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<{ message: string; nameTaken: boolean } | null>(null);
  const [created, setCreated] = useState<Agent | null>(null);
  const [plan, setPlan] = useState<FollowUp[]>([]);
  const [states, setStates] = useState<Record<string, FollowUpState>>({});
  const [retrying, setRetrying] = useState<string | null>(null);
  const [leaveTo, setLeaveTo] = useState<string | null>(null);

  // A second click while a request is out never sends another one.
  const busy = useRef(false);
  const statesRef = useRef<Record<string, FollowUpState>>({});
  const headingRef = useRef<HTMLHeadingElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const mounted = useRef(false);

  // A blueprint that does the same job as a backend template offers its instructions, starter notes and
  // suggested skills. Without the catalog the blueprint's own fields still stand. GET /templates and the
  // skill installs need the admin scope, so other devices never ask.
  const templateId = admin ? blueprint?.templateId ?? null : null;
  useEffect(() => {
    if (!templateId) return;
    let alive = true;
    api.listTemplates()
      .then((catalog) => {
        const found = catalog.templates.find((item) => item.id === templateId);
        if (!alive || !found || !found.available) return;
        setTemplate(found);
        setSkillChoices(found.skills.map((skill) => skill.name));
        setDraft((d) => ({ ...d, instructions: d.instructions || found.instructions, starter_notes: d.starter_notes || (found.starter_notes ?? "") }));
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [templateId]);

  // Focus follows the step: the name field on step 1, otherwise the step's heading.
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    if (step === 0 && created === null) nameRef.current?.focus();
    else headingRef.current?.focus();
  }, [step, created]);

  // Unsaved changes: anything that differs from what the page opened with (a blueprint's fields included).
  const templateNotes = template?.starter_notes ?? "";
  const seedKey = formKey({
    draft: {
      ...EMPTY_DRAFT,
      name: seed.name,
      title: seed.title,
      instructions: template && useTemplate ? template.instructions : "",
      starter_notes: template && useTemplate ? templateNotes : "",
    },
    purpose: seed.purpose, clientId: "", picks: {}, makeLead: false, useTemplate: true,
    skills: template ? template.skills.map((skill) => skill.name).sort() : [],
  });
  const formNow = formKey({ draft, purpose, clientId, picks: normalizePicks(picks), makeLead, useTemplate, skills: [...skillChoices].sort() });
  const guard = created === null && (formNow !== seedKey || creating);

  // The shell asks before the browser or any other link (the sidebar too) leaves the form.
  useLeaveGuard(guard);

  const leave = (href: string) => (event: MouseEvent<HTMLAnchorElement>) => {
    if (!guard) return;
    event.preventDefault();
    setLeaveTo(href);
  };

  const engine = data.engines?.find((item) => item.id === draft.provider) ?? null;
  const engineText = engineModelText(data.engines, draft.provider, draft.model);
  const leadSupported = engine?.capabilities.mcp === true;
  const clients = admin ? data.clients : null;
  const showClient = (clients?.length ?? 0) > 0;

  const onDraft = (patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    if ("name" in patch) {
      setNameError(null);
      setCreateError((current) => (current?.nameTaken ? null : current));
    }
  };

  const onEngine = (provider: string, model: string | null, effort: string | null) =>
    setDraft((d) => ({ ...d, provider, model, effort, approval_mode: fitApprovalMode(d.approval_mode, provider, admin) }));

  const onUseTemplate = (on: boolean) => {
    setUseTemplate(on);
    if (!template) return;
    setDraft((d) => on
      ? { ...d, instructions: d.instructions || template.instructions, starter_notes: d.starter_notes || templateNotes }
      : {
        ...d,
        instructions: d.instructions === template.instructions ? "" : d.instructions,
        starter_notes: d.starter_notes === templateNotes ? "" : d.starter_notes,
      });
  };

  const setItem = (key: string, value: FollowUpState) => {
    statesRef.current = { ...statesRef.current, [key]: value };
    setStates(statesRef.current);
  };

  // One follow-up request. Returns a note for a step that finished with something worth saying.
  const perform = async (item: FollowUp, agentId: number): Promise<string | null> => {
    switch (item.kind) {
      case "apps":
        await api.updateAgent(agentId, { connector_scopes: item.scopes, connector_account_scopes: item.accountScopes });
        return null;
      case "tools": {
        // The current revision and schema digests, read now: the server checks both.
        const conn = (await api.listCustomMcp()).find((candidate) => candidate.id === item.connectionId);
        if (!conn || !conn.enabled) throw new Error(t("newAgent.serverGone"));
        const [tools, existing] = await Promise.all([api.getCustomMcpTools(conn.id), api.getCustomMcpGrants(conn.id, agentId)]);
        const { grants, missing } = grantsFor(item.tools, tools, existing.tool_names);
        await api.saveCustomMcpGrants(conn.id, agentId, conn.revision, grants);
        return missing.length ? t("newAgent.toolsMissing", { names: missing.join(", ") }) : null;
      }
      case "soul":
        await api.saveSoul(agentId, item.text);
        return null;
      case "client": {
        const { clients: current } = await api.getClients();
        const next = withAgentInClient(current, item.clientId, agentId);
        if (!next) throw new Error(t("newAgent.clientGone"));
        await api.saveClients(next);
        return null;
      }
      case "skills": {
        const result = await installTemplateSkills(agentId, item.templateId, item.skills, api.installTemplateSkill);
        if (result.unsupported) throw new Error(t("newAgent.skillsUnsupported"));
        if (result.failed.length) throw new Error(t("newAgent.skillsFailed", { names: result.failed.join(", ") }));
        return null;
      }
    }
  };

  const runItem = async (item: FollowUp, agentId: number): Promise<boolean> => {
    setItem(item.key, { status: "running", error: null });
    try {
      const note = await perform(item, agentId);
      setItem(item.key, { status: "done", error: null, note });
      return true;
    } catch (err) {
      setItem(item.key, { status: "failed", error: messageOf(err, t("common.operationError")) });
      return false;
    }
  };

  const create = async () => {
    if (busy.current || created !== null || draft.name.trim() === "") return;
    busy.current = true;
    setCreating(true);
    setCreateError(null);
    // What runs after the create is fixed now, so a retry repeats exactly what was asked for.
    const frozen = followUpPlan({
      admin,
      provider: draft.provider,
      name: draft.name,
      purpose,
      scopes: draft.connector_scopes,
      accountScopes: draft.connector_account_scopes,
      picks,
      servers: (data.toolServers ?? []).map((server) => ({ id: server.conn.id, name: server.conn.name })),
      clientId: showClient ? clientId : "",
      clients: clients ?? [],
      template,
      skillChoices,
    });
    const lead = admin && makeLead && leadSupported;
    let agent: Agent;
    try {
      agent = await api.createAgent({ ...toInput(draft, admin), ...(lead ? { make_lead: true } : {}) });
    } catch (err) {
      const taken = isNameTaken(err);
      if (taken) setNameError(t("newAgent.nameTaken"));
      setCreateError({ message: messageOf(err, t("common.operationError")), nameTaken: taken });
      busy.current = false;
      setCreating(false);
      return;
    }
    statesRef.current = Object.fromEntries(frozen.map((item) => [item.key, { status: "queued", error: null } satisfies FollowUpState]));
    setStates(statesRef.current);
    setPlan(frozen);
    setCreated(agent);
    refreshAgents();
    if (lead) refreshTeam();
    let failed = false;
    for (const item of frozen) {
      if (!(await runItem(item, agent.id))) failed = true;
    }
    busy.current = false;
    setCreating(false);
    if (!failed) toast(t("newAgent.readyTitle", { name: agent.name }));
  };

  const retry = async (item: FollowUp) => {
    if (created === null || busy.current) return;
    busy.current = true;
    setRetrying(item.key);
    const ok = await runItem(item, created.id);
    busy.current = false;
    setRetrying(null);
    if (ok && runOutcome(plan, statesRef.current) === "done") toast(t("newAgent.readyTitle", { name: created.name }));
  };

  const steps = [t("newAgent.stepIdentity"), t("newAgent.stepTools"), t("newAgent.stepCreate")];
  const appsOffered = admin && supportsConnectedApps(draft.provider);
  const toolsOffered = admin && supportsToolGrants(draft.provider);
  const chosenPicks = normalizePicks(picks);
  const reviewApps = appsOffered
    ? agentAppOptions(data.appAccounts, draft.connector_scopes)
      .filter((app) => levelOf(draft.connector_scopes, app.slug) !== "off")
      .map((app) => ({ label: app.label, level: appLevelText(t, levelOf(draft.connector_scopes, app.slug)) }))
    : undefined;
  const reviewTools: ReviewTools | undefined = toolsOffered
    ? (data.toolServers ?? []).flatMap((server) => (chosenPicks[server.conn.id] ? [{ server: server.conn.name, tools: chosenPicks[server.conn.id] }] : []))
    : undefined;

  let body: ReactNode;
  if (created !== null) {
    body = (
      <FollowUpPanel
        name={created.name}
        plan={plan}
        states={states}
        outcome={creating ? "running" : runOutcome(plan, states)}
        retrying={retrying}
        onRetry={(item) => void retry(item)}
        chatHref={agentChatHref(threads, created.id)}
        settingsHref={editAgentHref(created.id)}
        headingRef={headingRef}
      />
    );
  } else if (step === 0) {
    body = (
      <IdentityStep
        draft={draft}
        onDraft={onDraft}
        onEngine={onEngine}
        showPurpose={admin}
        purpose={purpose}
        onPurpose={setPurpose}
        clients={showClient ? clients : null}
        clientId={clientId}
        onClientId={setClientId}
        engines={data.engines}
        enginesError={data.enginesError}
        onRetryEngines={data.reloadEngines}
        nameError={nameError}
        onContinue={() => setStep(1)}
        headingRef={headingRef}
        nameRef={nameRef}
      />
    );
  } else if (step === 1) {
    body = (
      <ToolsStep
        admin={admin}
        provider={draft.provider}
        approvalMode={draft.approval_mode}
        onApprovalMode={(mode: ApprovalMode) => onDraft({ approval_mode: mode })}
        scopes={draft.connector_scopes}
        accountScopes={draft.connector_account_scopes}
        onScopes={(connector_scopes) => onDraft({ connector_scopes })}
        onAccountScopes={(connector_account_scopes) => onDraft({ connector_account_scopes })}
        appAccounts={data.appAccounts}
        toolServers={data.toolServers}
        toolsError={data.toolsError}
        onRetryTools={data.reloadTools}
        picks={picks}
        onPicks={setPicks}
        onBack={() => setStep(0)}
        onContinue={() => setStep(2)}
        headingRef={headingRef}
      />
    );
  } else {
    body = (
      <CreateStep
        draft={draft}
        onDraft={onDraft}
        admin={admin}
        purpose={purpose}
        clientName={showClient ? clients?.find((client) => client.id === clientId)?.name ?? null : undefined}
        engineText={engineText}
        approvalLabel={approvalModeText(t, draft.approval_mode).label}
        apps={reviewApps}
        tools={reviewTools}
        template={template}
        useTemplate={useTemplate}
        onUseTemplate={onUseTemplate}
        skillChoices={skillChoices}
        onSkillChoices={setSkillChoices}
        claudeAccounts={data.claudeAccounts}
        leadSupported={leadSupported}
        teamsDisabled={team?.enabled === false}
        makeLead={makeLead}
        onMakeLead={setMakeLead}
        creating={creating}
        createError={createError?.message ?? null}
        nameTaken={createError?.nameTaken ?? false}
        onEditStep={setStep}
        onBack={() => setStep(1)}
        onCreate={() => void create()}
        headingRef={headingRef}
      />
    );
  }

  return (
    <Page>
      <Header
        blueprint={blueprint}
        actions={created === null ? (
          <>
            <LinkButton href={BLUEPRINTS_HREF} onClick={leave(BLUEPRINTS_HREF)} data-own-leave-guard="">{t("newAgent.browseBlueprints")}</LinkButton>
            <LinkButton href={AGENTS_HREF} variant="ghost" onClick={leave(AGENTS_HREF)} data-own-leave-guard="">{t("common.cancel")}</LinkButton>
          </>
        ) : null}
      />
      <Stepper steps={steps} current={created !== null ? steps.length : step} label={t("newAgent.stepsLabel")} variant="inline" />
      <div className="flex flex-wrap items-start gap-6">
        <div className="min-w-0 grow-[999] basis-[480px]">{body}</div>
        <AgentPreview name={draft.name} title={draft.title} engine={engine ? engineText : null} agentId={created?.id ?? null} />
      </div>
      <ConfirmDialog
        open={leaveTo !== null}
        onOpenChange={(open) => { if (!open) setLeaveTo(null); }}
        title={t("newAgent.discardTitle")}
        description={t("newAgent.discardBody")}
        confirmLabel={t("newAgent.discardConfirm")}
        cancelLabel={t("newAgent.keepEditing")}
        danger
        onConfirm={() => {
          const to = leaveTo;
          setLeaveTo(null);
          if (to) router.push(to);
        }}
      />
    </Page>
  );
}

function Page({ children }: { children: ReactNode }) {
  return <div className="flex w-full max-w-6xl flex-col gap-6 px-4 pb-8 pt-5 sm:px-8 sm:pb-10 sm:pt-7">{children}</div>;
}

function Header({ blueprint, actions }: { blueprint: Blueprint | null; actions?: ReactNode }) {
  const t = useT();
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-h1 font-semibold tracking-[-0.02em] text-ink">{t("newAgent.title")}</h1>
        <p className="mt-1 text-body text-muted">{t("newAgent.subtitle")}</p>
        {blueprint ? (
          <div className="mt-2">
            <Badge>{t("newAgent.fromBlueprint", { name: blueprint.name })}</Badge>
          </div>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
