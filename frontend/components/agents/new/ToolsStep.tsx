"use client";

import type { Ref } from "react";
import { ConnectedAppsSection } from "@/components/chat/agents/ConnectedAppsSection";
import { Button } from "@/components/ui/Button";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Card } from "@/components/ui/Surface";
import type { ApprovalMode } from "@/lib/api";
import { supportsConnectedApps, type AccountScopes, type ComposioAccount, type Scopes } from "@/lib/connected-apps";
import { approvalChoices, supportsToolGrants } from "@/lib/new-agent";
import { useT } from "@/lib/use-i18n";
import { ToolPicker } from "./ToolPicker";
import type { ToolServer } from "./useNewAgentData";
import { approvalModeText } from "./labels";

// Step 2: how it asks before acting, and what it may use. Apps and MCP tools are owner-only endpoints,
// so other devices see the approvals only. Picks are held until the agent exists.
export function ToolsStep({
  admin,
  provider,
  approvalMode,
  onApprovalMode,
  scopes,
  accountScopes,
  onScopes,
  onAccountScopes,
  appAccounts,
  toolServers,
  toolsError,
  onRetryTools,
  picks,
  onPicks,
  onBack,
  onContinue,
  headingRef,
}: {
  admin: boolean;
  provider: string;
  approvalMode: ApprovalMode;
  onApprovalMode: (mode: ApprovalMode) => void;
  scopes: Scopes;
  accountScopes: AccountScopes;
  onScopes: (scopes: Scopes) => void;
  onAccountScopes: (scopes: AccountScopes) => void;
  appAccounts: ComposioAccount[] | null;
  toolServers: ToolServer[] | null;
  toolsError: string | null;
  onRetryTools: () => void;
  picks: Record<string, string[]>;
  onPicks: (next: Record<string, string[]>) => void;
  onBack: () => void;
  onContinue: () => void;
  headingRef: Ref<HTMLHeadingElement>;
}) {
  const t = useT();
  const modes = approvalChoices(provider, admin);
  return (
    <Card className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h2 ref={headingRef} tabIndex={-1} className="text-h2 font-semibold tracking-[-0.01em] outline-none">{t("newAgent.toolsTitle")}</h2>
        <p className="text-body text-muted">{t("newAgent.toolsIntro")}</p>
      </div>

      <section aria-labelledby="new-agent-approvals" className="flex flex-col gap-2">
        <h3 id="new-agent-approvals" className="text-h3 font-semibold">{t("newAgent.approvals")}</h3>
        <SegmentedControl
          label={t("newAgent.approvals")}
          value={approvalMode}
          onChange={onApprovalMode}
          options={modes.map((mode) => ({ value: mode, label: approvalModeText(t, mode).label }))}
          className="max-w-full flex-wrap self-start"
        />
        <p className="text-small text-muted" aria-live="polite">{approvalModeText(t, approvalMode).description}</p>
      </section>

      {admin ? (
        <>
          <section aria-labelledby="new-agent-apps" className="flex flex-col gap-2">
            <h3 id="new-agent-apps" className="text-h3 font-semibold">{t("newAgent.appsTitle")}</h3>
            {supportsConnectedApps(provider) ? (
              <ConnectedAppsSection
                appAccounts={appAccounts}
                connectorScopes={scopes}
                connectorAccountScopes={accountScopes}
                busy={false}
                onScopesChange={onScopes}
                onAccountScopesChange={onAccountScopes}
              />
            ) : (
              <p className="text-small text-muted">{t("newAgent.appsEngine")}</p>
            )}
          </section>

          <section aria-labelledby="new-agent-mcp" className="flex flex-col gap-2">
            <h3 id="new-agent-mcp" className="text-h3 font-semibold">{t("newAgent.mcpTitle")}</h3>
            {supportsToolGrants(provider) ? (
              <>
                <p className="text-small text-muted">{t("newAgent.mcpIntro")}</p>
                <ToolPicker servers={toolServers} error={toolsError} onRetry={onRetryTools} picks={picks} onPicks={onPicks} />
              </>
            ) : (
              <p className="text-small text-muted">{t("newAgent.mcpEngine")}</p>
            )}
          </section>
        </>
      ) : (
        <p className="text-small text-muted">{t("newAgent.toolsOwnerOnly")}</p>
      )}

      <div className="flex flex-wrap justify-between gap-2 pt-2">
        <Button onClick={onBack}>{t("newAgent.back")}</Button>
        <Button variant="primary" onClick={onContinue}>{t("newAgent.continue")}</Button>
      </div>
    </Card>
  );
}
