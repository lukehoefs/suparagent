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
import { collaboration, type TeamState } from "@/lib/collaboration";
import { useT } from "@/lib/use-i18n";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Input";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Card } from "@/components/ui/Surface";
import { Switch } from "@/components/ui/Switch";
import { AgentEditorFooter } from "@/components/chat/agents/AgentEditorFooter";
import { EngineModelFields } from "@/components/chat/EngineModelFields";

const FORM_ID = "agent-profile-form";

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
  isAdmin,
  onSaved,
  onTeamChanged,
  onDirtyChange,
}: {
  agent: Agent;
  // Every agent, for the team lead's list of agents it coordinates.
  agents: Agent[] | null;
  engines: Engine[] | null;
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
  const [roleChoice, setRoleChoice] = useState<boolean | null>(null);
  const [memberChoices, setMemberChoices] = useState<Record<number, boolean>>({});
  const [clients, setClients] = useState<PortalClient[] | null>(null);
  const [clientChoice, setClientChoice] = useState<string[] | null>(null);
  const [claudeAccounts, setClaudeAccounts] = useState<ClaudeAccount[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Only a save made here, in this visit.
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  // Admin-only data: what a member's device would be refused is neither loaded nor shown.
  useEffect(() => {
    if (!isAdmin) return;
    let live = true;
    collaboration.team().then((value) => { if (live) setTeam(value); }).catch(() => {});
    api.getClients().then((value) => { if (live) setClients(value.clients); }).catch(() => { if (live) setClients(null); });
    api.listClaudeAccounts().then((value) => { if (live) setClaudeAccounts(value); }).catch(() => {});
    return () => { live = false; };
  }, [isAdmin]);

  const initialLead = team?.team?.lead_agent_id === agent.id;
  const isLead = roleChoice ?? initialLead;
  const leadDirty = roleChoice !== null && roleChoice !== initialLead;
  const members = (team?.agents ?? []).map((member) => member.id);
  const memberChanges = teamChanges(memberChoices, members, agent.id);
  const membersDirty = isLead && (memberChanges.add.length > 0 || memberChanges.remove.length > 0);
  const roleSupported = (engines ?? []).some((engine) => engine.id === draft.provider && engine.capabilities.mcp);

  const savedClients = clientIdsOf(clients, agent.id);
  const chosenClients = clientChoice ?? savedClients;
  const clientsDirty = clientChoice !== null && !sameIds(clientChoice, savedClients);

  const change = changedInput(draft, original, isAdmin);
  const fieldsDirty = Object.keys(change).length > 0;
  const dirty = fieldsDirty || leadDirty || membersDirty || clientsDirty;
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  const instructionBytes = utf8Bytes(draft.instructions.trim());
  const instructionsOver = instructionBytes > INSTRUCTIONS_MAX_BYTES;
  const nameMissing = draft.name.trim() === "";
  const canSave = dirty && !nameMissing && !instructionsOver && !saving;

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }));

  const discard = () => {
    setDraft(original);
    setRoleChoice(null);
    setMemberChoices({});
    setClientChoice(null);
    setError(null);
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
        onSaved(saved);
      }
      if (isAdmin && (leadDirty || membersDirty)) {
        let state = await collaboration.team();
        if (isLead) {
          const { add, remove } = teamChanges(memberChoices, state.agents.map((member) => member.id), agent.id);
          for (const id of add) await collaboration.addMember(id);
          for (const id of remove) await collaboration.removeMember(id);
          state = await collaboration.team();
        }
        setTeam(state);
        setRoleChoice(null);
        setMemberChoices({});
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
  const modeInfo = modes.find((mode) => mode.value === draft.approval_mode);
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
            approval_mode: approvalModesForProvider(provider).some((mode) => mode.value === current.approval_mode) ? current.approval_mode : "ask",
          }))}
        />
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
        {fallbackOn && (
          <Field label={t("agentSettings.profile.fallbackModel")}>
            {(props) => (
              <Input
                {...props}
                value={draft.fallback_model ?? ""}
                maxLength={200}
                placeholder={t("agentSettings.profile.engineDefault")}
                onChange={(e) => set("fallback_model", e.target.value || null)}
              />
            )}
          </Field>
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
          options={modes.map((mode) => ({ value: mode.value, label: mode.label }))}
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
              disabled={saving || team === null || (!roleSupported && !isLead)}
              onChange={(next) => setRoleChoice(next)}
              label={t("agentTeam.leadRole")}
              className="mt-0.5"
            />
          </div>
          {team === null && <p className="text-small text-warning">{t("agentTeam.teamPermissionsRetry")}</p>}
          {!roleSupported && <p className="text-small text-warning">{t("agentTeam.teamEngineChoice")}</p>}
          {team?.enabled === false && <p className="text-small text-warning">{t("agentTeam.teamsDisabled")}</p>}
          {isLead && team !== null && (
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
