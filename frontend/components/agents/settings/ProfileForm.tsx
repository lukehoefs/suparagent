"use client";

// The Profile tab: who the agent is, its engine, approvals, clients and team role, saved together.
// The form model is lib/agent-draft.ts; a save PATCHes only the fields that changed, so the memory
// switches and connected apps (owned by the Memory and Tools tabs) are never sent from here.
import { useEffect, useId, useState, type ReactNode } from "react";
import { api, type Agent, type ClaudeAccount, type Engine, type PortalClient } from "@/lib/api";
import { approvalModesForProvider } from "@/lib/agents";
import { changedInput, toDraft, type Draft } from "@/lib/agent-draft";
import {
  approvalChoices,
  clientIdsOf,
  INSTRUCTIONS_MAX_BYTES,
  sameIds,
  teamChanges,
  utf8Bytes,
  withAgentClients,
} from "@/lib/agent-settings";
import { cn } from "@/lib/cn";
import { ownTeamSteps, ownTeamView } from "@/lib/agent-profile-extras";
import { collaboration, type TeamState } from "@/lib/collaboration";
import { supportsConnectedApps } from "@/lib/connected-apps";
import { generationParams, keepSupported, type Sampling } from "@/lib/generation";
import { useT } from "@/lib/use-i18n";
import { approvalModeText } from "@/components/agents/new/labels";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Input";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Card } from "@/components/ui/Surface";
import { Switch } from "@/components/ui/Switch";
import { AgentEditorFooter } from "@/components/chat/agents/AgentEditorFooter";
import { EngineModelFields } from "@/components/chat/EngineModelFields";
import { FallbackModelField } from "@/components/agents/settings/FallbackModelField";
import { GenerationFields } from "@/components/agents/settings/GenerationFields";
import { OwnTeamSwitches } from "./OwnTeamSwitches";
import { PictureField } from "./PictureField";

const FORM_ID = "agent-profile-form";

const samplingOf = (value: Draft): Sampling => ({
  temperature: value.temperature,
  top_p: value.top_p,
  max_output_tokens: value.max_output_tokens,
});

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  const headingId = useId();
  return (
    <Card role="group" aria-labelledby={headingId} className="flex flex-col gap-4">
      <div className="min-w-0">
        <h3 id={headingId} className="text-label font-semibold text-ink">{title}</h3>
        {hint && <p className="mt-0.5 text-small text-muted">{hint}</p>}
      </div>
      {children}
    </Card>
  );
}

export function ProfileForm({
  agent,
  agents,
  engines,
  enginesFailed = false,
  onRetryEngines,
  isAdmin,
  onSaved,
  onTeamChanged,
  onDirtyChange,
}: {
  agent: Agent;
  // Every agent, for the team lead's list of agents it coordinates.
  agents: Agent[] | null;
  // null while loading.
  engines: Engine[] | null;
  // GET /engines failed: engines is then empty, and nothing is said about an engine's abilities.
  enginesFailed?: boolean;
  onRetryEngines?: () => void;
  // Owner or admin: workspace, Claude account, clients, team role and "accept edits" are theirs.
  isAdmin: boolean;
  onSaved: (agent: Agent) => void;
  onTeamChanged: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const t = useT();
  const [original, setOriginal] = useState<Draft>(() => toDraft(agent));
  const [draft, setDraft] = useState<Draft>(() => toDraft(agent));
  const [team, setTeam] = useState<TeamState | null>(null);
  const [teamFailed, setTeamFailed] = useState(false);
  const [teamTick, setTeamTick] = useState(0);
  const [roleChoice, setRoleChoice] = useState<boolean | null>(null);
  const [memberChoices, setMemberChoices] = useState<Record<number, boolean>>({});
  // This agent's own place on the team: null until a switch is touched.
  const [ownMemberChoice, setOwnMemberChoice] = useState<boolean | null>(null);
  const [ownDelegateChoice, setOwnDelegateChoice] = useState<boolean | null>(null);
  const [clients, setClients] = useState<PortalClient[] | null>(null);
  const [clientChoice, setClientChoice] = useState<string[] | null>(null);
  const [claudeAccounts, setClaudeAccounts] = useState<ClaudeAccount[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A sampling field holds text that is not a value yet; bumped on Discard and save so typed text is cleared.
  const [samplingInvalid, setSamplingInvalid] = useState(false);
  const [engineFieldsKey, setEngineFieldsKey] = useState(0);
  // Only a save made here, in this visit.
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  // Admin-only data: what a member's device would be refused is neither loaded nor shown.
  useEffect(() => {
    if (!isAdmin) return;
    let live = true;
    api.getClients().then((value) => { if (live) setClients(value.clients); }).catch(() => { if (live) setClients(null); });
    api.listClaudeAccounts().then((value) => { if (live) setClaudeAccounts(value); }).catch(() => {});
    return () => { live = false; };
  }, [isAdmin]);

  // The team: nothing is said while it loads; a failure says so, with a retry.
  useEffect(() => {
    if (!isAdmin) return;
    let live = true;
    collaboration.team()
      .then((value) => { if (live) { setTeam(value); setTeamFailed(false); } })
      .catch(() => { if (live) setTeamFailed(true); });
    return () => { live = false; };
  }, [isAdmin, teamTick]);

  const archived = agent.archived_at !== null;
  const initialLead = team?.team?.lead_agent_id === agent.id;
  const isLead = roleChoice ?? initialLead;
  const leadDirty = roleChoice !== null && roleChoice !== initialLead;
  const members = (team?.agents ?? []).map((member) => member.id);
  const memberChanges = teamChanges(memberChoices, members, agent.id);
  const membersDirty = isLead && (memberChanges.add.length > 0 || memberChanges.remove.length > 0);
  const ownTeam = ownTeamView({
    team,
    agentId: agent.id,
    isLead,
    storedDelegate: agent.delegation_enabled,
    memberChoice: ownMemberChoice,
    delegateChoice: ownDelegateChoice,
  });
  const ownTeamDirty = isAdmin && !archived && ownTeam.dirty;
  const leadName = ownTeam.leadId === null
    ? ""
    : (team?.agents.find((member) => member.id === ownTeam.leadId)?.name ?? agents?.find((other) => other.id === ownTeam.leadId)?.name ?? "");
  // Unknown until the engine list has loaded: no warning then, and the switch can only be turned off.
  const enginesKnown = engines !== null && !enginesFailed;
  const roleSupported = enginesKnown ? engines.some((engine) => engine.id === draft.provider && engine.capabilities.mcp) : null;

  const savedClients = clientIdsOf(clients, agent.id);
  const chosenClients = clientChoice ?? savedClients;
  const clientsDirty = clientChoice !== null && !sameIds(clientChoice, savedClients);

  // Connected apps belong to the Tools tab: compare with the agent as it is now, so a save there
  // since this form opened is not undone here.
  const withCurrentApps = (value: Draft): Draft => ({
    ...value,
    connector_scopes: agent.connector_scopes ?? {},
    connector_account_scopes: agent.connector_account_scopes ?? {},
  });
  const change = changedInput(withCurrentApps(draft), withCurrentApps(original), isAdmin);
  const fieldsDirty = Object.keys(change).length > 0;
  const dirty = fieldsDirty || leadDirty || membersDirty || ownTeamDirty || clientsDirty;
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  // Only an admin may clear connected apps, which an engine without them needs first.
  const appsBlockEngine = !isAdmin
    && draft.provider !== original.provider
    && Object.keys(agent.connector_scopes ?? {}).length > 0
    && !supportsConnectedApps(draft.provider);

  const instructionBytes = utf8Bytes(draft.instructions.trim());
  const instructionsOver = instructionBytes > INSTRUCTIONS_MAX_BYTES;
  const nameMissing = draft.name.trim() === "";
  const canSave = dirty && !nameMissing && !instructionsOver && !appsBlockEngine && !samplingInvalid && !saving;

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }));

  const discard = () => {
    setDraft(original);
    setRoleChoice(null);
    setMemberChoices({});
    setOwnMemberChoice(null);
    setOwnDelegateChoice(null);
    setClientChoice(null);
    setError(null);
    setEngineFieldsKey((n) => n + 1);
  };

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const body = { ...change, ...(isAdmin && leadDirty ? { make_lead: isLead } : {}) };
      if (Object.keys(body).length > 0) {
        const saved = await api.updateAgent(agent.id, body);
        // The agent is saved; anything below that fails can be retried without saving it twice.
        const next = toDraft(saved);
        setOriginal(next);
        setDraft(next);
        setEngineFieldsKey((n) => n + 1);
        onSaved(saved);
      }
      if (isAdmin && (leadDirty || membersDirty || ownTeamDirty)) {
        let state = await collaboration.team();
        if (isLead) {
          const { add, remove } = teamChanges(memberChoices, state.agents.map((member) => member.id), agent.id);
          for (const id of add) await collaboration.addMember(id);
          for (const id of remove) await collaboration.removeMember(id);
          state = await collaboration.team();
        }
        if (ownTeamDirty) {
          // Read against the team as it is after any lead change above.
          const steps = ownTeamSteps(state, agent.id, { member: ownTeam.member, delegate: ownTeam.delegate });
          for (const step of steps) {
            if (step.kind === "remove") await collaboration.removeMember(agent.id);
            else await collaboration.delegation(agent.id, step.value);
          }
          if (steps.length > 0) state = await collaboration.team();
        }
        setTeam(state);
        setRoleChoice(null);
        setMemberChoices({});
        setOwnMemberChoice(null);
        setOwnDelegateChoice(null);
        onTeamChanged();
      }
      if (isAdmin && clientsDirty && clientChoice) {
        // Clients are one list saved whole: read it fresh so other changes are kept.
        const fresh = await api.getClients();
        const saved = await api.saveClients(withAgentClients(fresh.clients, agent.id, clientChoice));
        setClients(saved.clients);
        setClientChoice(null);
      }
      setSavedAt(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : t("agentSettings.actionFailed"));
    } finally {
      setSaving(false);
    }
  };

  const modes = approvalChoices(approvalModesForProvider(draft.provider), original.approval_mode, isAdmin);
  const modeInfo = modes.some((mode) => mode.value === draft.approval_mode) ? approvalModeText(t, draft.approval_mode) : null;
  const fallbackOn = draft.fallback_provider !== null && draft.fallback_provider !== draft.provider;
  const others = (agents ?? []).filter((other) => other.archived_at === null && other.id !== agent.id);

  return (
    <form
      id={FORM_ID}
      aria-label={t("agentSettings.tab.profile")}
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <Section title={t("agentSettings.profile.identity")}>
        {/* The avatar routes are admin-only; the picture saves at once, apart from Save. */}
        {isAdmin && <PictureField agent={agent} name={agent.name} />}
        <Field label={t("agentSettings.profile.name")} error={nameMissing ? t("agentSettings.profile.nameRequired") : undefined}>
          {(props) => <Input {...props} value={draft.name} maxLength={80} required onChange={(e) => set("name", e.target.value)} />}
        </Field>
        <Field label={t("agentSettings.profile.role")} hint={t("agentSettings.profile.roleHint")}>
          {(props) => <Input {...props} value={draft.title} maxLength={200} onChange={(e) => set("title", e.target.value)} />}
        </Field>
        <Field label={t("agentSettings.profile.description")} hint={t("agentSettings.profile.descriptionHint")}>
          {(props) => <Textarea {...props} rows={2} value={draft.description} maxLength={4000} onChange={(e) => set("description", e.target.value)} />}
        </Field>
      </Section>

      <Section title={t("agentSettings.profile.instructions")} hint={t("agentSettings.profile.instructionsHint")}>
        <Field
          label={t("agentSettings.profile.instructions")}
          hint={t("agentSettings.profile.bytes", { used: instructionBytes.toLocaleString(), max: INSTRUCTIONS_MAX_BYTES.toLocaleString() })}
          error={instructionsOver ? t("agentSettings.profile.bytesOver", { used: instructionBytes.toLocaleString(), max: INSTRUCTIONS_MAX_BYTES.toLocaleString() }) : undefined}
        >
          {(props) => <Textarea {...props} rows={8} value={draft.instructions} onChange={(e) => set("instructions", e.target.value)} className="font-mono text-[13px]" />}
        </Field>
      </Section>

      <Section title={t("agentSettings.profile.engine")} hint={t("agentSettings.profile.engineHint")}>
        <EngineModelFields
          engines={engines ?? []}
          provider={draft.provider}
          model={draft.model}
          effort={draft.effort}
          disabled={saving}
          hasComputer={agent.computer != null}
          onChange={(provider, model, effort) => setDraft((current) => ({
            ...current,
            provider,
            model,
            effort: effort ?? null,
            // Sampling the new engine or model does not send goes back to the default.
            ...keepSupported(samplingOf(current), generationParams(engines, provider, model)),
            approval_mode: approvalModesForProvider(provider).some((mode) => mode.value === current.approval_mode) ? current.approval_mode : "ask",
          }))}
        />
        <GenerationFields
          key={engineFieldsKey}
          engines={enginesFailed ? null : engines}
          provider={draft.provider}
          model={draft.model}
          value={samplingOf(draft)}
          saved={samplingOf(original)}
          disabled={saving}
          onChange={(next) => setDraft((current) => ({ ...current, ...next }))}
          onInvalidChange={setSamplingInvalid}
        />
        {appsBlockEngine && <p role="alert" className="text-small text-warning">{t("agentSettings.profile.engineNeedsAppsOff", { name: agent.name })}</p>}
        {enginesFailed && (
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-small text-danger">{t("agentSettings.profile.enginesLoadFailed")}</p>
            {onRetryEngines && <Button type="button" size="sm" onClick={onRetryEngines}>{t("agentSettings.retry")}</Button>}
          </div>
        )}
        <Field label={t("agentSettings.profile.fallback")} hint={t("agentTeam.fallbackEngineDescription")}>
          {(props) => (
            <Select
              {...props}
              value={fallbackOn ? draft.fallback_provider ?? "" : ""}
              disabled={saving}
              onChange={(e) => setDraft((current) => ({ ...current, fallback_provider: e.target.value || null, fallback_model: null }))}
            >
              <option value="">{t("agentSettings.profile.fallbackNone")}</option>
              {(engines ?? []).filter((engine) => engine.id !== draft.provider).map((engine) => (
                <option key={engine.id} value={engine.id}>{engine.label}</option>
              ))}
            </Select>
          )}
        </Field>
        {fallbackOn && draft.fallback_provider && (
          <FallbackModelField
            key={`${draft.fallback_provider}:${engineFieldsKey}`}
            engines={engines}
            fallbackProvider={draft.fallback_provider}
            value={draft.fallback_model}
            label={t("agentSettings.profile.fallbackModel")}
            disabled={saving}
            onChange={(model) => set("fallback_model", model)}
          />
        )}
        {isAdmin && draft.provider === "claude" && claudeAccounts.length > 0 && (
          <Field label={t("agentSettings.profile.claudeAccount")} hint={t("agentSettings.profile.claudeAccountHint")}>
            {(props) => (
              <Select
                {...props}
                value={draft.claude_account && claudeAccounts.some((account) => account.id === draft.claude_account) ? draft.claude_account : ""}
                disabled={saving}
                onChange={(e) => set("claude_account", e.target.value || null)}
              >
                <option value="">{t("agentSettings.profile.defaultAccount")}</option>
                {claudeAccounts.map((account) => <option key={account.id} value={account.id}>{account.label}</option>)}
              </Select>
            )}
          </Field>
        )}
      </Section>

      <Section title={t("agentSettings.profile.approvals")}>
        <SegmentedControl
          label={t("agentSettings.profile.approvals")}
          value={draft.approval_mode}
          onChange={(value) => set("approval_mode", value)}
          options={modes.map((mode) => ({ value: mode.value, label: approvalModeText(t, mode.value).label }))}
          className="max-w-full flex-wrap self-start"
        />
        {modeInfo && <p className="text-small text-muted">{modeInfo.description}</p>}
      </Section>

      {isAdmin && clients !== null && clients.length > 0 && (
        <Section title={t("agentSettings.profile.clients")} hint={t("agentSettings.profile.clientsHint", { name: agent.name })}>
          <div role="group" aria-label={t("agentSettings.profile.clients")} className="flex flex-wrap gap-2">
            {clients.map((client) => {
              const on = chosenClients.includes(client.id);
              return (
                <button
                  key={client.id}
                  type="button"
                  aria-pressed={on}
                  disabled={saving}
                  onClick={() => setClientChoice(on ? chosenClients.filter((id) => id !== client.id) : [...chosenClients, client.id])}
                  className={cn(
                    "inline-flex h-control-md cursor-pointer items-center rounded-full border px-3 text-label font-medium transition-colors duration-(--dur-fast) disabled:cursor-not-allowed disabled:opacity-50 touch:h-touch",
                    on ? "border-accent bg-accent-bg text-accent-text" : "border-line bg-raised text-muted hover:bg-hover hover:text-ink",
                  )}
                >
                  {client.name}
                </button>
              );
            })}
          </div>
        </Section>
      )}

      {isAdmin && (
        <Section title={t("agentTeam.teamPermissionsTitle")}>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-label font-medium text-ink">{t("agentTeam.leadRole")}</p>
              <p className="mt-0.5 text-small text-muted">{t("agentTeam.leadRoleDescription")}</p>
            </div>
            <Switch
              checked={isLead}
              disabled={saving || archived || team === null || (roleSupported !== true && !isLead)}
              onChange={(next) => setRoleChoice(next)}
              label={t("agentTeam.leadRole")}
              className="mt-0.5"
            />
          </div>
          {teamFailed && team === null && (
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-small text-danger">{t("agentSettings.profile.teamLoadFailed")}</p>
              <Button type="button" size="sm" onClick={() => setTeamTick((n) => n + 1)}>{t("agentSettings.retry")}</Button>
            </div>
          )}
          {archived && <p className="text-small text-muted">{t("agentSettings.profile.archivedLead", { name: agent.name })}</p>}
          {!archived && roleSupported === false && <p className="text-small text-warning">{t("agentTeam.teamEngineChoice")}</p>}
          {team?.enabled === false && <p className="text-small text-warning">{t("agentTeam.teamsDisabled")}</p>}
          <OwnTeamSwitches
            view={ownTeam}
            name={agent.name}
            leadName={leadName}
            disabled={saving || archived}
            onMember={(next) => setOwnMemberChoice(next)}
            onDelegate={(next) => {
              setOwnDelegateChoice(next);
              // Only a member can delegate: turning it on joins the team (one call on save).
              if (next && !ownTeam.member) setOwnMemberChoice(true);
            }}
          />
          {isLead && team !== null && !archived && (
            <fieldset className="flex min-w-0 flex-col gap-2">
              <legend className="mb-1 text-label font-medium text-ink">{t("agentTeam.leadCoordinates")}</legend>
              {others.map((other) => (
                <label key={other.id} className="flex cursor-pointer items-center gap-2 text-label text-ink touch:min-h-11">
                  <input
                    type="checkbox"
                    className="size-4 accent-(--accent)"
                    disabled={saving}
                    checked={memberChoices[other.id] ?? members.includes(other.id)}
                    onChange={(event) => setMemberChoices((current) => ({ ...current, [other.id]: event.target.checked }))}
                  />
                  {other.name}
                </label>
              ))}
              <p className="text-small text-muted">{t("agentTeam.memberSelectionSaved")}</p>
            </fieldset>
          )}
        </Section>
      )}

      {isAdmin && (
        <Section title={t("agentSettings.profile.workspace")}>
          <Field label={t("agentSettings.profile.workspaceFolder")} hint={t("agentSettings.profile.workspaceHint")}>
            {(props) => (
              <Input
                {...props}
                value={draft.workspace_path}
                onChange={(e) => set("workspace_path", e.target.value)}
                placeholder={t("agentSettings.profile.workspacePlaceholder")}
                spellCheck={false}
                className="font-mono"
              />
            )}
          </Field>
        </Section>
      )}

      <div className="sticky bottom-4 z-10 rounded-card bg-raised px-4 py-3 shadow-float">
        {dirty || saving || error ? (
          <AgentEditorFooter
            dirty={dirty}
            saving={saving}
            error={error}
            canSave={canSave}
            saveLabel={t("agentSettings.save")}
            cancelLabel={t("agentSettings.discardChanges")}
            onCancel={discard}
            form={FORM_ID}
            unsavedLabel={t("agentSettings.unsaved")}
            savingLabel={t("agentSettings.saving")}
          />
        ) : (
          <div className="flex w-full flex-wrap items-center gap-2">
            <p role="status" aria-live="polite" className="min-w-0 flex-1 text-xs text-muted">
              {savedAt ? t("agentSettings.savedAt", { time: savedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }) : null}
            </p>
            <Button type="submit" form={FORM_ID} variant="primary" disabled className="disabled:bg-inset disabled:text-muted disabled:opacity-100">
              {t("agentSettings.save")}
            </Button>
          </div>
        )}
      </div>
    </form>
  );
}
