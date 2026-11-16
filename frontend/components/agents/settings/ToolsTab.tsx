"use client";

// The Tools tab: tool grants from the owner's MCP servers and from installed plugins (each server or
// plugin saves on its own), then the connected apps (Composio) the agent may use, saved together with
// one button. Admin only (lib/agent-settings.ts MEMBER_TABS).
import { useCallback, useEffect, useId, useState } from "react";
import { api, type Agent } from "@/lib/api";
import type { OfferedTool } from "@/lib/agent-tools";
import { accountScopesToSend, scopesToSend, supportsConnectedApps, type AccountScopes, type ComposioAccount, type Scopes } from "@/lib/connected-apps";
import { supportsToolGrants } from "@/lib/new-agent";
import { pluralForm } from "@/lib/blueprint-browse";
import { resolveLocale } from "@/lib/i18n";
import { useLanguageChoice, useT } from "@/lib/use-i18n";
import { Badge } from "@/components/ui/Badge";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { LinkButton } from "@/components/ui/LinkButton";
import { AgentToolsSection } from "@/components/chat/agents/AgentToolsSection";
import { ConnectedAppsSection } from "@/components/chat/agents/ConnectedAppsSection";
import { draftSignature } from "@/components/chat/agents/draft-state";
import { PluginsSection } from "./PluginsSection";

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
  const locale = resolveLocale(useLanguageChoice());
  const headingId = useId();
  const serversId = useId();
  const pluginsId = useId();
  const [toolsDirty, setToolsDirty] = useState(false);
  const [pluginsDirty, setPluginsDirty] = useState(false);
  const [appsDirty, setAppsDirty] = useState(false);
  const dirty = toolsDirty || pluginsDirty || appsDirty;
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  // Saved grants, the same count as the roster card: switched-on servers plus every plugin.
  const [serverCount, setServerCount] = useState<number | null>(null);
  const [pluginCount, setPluginCount] = useState<number | null>(null);
  const total = serverCount !== null && pluginCount !== null ? serverCount + pluginCount : null;
  // Ticked plugin tools count toward the 25 an agent is given one by one (see AgentToolsSection).
  const [pluginOffered, setPluginOffered] = useState<OfferedTool[]>([]);
  const onPluginOffered = useCallback((tools: OfferedTool[]) => setPluginOffered(tools), []);

  const showApps = isAdmin && supportsConnectedApps(agent.provider);

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby={headingId} className="flex flex-col gap-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id={headingId} className="text-h3 font-semibold text-ink">{t("agentSettings.tools.title")}</h2>
            <p className="mt-0.5 text-small text-muted">{t("agentSettings.tools.subtitle", { name: agent.name })}</p>
          </div>
          {total !== null ? <Badge>{t(`agentTools.granted.${pluralForm(locale, total)}`, { n: total })}</Badge> : null}
        </div>
        {!supportsToolGrants(agent.provider) ? (
          <Banner tone="warning">{t("agentTools.engine", { name: agent.name })}</Banner>
        ) : null}

        <section aria-labelledby={serversId} className="flex flex-col gap-3">
          <div className="min-w-0">
            <h3 id={serversId} className="text-label font-semibold text-ink">{t("agentTools.servers.title")}</h3>
            <p className="mt-0.5 text-small text-muted">{t("agentTools.servers.intro", { name: agent.name })}</p>
          </div>
          <AgentToolsSection
            key={agent.id}
            agentId={agent.id}
            agentName={agent.name}
            provider={agent.provider}
            onDirtyChange={setToolsDirty}
            onGrantedChange={setServerCount}
            otherOffered={pluginOffered}
            engineNote={false}
          />
        </section>

        <section aria-labelledby={pluginsId} className="flex flex-col gap-3">
          <div className="min-w-0">
            <h3 id={pluginsId} className="text-label font-semibold text-ink">{t("agentTools.plugins.title")}</h3>
            <p className="mt-0.5 text-small text-muted">{t("agentTools.plugins.intro", { name: agent.name })}</p>
          </div>
          <PluginsSection
            key={agent.id}
            agentId={agent.id}
            agentName={agent.name}
            onDirtyChange={setPluginsDirty}
            onGrantedChange={setPluginCount}
            onOfferedChange={onPluginOffered}
          />
        </section>
      </section>
      {showApps ? (
        <ConnectedApps key={`${agent.id}-${agent.provider}`} agent={agent} onAgentSaved={onAgentSaved} onDirtyChange={setAppsDirty} />
      ) : isAdmin ? (
        <AppsUnavailable name={agent.name} />
      ) : null}
    </div>
  );
}

// An engine without connected apps: say so once instead of hiding the section.
function AppsUnavailable({ name }: { name: string }) {
  const t = useT();
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <h2 id={headingId} className="text-h3 font-semibold text-ink">{t("agentSettings.apps.title")}</h2>
      <p className="text-small text-muted">{t("agentTools.apps.engine", { name })}</p>
    </section>
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
  const [accountsError, setAccountsError] = useState<string | null>(null);
  const [accountsTick, setAccountsTick] = useState(0);
  const [original, setOriginal] = useState<Access>(() => accessOf(agent));
  const [access, setAccess] = useState<Access>(() => accessOf(agent));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  useEffect(() => {
    let live = true;
    api.getComposioStatus()
      .then((status) => (status.configured ? api.listComposioAccounts() : []))
      .then((accounts) => { if (live) { setAppAccounts(accounts); setAccountsError(null); } })
      .catch((err: unknown) => { if (live) setAccountsError(err instanceof Error ? err.message : ""); });
    return () => { live = false; };
  }, [accountsTick]);

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
          <LinkButton href="/apps/" variant="ghost">{t("agentTools.apps.connect")}</LinkButton>
          {dirty && <Button onClick={() => setAccess(original)} disabled={busy}>{t("agentSettings.discard")}</Button>}
          <Button variant="primary" onClick={() => void save()} disabled={!dirty} loading={busy}>
            {t("agentSettings.apps.save")}
          </Button>
        </div>
      </div>
      {error && <Banner tone="danger">{error}</Banner>}
      {accountsError !== null ? (
        <Banner
          tone="danger"
          title={t("agentTools.apps.loadFailed")}
          action={<Button size="sm" onClick={() => { setAccountsError(null); setAppAccounts(null); setAccountsTick((n) => n + 1); }}>{t("agentTools.retry")}</Button>}
        >
          {accountsError || null}
        </Banner>
      ) : (
        <ConnectedAppsSection
          appAccounts={appAccounts}
          connectorScopes={access.connector_scopes}
          connectorAccountScopes={access.connector_account_scopes}
          busy={busy}
          onScopesChange={(connector_scopes) => setAccess((current) => ({ ...current, connector_scopes }))}
          onAccountScopesChange={(connector_account_scopes) => setAccess((current) => ({ ...current, connector_account_scopes }))}
        />
      )}
    </section>
  );
}
