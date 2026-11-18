"use client";

import { useEffect, useState } from "react";
import { api, ApiError, isLaunchTokenMissing, type ApplicationSetting, type DesktopSettings } from "@/lib/api";
import { useT } from "@/lib/use-i18n";
import { useAppShell } from "@/components/shell/AppShell";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
import { SkeletonList } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { SettingsCard } from "./SettingsCard";
import { Applies } from "./Applies";
import { SaveBar } from "./SaveBar";
import { SavedConfirmation, useSavedConfirmation } from "./SavedConfirmation";
import { EnginesCard } from "./workspace/EnginesCard";

declare global {
  interface Window {
    suparagent?: {
      desktopPermissions?(action: "status" | "accessibility" | "screen_recording"): Promise<{ supported: boolean; accessibility: boolean; screen_recording: boolean }>;
      choosePath(kind: "file" | "folder"): Promise<string | null>;
      openEngineSignIn?(url: string): Promise<void>;
      openGoogleSignIn(url: string): Promise<void>;
      openComposioLink(url: string): Promise<void>;
      nativeControl(request: import("@/components/chat/NativeComputer").NativeRequest): Promise<import("@/components/chat/NativeComputer").NativeStatus | { held: boolean }>;
      updates?: import("@/components/AppUpdates").UpdatesBridge;
      copyText?(text: string): Promise<boolean>;
    };
  }
}

// The desktop app's own Claude Code settings (GET and PUT /settings, admin only); a server install
// answers 404 and keeps these in its environment. Labels and help are message keys (enginesPage.local.*).
const fields: Record<string, { key: string; type: "file" | "folder" | "checkbox" | "number"; min?: number; max?: number }> = {
  LOCAL_CLAUDE_CLI_PATH: { key: "cliPath", type: "file" },
  LOCAL_WORKSPACE_ROOT: { key: "workspaceRoot", type: "folder" },
  LOCAL_TOOLS_ENABLED: { key: "tools", type: "checkbox" },
  LOCAL_TASK_TIMEOUT_SECONDS: { key: "answerTimeout", type: "number", min: 0, max: 3600 },
  LOCAL_APPROVAL_TIMEOUT_SECONDS: { key: "approvalTimeout", type: "number", min: 30, max: 3600 },
  LOCAL_MAX_OUTPUT_BYTES: { key: "outputLimit", type: "number", min: 1024, max: 16000000 },
};

const settingAnchors: Record<string, string> = {
  LOCAL_CLAUDE_CLI_PATH: "setting-engine-claude-executable",
  LOCAL_WORKSPACE_ROOT: "setting-engine-workspace-root",
  LOCAL_TOOLS_ENABLED: "setting-engine-local-tools",
  LOCAL_TASK_TIMEOUT_SECONDS: "setting-engine-answer-timeout",
  LOCAL_APPROVAL_TIMEOUT_SECONDS: "setting-engine-approval-timeout",
  LOCAL_MAX_OUTPUT_BYTES: "setting-engine-output-limit",
};

type When = "new conversations" | "new approvals" | "next turn" | "after restart" | "now";
const WHEN_KEY: Record<When, string> = {
  "new conversations": "settingsPage.applies.newConversations",
  "new approvals": "settingsPage.applies.newApprovals",
  "next turn": "settingsPage.applies.nextTurn",
  "after restart": "settingsPage.applies.restart",
  now: "settingsPage.applies.now",
};
const applies = (row: ApplicationSetting): When => row.key === "LOCAL_WORKSPACE_ROOT" ? "new conversations" : row.key === "LOCAL_APPROVAL_TIMEOUT_SECONDS" ? "new approvals" : row.applies === "next_run" ? "next turn" : row.applies === "restart" ? "after restart" : "now";

export function EnginesSettings() {
  const t = useT();
  const [data, setData] = useState<DesktopSettings | null>(null);
  const [drafts, setDrafts] = useState<Record<string, unknown>>({});
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const toast = useToast();
  const confirmation = useSavedConfirmation();
  const [loadTick, setLoadTick] = useState(0);
  const [checking, setChecking] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [headless, setHeadless] = useState(false);
  // GET /settings is an admin's. Anyone else (a member, a chat-only device) is not asked for it and sees
  // nothing of it, as when the server refuses it (403): there is nothing they could change or retry.
  const { isAdmin } = useAppShell();
  const [refused, setRefused] = useState(false);
  const local = isAdmin && !refused;

  const label = (key: string) => t(`enginesPage.local.${fields[key].key}`);
  const display = (value: unknown) => value === null || value === undefined ? t("enginesPage.local.unavailable") : value === "" ? t("enginesPage.local.automatic") : typeof value === "string" ? value : JSON.stringify(value);
  const appliesText = (row: ApplicationSetting) => t(WHEN_KEY[applies(row)]);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    api.getDesktopSettings().then((value) => {
      if (cancelled) return;
      setData(value);
      setHeadless(false);
      setRefused(false);
      setDrafts(Object.fromEntries(value.settings.map((row) => [row.key, row.value])));
      setError(null);
    }).catch((err: unknown) => {
      if (cancelled) return;
      if (err instanceof ApiError && err.status === 404) { setHeadless(true); setError(null); }
      else if (err instanceof ApiError && err.status === 403) { setRefused(true); setError(null); }
      else setError(isLaunchTokenMissing(err) ? t("enginesPage.local.openInApp") : err instanceof ApiError ? err.message : t("enginesPage.local.unreachable"));
    });
    return () => { cancelled = true; };
  }, [isAdmin, loadTick, t]);

  const updateSavedRow = (row: ApplicationSetting, saved: ApplicationSetting) => {
    setData((previous) => previous && ({ ...previous, settings: previous.settings.map((item) => item.key === row.key ? saved : item) }));
    setDrafts((previous) => ({ ...previous, [row.key]: saved.value }));
  };

  const save = async (row: ApplicationSetting) => {
    setBusy(row.key); setError(null);
    setRowErrors((previous) => ({ ...previous, [row.key]: "" }));
    try {
      const saved = await api.saveDesktopSetting(row.key, drafts[row.key], row.version);
      updateSavedRow(row, saved);
      confirmation.showSaved(row.key);
      toast(t("enginesPage.local.savedLong", { name: label(row.key), when: appliesText(saved) }));
      if (row.key === "LOCAL_CLAUDE_CLI_PATH") setStatus(null);
    } catch (err) { setRowErrors((previous) => ({ ...previous, [row.key]: err instanceof ApiError ? err.message : t("enginesPage.local.saveFailed") })); }
    finally { setBusy(null); }
  };

  const saveInstant = async (row: ApplicationSetting, value: boolean) => {
    setBusy(row.key); setRowErrors((previous) => ({ ...previous, [row.key]: "" }));
    setDrafts((previous) => ({ ...previous, [row.key]: value }));
    confirmation.clearSaved(row.key);
    try {
      const saved = await api.saveDesktopSetting(row.key, value, row.version);
      updateSavedRow(row, saved);
      confirmation.showSaved(row.key);
      toast(t("enginesPage.local.saved", { name: label(row.key), when: appliesText(saved) }));
    } catch (err) {
      setDrafts((previous) => ({ ...previous, [row.key]: row.value }));
      setRowErrors((previous) => ({ ...previous, [row.key]: err instanceof ApiError ? err.message : t("enginesPage.local.changeFailed") }));
    } finally { setBusy(null); }
  };

  const browse = async (row: ApplicationSetting) => {
    setBusy(row.key); setError(null);
    try {
      if (!window.suparagent) throw new Error(t("enginesPage.local.browseDesktop"));
      const selected = await window.suparagent.choosePath(fields[row.key].type === "file" ? "file" : "folder");
      if (selected !== null) {
        setDrafts((previous) => ({ ...previous, [row.key]: selected }));
        setRowErrors((previous) => ({ ...previous, [row.key]: "" }));
        confirmation.clearSaved(row.key);
      }
    } catch (err) { setError(err instanceof Error ? err.message : t("enginesPage.local.pickerFailed")); }
    finally { setBusy(null); }
  };

  const check = async () => {
    setChecking(true);
    try {
      const result = await api.testDesktopClaude();
      setStatus(result.available ? (result.version ? t("enginesPage.local.readyVersion", { version: result.version }) : t("enginesPage.local.ready")) : result.error || t("enginesPage.local.notReady"));
    } catch { setStatus(t("enginesPage.local.checkFailed")); }
    finally { setChecking(false); }
  };

  return <div className="flex flex-col gap-5" data-setting-root>
      <div className="sr-only" aria-label={t("enginesPage.local.anchors")}>
        <span id="setting-engine-claude-executable" />
        <span id="setting-engine-workspace-root" />
        <span id="setting-engine-local-tools" />
        <span id="setting-engine-answer-timeout" />
        <span id="setting-engine-approval-timeout" />
        <span id="setting-engine-output-limit" />
      </div>
      <div className="flex flex-col gap-5" data-setting-root data-setting-container data-setting-id="setting-engine-connections" tabIndex={-1}>
        <div className="sr-only" aria-label={t("enginesPage.connectionAnchors")}>
          <span id="setting-engine-connections" />
          <span id="setting-engine-api-key" />
          <span id="setting-engine-endpoint" />
        </div>
        <EnginesCard />
      </div>
      {local && error && <Banner tone="danger" action={!headless ? <Button size="sm" onClick={() => setLoadTick((n) => n + 1)}>{t("enginesPage.retry")}</Button> : undefined}>{error}</Banner>}
      {local && headless && <p className="text-small text-muted">{t("enginesPage.local.headless")}</p>}
      {local && !data && !error && !headless && <SkeletonList rows={4} />}
      {local && data && <>
        <SettingsCard
          title={t("enginesPage.local.title")}
          description={t("enginesPage.local.description")}
          action={<Button disabled={busy !== null} onClick={() => setLoadTick((n) => n + 1)}>{t("enginesPage.local.reload")}</Button>}
        >
          {data.settings.map((row) => {
            const field = fields[row.key];
            if (!field) return null;
            const value = drafts[row.key];
            const dirty = JSON.stringify(value) !== JSON.stringify(row.value);
            const formId = `local-setting-${row.key}`;
            return <form key={row.key} id={formId} data-setting-id={settingAnchors[row.key]} onSubmit={(event) => { event.preventDefault(); void save(row); }} className="flex flex-col gap-2 border-b border-line pb-4 last:border-0 last:pb-0">
              <label htmlFor={row.key} className="block text-body font-medium text-ink">{label(row.key)}</label>
              <div className="flex items-center gap-2">
                {field.type === "checkbox" ? <Checkbox id={row.key} data-setting-focus={settingAnchors[row.key]} label={t("enginesPage.local.on")} disabled={busy !== null} checked={value === true} onChange={(event) => void saveInstant(row, event.target.checked)} /> : <Input id={row.key} data-setting-focus={settingAnchors[row.key]} disabled={busy !== null} type={field.type === "number" ? "number" : "text"} min={field.min} max={field.max} step={1} required={field.type === "number"} value={field.type === "number" ? typeof value === "number" ? value : "" : typeof value === "string" ? value : ""} onChange={(event) => { setDrafts((previous) => ({ ...previous, [row.key]: field.type === "number" ? event.target.value === "" ? null : Number(event.target.value) : event.target.value })); setRowErrors((previous) => ({ ...previous, [row.key]: "" })); confirmation.clearSaved(row.key); }} autoComplete="off" spellCheck={false} />}
                {(field.type === "file" || field.type === "folder") && <Button aria-label={t("enginesPage.local.browseFor", { name: label(row.key) })} disabled={busy !== null} onClick={() => browse(row)}>{t("enginesPage.local.browse")}</Button>}
              </div>
              <p className="text-small text-muted">{t(`enginesPage.local.${field.key}Help`)}{field.type === "number" ? ` ${t("enginesPage.local.range", { min: field.min ?? 0, max: field.max ?? 0 })}` : ""}</p>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted"><span className="rounded bg-inset px-2 py-1">{t("enginesPage.local.source", { source: row.source })}</span><Applies when={applies(row)} /></div>
              <p className="break-all text-small text-muted">{t("enginesPage.local.effective", { value: display(row.effective_value), fallback: display(row.default) })}</p>
              {row.resolved_path && <p className="break-all font-mono text-small text-muted">{t("enginesPage.local.folder", { path: row.resolved_path })}</p>}
              {row.error && <p role="alert" className="text-small text-danger">{t("enginesPage.local.rowError", { error: row.error, value: display(row.value) })}</p>}
              {field.type === "checkbox" ? <>
                <SavedConfirmation visible={confirmation.saved.has(row.key)} />
                {rowErrors[row.key] && <p role="alert" className="text-small text-danger">{rowErrors[row.key]}</p>}
              </> : <>
                <SaveBar dirty={dirty} saving={busy === row.key} error={rowErrors[row.key] || null} saved={confirmation.saved.has(row.key)} onSave={() => {
                  const form = document.getElementById(formId);
                  if (form instanceof HTMLFormElement) form.requestSubmit();
                }} onDiscard={() => { setDrafts((previous) => ({ ...previous, [row.key]: row.value })); setRowErrors((previous) => ({ ...previous, [row.key]: "" })); confirmation.clearSaved(row.key); }} />
              </>}
            </form>;
          })}
          <div className="flex flex-col items-start gap-2">
            <Button loading={checking} disabled={busy !== null} onClick={check}>{checking ? t("enginesPage.checking") : t("enginesPage.local.check")}</Button>
            {status && <p role="status" className="text-body text-ink">{status}</p>}
            <p className="text-small text-muted">{t("enginesPage.local.checkHelp")} <code className="font-mono">claude auth login</code></p>
          </div>
        </SettingsCard>
        <div id="setting-engine-storage" data-setting-id="setting-engine-storage" data-setting-container tabIndex={-1}>
          <SettingsCard title={t("enginesPage.local.storage")} description={t("enginesPage.local.storageHelp")}>
            <dl className="flex flex-col gap-3 text-body">
              {Object.entries(data.storage).map(([name, value]) => <div key={name}><dt className="font-medium capitalize text-ink">{name.replaceAll("_", " ")}</dt><dd className="mt-1 break-all text-small text-muted">{value}</dd></div>)}
            </dl>
          </SettingsCard>
        </div>
      </>}
    </div>;
}
