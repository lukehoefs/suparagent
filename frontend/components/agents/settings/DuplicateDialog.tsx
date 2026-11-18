"use client";

// Duplicate… in the agent settings More menu (anyone who may manage agents, like POST
// /agents/{id}/duplicate): says what the copy gets and what it does not (services/agent_store.py
// duplicate_agent), makes it, then the page moves to the copy's settings.
import { useState } from "react";
import { api, ApiError, type Agent } from "@/lib/api";
import { useT } from "@/lib/use-i18n";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";

export function DuplicateDialog({
  agent,
  isAdmin,
  blocked,
  onClose,
  onDuplicated,
}: {
  agent: Agent;
  // Without admin the server gives the copy its own folder and turns "Accept edits" into "Ask first".
  isAdmin: boolean;
  // Unsaved changes on the page: the copy is made from the saved agent and opening it leaves the page.
  blocked: boolean;
  onClose: () => void;
  onDuplicated: (copy: Agent) => void;
}) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const duplicate = async () => {
    if (blocked) return;
    setBusy(true);
    setError(null);
    try {
      onDuplicated(await api.duplicateAgent(agent.id));
    } catch (err) {
      if (err instanceof ApiError && err.code === "agent_name_taken") setError(t("agentProfile.duplicate.nameTaken"));
      else setError(err instanceof Error ? err.message : t("agentSettings.actionFailed"));
      setBusy(false);
    }
  };

  const folder = isAdmin && agent.workspace_path?.trim()
    ? t("agentProfile.duplicate.sameFolder", { path: agent.workspace_path.trim() })
    : t("agentProfile.duplicate.ownFolder");

  return (
    <Dialog
      open
      onOpenChange={(open) => { if (!open && !busy) onClose(); }}
      title={t("agentProfile.duplicate.title", { name: agent.name })}
      description={t("agentProfile.duplicate.body", { name: agent.name })}
      size="sm"
      footer={
        <>
          <Button disabled={busy} onClick={onClose}>{t("common.cancel")}</Button>
          <Button variant="primary" loading={busy} disabled={blocked} onClick={() => void duplicate()}>{t("agentProfile.duplicate.confirm")}</Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-small text-ink">
        {blocked && <Banner tone="warning">{t("agentProfile.duplicate.unsaved")}</Banner>}
        <p>{t("agentProfile.duplicate.copied")}</p>
        <p>
          {folder}
          {!isAdmin && agent.approval_mode === "accept_edits" && <> {t("agentProfile.duplicate.askFirst")}</>}
          {!isAdmin && agent.approval_mode === "full_access" && <> {t("agentProfile.duplicate.askFirstFull")}</>}
        </p>
        <p className="text-muted">{t("agentProfile.duplicate.notCopied")}</p>
        {error && <p role="alert" className="text-danger">{error}</p>}
      </div>
    </Dialog>
  );
}
