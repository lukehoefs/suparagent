"use client";

import { useId, useState, type FormEvent, type ReactNode } from "react";
import { ApiError } from "@/lib/api";
import { useT } from "@/lib/use-i18n";
import { WORKSPACE_NAME_MAX, workspaceNameSavable } from "@/lib/workspace-settings";
import { workspaceApi } from "@/lib/workspace-api";
import { useSession } from "@/components/AuthGate";
import { useAppShell, useLeaveGuard } from "@/components/shell/AppShell";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { SettingsCard } from "../SettingsCard";
import { SavedConfirmation, useSavedConfirmation } from "../SavedConfirmation";

// General (design: WorkspaceSettings.html, "General"): what the workspace is called and how people
// sign in. The name is the team's (GET and PATCH /team, owner and admin), the one the sidebar footer
// shows. The owner passphrase has no API (it is set on the server), so that row says how, with no button.
export function WorkspaceCard() {
  const t = useT();
  const formId = useId();
  const { session } = useSession();
  const { team, teamStatus, refreshTeam, openTeam, agents, isAdmin } = useAppShell();
  const teamName = team?.team?.name ?? null;
  // Right after a save, until the shell's team catches up, the saved name is the current one.
  const [renamed, setRenamed] = useState<{ from: string | null; to: string } | null>(null);
  const current = renamed && renamed.from === teamName ? renamed.to : teamName;
  // The draft starts as the saved name and follows it until someone types.
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirmation = useSavedConfirmation();
  const value = draft ?? current ?? "";
  const dirty = draft !== null && draft.trim() !== (current ?? "").trim();
  useLeaveGuard(dirty);

  // The owner passphrase is the self-hosted owner's sign-in; the desktop app and a hosted workspace
  // (signed in by the account service) have none.
  const showPassphrase = isAdmin && session !== null && session.kind !== "desktop" && session.kind !== "grant";
  const editable = isAdmin && teamStatus === "ready" && !!team?.team;

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!workspaceNameSavable(value, current)) return;
    const name = value.trim();
    setSaving(true);
    setError(null);
    try {
      await workspaceApi.rename(name);
      setRenamed({ from: teamName, to: name });
      setDraft(null);
      confirmation.showSaved("name");
      refreshTeam();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("workspaceGeneral.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  let name: ReactNode;
  if (teamStatus === "loading") {
    name = <Skeleton className="h-control w-full max-w-[360px]" />;
  } else if (teamStatus === "failed") {
    name = <Banner tone="danger">{t("workspaceGeneral.loadFailed")}</Banner>;
  } else if (!team?.team) {
    // The workspace is named after its team, and a team starts when someone chooses its lead.
    name = (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-[1_1_240px]">
          <p className="text-body font-medium text-ink">{t("workspaceGeneral.name")}</p>
          <p className="text-small text-muted">{isAdmin ? t("workspaceGeneral.noTeam") : t("workspaceGeneral.noTeamMember")}</p>
        </div>
        {isAdmin && <Button onClick={openTeam} disabled={agents === null}>{t("workspaceGeneral.openTeam")}</Button>}
      </div>
    );
  } else if (isAdmin) {
    name = (
      <form id={formId} onSubmit={save}>
        <label className="flex flex-col gap-1.5">
          <span className="text-small font-medium text-muted">{t("workspaceGeneral.name")}</span>
          <Input
            value={value}
            maxLength={WORKSPACE_NAME_MAX}
            required
            autoComplete="off"
            disabled={saving}
            onChange={(event) => { setDraft(event.target.value); setError(null); confirmation.clearSaved("name"); }}
            className="max-w-[360px]"
          />
        </label>
      </form>
    );
  } else {
    name = (
      <div>
        <p className="text-small font-medium text-muted">{t("workspaceGeneral.name")}</p>
        <p className="mt-1 text-body text-ink">{current}</p>
        <p className="mt-1 text-small text-muted">{t("workspaceGeneral.adminsRename")}</p>
      </div>
    );
  }

  return (
    <div id="setting-general-workspace" data-setting-id="setting-general-workspace" data-setting-container tabIndex={-1}>
      <SettingsCard title={t("workspaceGeneral.title")} description={t("workspaceGeneral.description")}>
        {name}
        {error && <Banner tone="danger">{error}</Banner>}
        {showPassphrase && (
          <div className="flex flex-col gap-1 border-t border-line pt-3.5">
            <p className="text-body font-medium text-ink">{t("workspaceGeneral.passphrase")}</p>
            <p className="text-small text-muted">
              {t("workspaceGeneral.passphraseHow")}{" "}
              <code className="break-all rounded-inner bg-code px-1 py-0.5 font-mono text-[12px] text-ink">python -m app.auth.cli set-passphrase</code>
            </p>
            <p className="text-small text-muted">{t("workspaceGeneral.passphraseEffect")}</p>
          </div>
        )}
        {editable && (
          <div className="flex flex-wrap items-center justify-end gap-3">
            <SavedConfirmation visible={confirmation.saved.has("name")} />
            {dirty && <Button variant="ghost" disabled={saving} onClick={() => { setDraft(null); setError(null); }}>{t("workspaceGeneral.discard")}</Button>}
            <Button type="submit" form={formId} variant="primary" loading={saving} disabled={!workspaceNameSavable(value, current)}>{t("workspaceGeneral.save")}</Button>
          </div>
        )}
      </SettingsCard>
    </div>
  );
}
