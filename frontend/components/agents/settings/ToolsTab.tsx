"use client";

// The Tools tab: tool grants from switched-on MCP servers (each server saves on its own), then the
// connected apps (Composio) the agent may use, saved together with one button.
import { useEffect, useId, useState } from "react";
import { api, type Agent } from "@/lib/api";
import { accountScopesToSend, scopesToSend, supportsConnectedApps, type AccountScopes, type ComposioAccount, type Scopes } from "@/lib/connected-apps";
import { useT } from "@/lib/use-i18n";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { AgentToolsSection } from "@/components/chat/agents/AgentToolsSection";
import { ConnectedAppsSection } from "@/components/chat/agents/ConnectedAppsSection";
import { draftSignature } from "@/components/chat/agents/draft-state";

type Access = { connector_scopes: Scopes; connector_account_scopes: AccountScopes };

const accessOf = (agent: Agent): Access => ({
  connector_scopes: agent.connector_scopes ?? {},
  connector_account_scopes: agent.connector_account_scopes ?? {},
});

export function ToolsTab({
  agent,
  isAdmin,
  onAgentSaved,
  onDirtyChange,
}: {
  agent: Agent;
  // Connected-app access is the owner's to change (a restricted device gets 403).
  isAdmin: boolean;
  onAgentSaved: (agent: Agent) => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const t = useT();
  const headingId = useId();
  const [toolsDirty, setToolsDirty] = useState(false);
  const [appsDirty, setAppsDirty] = useState(false);
  const dirty = toolsDirty || appsDirty;
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  const showApps = isAdmin && supportsConnectedApps(agent.provider);

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby={headingId} className="flex flex-col gap-4">
        <div className="min-w-0">
          <h2 id={headingId} className="text-h3 font-semibold text-ink">{t("agentSettings.tools.title")}</h2>
          <p className="mt-0.5 text-small text-muted">{t("agentSettings.tools.subtitle", { name: agent.name })}</p>
        </div>
        <AgentToolsSection agentId={agent.id} agentName={agent.name} provider={agent.provider} onDirtyChange={setToolsDirty} />
      </section>
      {showApps && (
        <ConnectedApps key={`${agent.id}-${agent.provider}`} agent={agent} onAgentSaved={onAgentSaved} onDirtyChange={setAppsDirty} />
      )}
    </div>
  );
}

function ConnectedApps({
  agent,
  onAgentSaved,
  onDirtyChange,
}: {
  agent: Agent;
  onAgentSaved: (agent: Agent) => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const t = useT();
  const headingId = useId();
  // The accounts connected on the Apps page; empty when none, or when Composio is not set up.
  const [appAccounts, setAppAccounts] = useState<ComposioAccount[] | null>(null);
  const [original, setOriginal] = useState<Access>(() => accessOf(agent));
  const [access, setAccess] = useState<Access>(() => accessOf(agent));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  useEffect(() => {
    let live = true;
    api.getComposioStatus()
      .then((status) => (status.configured ? api.listComposioAccounts() : []))
      .then((accounts) => { if (live) setAppAccounts(accounts); })
      .catch(() => { if (live) setAppAccounts([]); });
    return () => { live = false; };
  }, []);

  const dirty = draftSignature(access) !== draftSignature(original);
  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const saved = await api.updateAgent(agent.id, {
        connector_scopes: scopesToSend(access.connector_scopes, agent.provider),
        connector_account_scopes: accountScopesToSend(access.connector_account_scopes, access.connector_scopes, agent.provider),
      });
      const next = accessOf(saved);
      setOriginal(next);
      setAccess(next);
      setSavedAt(new Date());
      onAgentSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("agentSettings.actionFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 id={headingId} className="text-h3 font-semibold text-ink">{t("agentSettings.apps.title")}</h2>
          <p className="mt-0.5 text-small text-muted">{t("agentSettings.apps.subtitle", { name: agent.name })}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {savedAt && !dirty && (
            <span role="status" className="text-small text-muted">
              {t("agentSettings.savedAt", { time: savedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) })}
            </span>
          )}
          {dirty && <Button onClick={() => setAccess(original)} disabled={busy}>{t("agentSettings.discard")}</Button>}
          <Button variant="primary" onClick={() => void save()} disabled={!dirty} loading={busy}>
            {t("agentSettings.apps.save")}
          </Button>
        </div>
      </div>
      {error && <Banner tone="danger">{error}</Banner>}
      <ConnectedAppsSection
        appAccounts={appAccounts}
        connectorScopes={access.connector_scopes}
        connectorAccountScopes={access.connector_account_scopes}
        busy={busy}
        onScopesChange={(connector_scopes) => setAccess((current) => ({ ...current, connector_scopes }))}
        onAccountScopesChange={(connector_account_scopes) => setAccess((current) => ({ ...current, connector_account_scopes }))}
      />
    </section>
  );
}
