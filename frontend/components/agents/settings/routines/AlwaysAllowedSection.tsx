"use client";

// "Always allowed for {name}": the saved always-allow rules that apply to this agent. The backend
// picks them (GET /approval-rules?agent_id=): rules tied to a folder its conversations work in, and
// rules with no folder, which apply to every agent. Remove asks first and says who else it affects.
// Adding rules stays in Settings → Approvals (the approval card now offers allows for one
// conversation instead, which are not listed here).
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { api, type Agent, type ApprovalRule } from "@/lib/api";
import { APPROVALS_SETTINGS_HREF, sortRules } from "@/lib/agent-automation";
import { useT } from "@/lib/use-i18n";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonList } from "@/components/ui/Skeleton";
import { Card } from "@/components/ui/Surface";
import { LoadFailed, SectionHeader, useErrorText } from "./shared";

export function AlwaysAllowedSection({ agent }: { agent: Agent }) {
  const t = useT();
  const headingId = useId();
  const errorText = useErrorText();
  const [rules, setRules] = useState<ApprovalRule[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  // The rule the dialog asks about stays set while the dialog closes, so its text does not change.
  const [removing, setRemoving] = useState<ApprovalRule | null>(null);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let live = true;
    api.listAgentApprovalRules(agent.id)
      .then((list) => { if (live) { setRules(sortRules(list)); setLoadError(null); } })
      .catch((err: unknown) => { if (live) setLoadError(errorText(err)); });
    return () => { live = false; };
  }, [agent.id, tick, errorText]);

  const remove = async () => {
    const rule = removing;
    if (!rule) return;
    setBusy(true);
    setActionError(null);
    try {
      await api.deleteApprovalRule(rule.id);
      setRules((current) => current?.filter((item) => item.id !== rule.id) ?? current);
    } catch (err) {
      setActionError(errorText(err));
    } finally {
      setAsking(false);
      setBusy(false);
      setTick((n) => n + 1);
    }
  };

  // A prefix rule covers every command that starts with its words: the dialog says so.
  const named = (rule: ApprovalRule | null) => (rule ? (rule.match === "prefix" ? `${rule.command} …` : rule.command) : "");

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <SectionHeader
        id={headingId}
        title={t("agentAutomation.allowed.title", { name: agent.name })}
        subtitle={t("agentAutomation.allowed.subtitle", { name: agent.name })}
      />
      {actionError && <Banner tone="danger" onDismiss={() => setActionError(null)}>{actionError}</Banner>}
      {loadError && <LoadFailed message={loadError} onRetry={() => { setLoadError(null); setTick((n) => n + 1); }} />}
      {rules === null ? (
        !loadError && <SkeletonList rows={2} />
      ) : rules.length === 0 ? (
        <Card className="p-0">
          <EmptyState
            icon={<ShieldCheck size={22} />}
            title={t("agentAutomation.allowed.emptyTitle", { name: agent.name })}
            description={t("agentAutomation.allowed.emptyBody")}
          />
        </Card>
      ) : (
        <Card className="p-0">
          <ul className="divide-y divide-line">
            {rules.map((rule) => (
              <li key={rule.id} className="flex items-start gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="break-all font-mono text-label text-ink">{rule.command}</p>
                  <p className="mt-0.5 break-all text-small text-muted">
                    {rule.match === "prefix" ? t("agentAutomation.allowed.startsWith") : t("agentAutomation.allowed.exactly")}
                    {" · "}
                    {rule.workspace ? t("agentAutomation.allowed.inFolder", { folder: rule.workspace }) : t("agentAutomation.allowed.everyFolder")}
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => { setRemoving(rule); setAsking(true); }}
                  disabled={busy}
                  aria-label={t("agentAutomation.allowed.removeLabel", { command: rule.command })}
                >
                  {t("agentAutomation.allowed.remove")}
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <p className="text-small text-muted">
        <Link href={APPROVALS_SETTINGS_HREF} className="text-accent-text underline-offset-2 hover:underline">
          {t("agentAutomation.allowed.allRules")}
        </Link>
      </p>

      <ConfirmDialog
        open={asking && removing !== null}
        onOpenChange={(open) => { if (!open) setAsking(false); }}
        title={t("agentAutomation.allowed.confirmTitle")}
        description={
          removing?.workspace
            ? t("agentAutomation.allowed.confirmFolder", { name: agent.name, command: named(removing), folder: removing.workspace })
            : t("agentAutomation.allowed.confirmEverywhere", { name: agent.name, command: named(removing) })
        }
        confirmLabel={t("agentAutomation.allowed.remove")}
        cancelLabel={t("common.cancel")}
        danger
        loading={busy}
        onConfirm={() => void remove()}
      />
    </section>
  );
}
