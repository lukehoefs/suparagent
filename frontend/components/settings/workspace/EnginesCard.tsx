"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { api, ApiError, type Engine, type EngineConfigField, type EnginePreference } from "@/lib/api";
import { writeCachedPreference } from "@/lib/engine-selection";
import { ENDPOINT_TEMPLATES, engineConfig, engineDraft } from "@/lib/engines";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/use-i18n";
import {
  defaultEngineOptions,
  defaultEngineValue,
  effortLabelKey,
  engineActionKey,
  engineKey,
  engineStatus,
  engineSubline,
  parseDefaultEngineValue,
} from "@/lib/workspace-settings";
import { ClaudeEngineSetup } from "@/components/ClaudeEngineSetup";
import { CodexEngineSetup } from "@/components/CodexEngineSetup";
import { EngineInstall } from "@/components/EngineInstall";
import { GoogleEngineSetup } from "@/components/GoogleEngineSetup";
import { useAppShell, useLeaveGuard } from "@/components/shell/AppShell";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Input, Select } from "@/components/ui/Input";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Skeleton, SkeletonList } from "@/components/ui/Skeleton";
import { StatusPill } from "@/components/ui/StatusPill";
import { useToast } from "@/components/ui/Toast";
import { Applies } from "../Applies";
import { SaveBar } from "../SaveBar";
import { SettingsCard } from "../SettingsCard";
import { SavedConfirmation, useSavedConfirmation } from "../SavedConfirmation";

// Engines (design: WorkspaceSettings.html, "Engines"): the engines agents run on, one row each with
// its status and the one thing to do next (sign in, add or replace a key, change its settings), and
// the default for new chats. Keys are typed here and sent once; the server never sends one back, only
// that one is saved (GET /engines, PUT and DELETE /engines/{id}/config, GET and PUT /engines/preference).
export function EnginesCard() {
  const t = useT();
  const toast = useToast();
  // Saving an engine or the default is an admin's (PUT and DELETE are admin-only); everyone may look.
  const { isAdmin } = useAppShell();
  const confirmation = useSavedConfirmation();
  const [engines, setEngines] = useState<Engine[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [tick, setTick] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, Record<string, string>>>({});
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  // One engine is open at a time, so the page has one Save at a time.
  const [openId, setOpenId] = useState<string | null>(null);
  const [forgetting, setForgetting] = useState<Engine | null>(null);
  const [desktop, setDesktop] = useState(false);
  // Set by Add key and Replace key: once the engine opens, its key field takes focus.
  const focusKey = useRef<string | null>(null);
  const baseId = useId();

  useEffect(() => {
    let alive = true;
    api.getEngines(tick > 0)
      .then((items) => {
        if (!alive) return;
        setEngines(items);
        setDesktop(typeof window !== "undefined" && !!window.suparagent);
        // Saved values fill in; anything typed and not saved stays.
        setDrafts((previous) => ({ ...Object.fromEntries(items.map((item) => [item.id, engineDraft(item)])), ...previous }));
        setLoadError(null);
      })
      .catch((err: unknown) => {
        if (alive) setLoadError(err instanceof ApiError ? t("enginesPage.loadFailedDetail", { detail: err.message }) : t("enginesPage.loadFailed"));
      })
      .finally(() => { if (alive) setChecking(false); });
    return () => { alive = false; };
  }, [tick, t]);

  const refresh = useCallback(() => { setChecking(true); setTick((n) => n + 1); }, []);

  const dirtyOf = (engine: Engine) => JSON.stringify(drafts[engine.id] ?? engineDraft(engine)) !== JSON.stringify(engineDraft(engine));
  useLeaveGuard(engines?.some(dirtyOf) ?? false);

  useEffect(() => {
    if (!openId || focusKey.current !== openId) return;
    focusKey.current = null;
    document.querySelector<HTMLInputElement>(`[data-engine-key="${CSS.escape(openId)}"]`)?.focus();
  }, [openId]);

  const putEngine = (saved: Engine) => setEngines((list) => list?.map((item) => (item.id === saved.id ? saved : item)) ?? list);

  // Everything in the draft is sent, so afterwards the draft is what the server saved (a key field
  // empties again: the key is never sent back).
  const persist = async (engine: Engine, draft: Record<string, string>) => {
    setBusy(engine.id);
    setRowErrors((previous) => ({ ...previous, [engine.id]: "" }));
    try {
      const saved = await api.saveEngineConfig(engine.id, engineConfig(engine, draft));
      putEngine(saved);
      setDrafts((previous) => ({ ...previous, [engine.id]: engineDraft(saved) }));
      confirmation.showSaved(engine.id);
      toast(saved.available ? t("enginesPage.savedReady", { engine: engine.label }) : t("enginesPage.savedNotReady", { engine: engine.label, reason: saved.reason ?? t("enginesPage.notReadyYet") }));
    } catch (err) {
      setRowErrors((previous) => ({ ...previous, [engine.id]: err instanceof ApiError ? t("enginesPage.saveFailedDetail", { detail: err.message }) : t("enginesPage.saveFailed") }));
    } finally {
      setBusy(null);
    }
  };

  const saveField = (engine: Engine, name: string, value: string) => {
    const next = { ...engineDraft(engine), ...drafts[engine.id], [name]: value };
    setDrafts((previous) => ({ ...previous, [engine.id]: { ...previous[engine.id], [name]: value } }));
    confirmation.clearSaved(engine.id);
    void persist(engine, next);
  };

  const updateDraft = (engine: Engine, name: string, value: string) => {
    setDrafts((previous) => ({ ...previous, [engine.id]: { ...previous[engine.id], [name]: value } }));
    setRowErrors((previous) => ({ ...previous, [engine.id]: "" }));
    confirmation.clearSaved(engine.id);
  };

  const forget = async (engine: Engine) => {
    setBusy(engine.id);
    try {
      await api.deleteEngineConfig(engine.id);
      setDrafts((previous) => {
        const next = { ...previous };
        delete next[engine.id];
        return next;
      });
      toast(t("enginesPage.forgotten", { engine: engine.label }));
      refresh();
    } catch (err) {
      setRowErrors((previous) => ({ ...previous, [engine.id]: err instanceof ApiError ? t("enginesPage.forgetFailedDetail", { detail: err.message }) : t("enginesPage.forgetFailed") }));
    } finally {
      setBusy(null);
      setForgetting(null);
    }
  };

  // Ready engines first; the order within each is the server's.
  const ordered = engines ? [...engines.filter((engine) => engine.available), ...engines.filter((engine) => !engine.available)] : null;

  return (
    <>
      <SettingsCard
        title={t("enginesPage.title")}
        description={t("enginesPage.description")}
        action={<Button disabled={checking || busy !== null} loading={checking && engines !== null} onClick={refresh}>{checking && engines !== null ? t("enginesPage.checking") : t("enginesPage.checkAgain")}</Button>}
      >
        {loadError && <Banner tone="danger" action={<Button size="sm" onClick={refresh}>{t("enginesPage.retry")}</Button>}>{loadError}</Banner>}
        {!ordered && !loadError && <SkeletonList rows={3} />}
        {ordered && (
          <ul className="flex flex-col" aria-label={t("enginesPage.listLabel")}>
            {ordered.map((engine) => {
              const status = engineStatus(engine);
              const subline = engineSubline(engine);
              const open = openId === engine.id;
              const panelId = `${baseId}-${engine.id}`;
              const key = engineKey(engine);
              const fields = engine.config_fields ?? [];
              const settingAnchors = [
                engine.configurable && fields.some((item) => item.kind === "secret") ? "setting-engine-api-key" : null,
                engine.configurable && fields.some((item) => item.name === "base_url" || item.name === "model") ? "setting-engine-endpoint" : null,
              ].filter((anchor): anchor is string => anchor !== null).join(" ");
              return (
                <li key={engine.id} className="border-b border-line last:border-b-0">
                  <div className="flex flex-wrap items-center gap-3 py-3">
                    <div className="min-w-0 flex-[1_1_220px]">
                      <p className="text-body font-medium text-ink">{engine.label}</p>
                      {subline && <p className="break-words text-small text-muted">{t(subline.key, subline.params)}</p>}
                      {/* A closed engine keeps what was typed in it, so its row says so: that is what leaving the page warns about. */}
                      {!open && isAdmin && dirtyOf(engine) && <p className="text-small text-muted">{t("settingsPage.unsaved")}</p>}
                    </div>
                    <StatusPill status={status.status}>{t(status.key)}</StatusPill>
                    {isAdmin && (
                      <Button
                        aria-expanded={open}
                        aria-controls={open ? panelId : undefined}
                        aria-label={t("enginesPage.actionFor", { action: open ? t("enginesPage.close") : t(engineActionKey(engine)), engine: engine.label })}
                        data-setting-expand-for={settingAnchors || undefined}
                        onClick={() => {
                          if (!open && key.takesKey) focusKey.current = engine.id;
                          setOpenId(open ? null : engine.id);
                        }}
                      >
                        {open ? t("enginesPage.close") : t(engineActionKey(engine))}
                      </Button>
                    )}
                  </div>
                  {open && isAdmin && (
                    <div id={panelId} className="pb-4">
                      <EngineDetails
                        engine={engine}
                        desktop={desktop}
                        draft={drafts[engine.id] ?? engineDraft(engine)}
                        dirty={dirtyOf(engine)}
                        busy={busy}
                        error={rowErrors[engine.id] || null}
                        saved={confirmation.saved.has(engine.id)}
                        onDraft={(name, value) => updateDraft(engine, name, value)}
                        onSaveField={(name, value) => saveField(engine, name, value)}
                        onSave={() => void persist(engine, drafts[engine.id] ?? engineDraft(engine))}
                        onDiscard={() => {
                          setDrafts((previous) => ({ ...previous, [engine.id]: engineDraft(engine) }));
                          setRowErrors((previous) => ({ ...previous, [engine.id]: "" }));
                          confirmation.clearSaved(engine.id);
                        }}
                        onForget={() => setForgetting(engine)}
                        onChanged={() => {
                          // A sign-in or setup may change what is saved; an untouched draft follows it.
                          if (!dirtyOf(engine)) {
                            setDrafts((previous) => {
                              const next = { ...previous };
                              delete next[engine.id];
                              return next;
                            });
                          }
                          refresh();
                        }}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {engines && <DefaultEngine engines={engines} editable={isAdmin} />}
      </SettingsCard>
      <ConfirmDialog
        open={forgetting !== null}
        onOpenChange={(value) => { if (!value) setForgetting(null); }}
        title={forgetting ? t("enginesPage.forgetTitle", { engine: forgetting.label }) : ""}
        description={t("enginesPage.forgetBody")}
        confirmLabel={t("enginesPage.forget")}
        cancelLabel={t("enginesPage.cancel")}
        danger
        loading={forgetting !== null && busy === forgetting.id}
        onConfirm={() => { if (forgetting) void forget(forgetting); }}
      />
    </>
  );
}

function EngineDetails({
  engine,
  desktop,
  draft,
  dirty,
  busy,
  error,
  saved,
  onDraft,
  onSaveField,
  onSave,
  onDiscard,
  onForget,
  onChanged,
}: {
  engine: Engine;
  desktop: boolean;
  draft: Record<string, string>;
  dirty: boolean;
  busy: string | null;
  error: string | null;
  saved: boolean;
  onDraft: (name: string, value: string) => void;
  onSaveField: (name: string, value: string) => void;
  onSave: () => void;
  onDiscard: () => void;
  onForget: () => void;
  onChanged: () => void;
}) {
  const t = useT();
  const formId = useId();
  const fields = engine.config_fields ?? [];
  const basic = fields.filter((item) => !item.advanced);
  const advanced = fields.filter((item) => item.advanced);
  const setup = engine.setup;

  return (
    <div className="flex flex-col gap-3.5 rounded-card bg-inset p-3.5">
      {engine.id === "claude" && engine.installed && <ClaudeEngineSetup signedIn={engine.signed_in} onChanged={onChanged} />}
      {engine.id === "codex" && engine.installed && <CodexEngineSetup signedIn={engine.signed_in} onChanged={onChanged} />}
      {engine.id === "antigravity" && <GoogleEngineSetup engine={engine} onChanged={onChanged} />}
      {desktop && (engine.id === "claude" || engine.id === "codex" || engine.id === "opencode") && (
        <EngineInstall engine={engine.id} installed={engine.installed === true} onChanged={onChanged} />
      )}
      {setup && (setup.install || setup.sign_in || setup.notes?.length || setup.docs_url) && (
        <div className="flex flex-col gap-1 text-small text-muted">
          {setup.install && <p>{t("enginesPage.install")} <code className="break-all font-mono text-ink">{setup.install}</code></p>}
          {setup.sign_in && <p>{t("enginesPage.signIn")} <code className="break-all font-mono text-ink">{setup.sign_in}</code></p>}
          {setup.notes?.map((note) => <p key={note}>{note}</p>)}
          {setup.docs_url && <a className="text-accent-text underline" href={setup.docs_url} target="_blank" rel="noreferrer">{t("enginesPage.guide")}</a>}
        </div>
      )}
      <p className="text-small text-muted">
        {engine.custom_models ? t("enginesPage.modelsCustom", { n: engine.models.length }) : t("enginesPage.models", { n: engine.models.length })}
      </p>
      {engine.configurable && fields.length > 0 && (
        <form id={formId} onSubmit={(event) => { event.preventDefault(); onSave(); }}>
          <fieldset disabled={busy !== null} className="flex min-w-0 flex-col gap-3.5">
            {fields.some((item) => item.name === "base_url") && (
              <TemplateField onPick={(url) => onSaveField("base_url", url)} />
            )}
            {/* Columns follow the panel's own width (it sits in the Settings page column), not the window's. */}
            <div className={FIELD_GRID}>
              {basic.map((item) => <EngineField key={item.name} engine={engine} field={item} draft={draft} onDraft={onDraft} onSaveField={onSaveField} />)}
            </div>
            {advanced.length > 0 && (
              <details>
                <summary className="cursor-pointer text-body font-medium text-ink">{t("enginesPage.advanced")}</summary>
                <div className={cn("mt-3", FIELD_GRID)}>
                  {advanced.map((item) => <EngineField key={item.name} engine={engine} field={item} draft={draft} onDraft={onDraft} onSaveField={onSaveField} />)}
                </div>
              </details>
            )}
            {/* "Saved" shows once, in the save bar below. */}
            <div className="flex flex-wrap items-center gap-2"><Applies when="next turn" /></div>
            <SaveBar
              dirty={dirty}
              saving={busy === engine.id}
              error={error}
              saved={saved}
              saveLabel={t("enginesPage.save")}
              onSave={() => {
                const form = document.getElementById(formId);
                if (form instanceof HTMLFormElement) form.requestSubmit();
              }}
              onDiscard={onDiscard}
            />
            {engine.config && engine.id !== "antigravity" && (
              <div>
                <Button className="text-danger" onClick={onForget}>{t("enginesPage.forget")}</Button>
              </div>
            )}
          </fieldset>
        </form>
      )}
    </div>
  );
}

// Two fields side by side once each can be 220 px wide, one per row below that.
const FIELD_GRID = "grid gap-3.5 grid-cols-[repeat(auto-fit,minmax(min(220px,100%),1fr))]";

function TemplateField({ onPick }: { onPick: (url: string) => void }) {
  const t = useT();
  const id = useId();
  return (
    <div className="flex max-w-[360px] flex-col gap-1.5">
      <label htmlFor={id} className="text-small font-medium text-muted">{t("enginesPage.template")}</label>
      <Select id={id} value="" triggerClassName="h-control touch:h-touch" onChange={(event) => { if (event.target.value) onPick(event.target.value); }}>
        <option value="">{t("enginesPage.templateChoose")}</option>
        {ENDPOINT_TEMPLATES.map((template) => <option key={template.label} value={template.url}>{template.label}</option>)}
      </Select>
    </div>
  );
}

function EngineField({
  engine,
  field,
  draft,
  onDraft,
  onSaveField,
}: {
  engine: Engine;
  field: EngineConfigField;
  draft: Record<string, string>;
  onDraft: (name: string, value: string) => void;
  onSaveField: (name: string, value: string) => void;
}) {
  const t = useT();
  const id = useId();
  const secret = field.kind === "secret";
  const savedSecret = secret && engine.config?.[`has_${field.name}`] === true;
  const settingId = secret ? "setting-engine-api-key" : field.name === "model" ? "setting-engine-endpoint" : undefined;
  const note = savedSecret ? t("enginesPage.keyKept") : field.required ? null : t("enginesPage.optional");
  return (
    <div data-setting-id={settingId} className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-small font-medium text-muted">
        {field.label}
        {note && <span className="font-normal"> ({note})</span>}
      </label>
      {field.name === "model" && engine.models.length > 0 ? (
        <Select
          id={id}
          value={draft.model ?? ""}
          triggerClassName="h-control touch:h-touch"
          data-setting-focus={settingId}
          onChange={(event) => {
            // Picking the model already chosen (to close the menu) saves nothing.
            if (event.target.value === (draft.model ?? "")) return;
            onSaveField("model", event.target.value);
          }}
        >
          <option value="">{engine.id === "antigravity" ? t("enginesPage.accountDefault") : t("enginesPage.engineDefaultModel")}</option>
          {engine.models.map((model) => <option key={model.id} value={model.id}>{model.label}</option>)}
        </Select>
      ) : (
        // A key is typed here and sent once: never filled in, never shown again, never remembered by the browser.
        <Input
          id={id}
          type={secret ? "password" : field.kind === "url" ? "url" : "text"}
          required={field.required && !savedSecret}
          value={draft[field.name] ?? ""}
          placeholder={field.placeholder ?? undefined}
          autoComplete={secret ? "new-password" : "off"}
          spellCheck={false}
          data-engine-key={secret ? engine.id : undefined}
          data-setting-focus={settingId}
          onChange={(event) => onDraft(field.name, event.target.value)}
        />
      )}
      {field.help && <p className="text-small text-muted">{field.help}</p>}
    </div>
  );
}

// The engine and model a new chat starts on (GET and PUT /engines/preference), and its reasoning
// effort where the model has a choice. Agents keep their own engine.
function DefaultEngine({ engines, editable }: { engines: Engine[]; editable: boolean }) {
  const t = useT();
  const id = useId();
  const confirmation = useSavedConfirmation();
  const [preference, setPreference] = useState<EnginePreference | null>(null);
  // Nothing is shown as the default (not even Automatic) until the server has said what it is, so a
  // failed read can never pass for "no default" and be saved over.
  const [phase, setPhase] = useState<"loading" | "ready" | "failed">("loading");
  const [loadTick, setLoadTick] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api.getEnginePreference()
      .then((value) => { if (alive) { setPreference(value); setPhase("ready"); } })
      .catch(() => { if (alive) setPhase("failed"); });
    return () => { alive = false; };
  }, [loadTick]);

  const retry = () => { setPhase("loading"); setLoadTick((n) => n + 1); };

  const save = async (next: EnginePreference) => {
    setSaving(true);
    setError(null);
    confirmation.clearSaved("default");
    try {
      const saved = await api.setEnginePreference(next);
      setPreference(saved);
      writeCachedPreference({ provider: saved.provider, model: saved.model, effort: saved.effort ?? null });
      confirmation.showSaved("default");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("enginesPage.defaultFailed"));
    } finally {
      setSaving(false);
    }
  };

  const options = defaultEngineOptions(engines, preference, (engine) => t("enginesPage.engineDefault", { engine }));
  const value = defaultEngineValue(preference);
  const engine = preference?.provider ? engines.find((item) => item.id === preference.provider) ?? null : null;
  const modelId = preference?.model || engine?.default_model || null;
  const model = engine?.models.find((item) => item.id === modelId) ?? null;
  const efforts = model && model.reasoning_effort_configurable !== false && (model.supported_reasoning_efforts?.length ?? 0) > 1 ? model.supported_reasoning_efforts ?? [] : [];
  const effort = preference?.effort ?? model?.default_reasoning_effort ?? null;
  const current = options.find((option) => option.value === value);
  const effortLabel = (level: string) => {
    const key = effortLabelKey(level);
    return key ? t(key) : level.charAt(0).toUpperCase() + level.slice(1);
  };

  return (
    <div id="setting-engine-default" data-setting-id="setting-engine-default" data-setting-container tabIndex={-1} className="flex flex-col gap-3 border-t border-line pt-3.5">
      {phase === "ready" ? (
        <div className="flex max-w-[360px] flex-col gap-1.5">
          <label htmlFor={id} className="text-small font-medium text-muted">{t("enginesPage.defaultLabel")}</label>
          <Select
            id={id}
            value={value}
            disabled={!editable || saving}
            triggerClassName="h-control touch:h-touch"
            data-setting-focus="setting-engine-default"
            onChange={(event) => {
              // Picking the default already chosen (to close the menu) saves nothing, so its effort stays.
              if (event.target.value === value) return;
              const next = parseDefaultEngineValue(event.target.value);
              void save({ provider: next.provider, model: next.model, effort: null });
            }}
          >
            <option value="">{t("enginesPage.defaultAutomatic")}</option>
            {options.map((option) => <option key={option.value} value={option.value}>{option.ready ? option.label : t("enginesPage.notReadyOption", { name: option.label })}</option>)}
          </Select>
          <p className="text-small text-muted">{t("enginesPage.defaultHelp")}{editable ? "" : ` ${t("enginesPage.defaultAdmins")}`}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <p className="text-small font-medium text-muted">{t("enginesPage.defaultLabel")}</p>
          {phase === "loading" ? (
            <Skeleton className="h-control w-full max-w-[360px] touch:h-touch" />
          ) : (
            <Banner tone="danger" action={<Button size="sm" onClick={retry}>{t("enginesPage.retry")}</Button>}>{t("enginesPage.defaultLoadFailed")}</Banner>
          )}
        </div>
      )}
      {phase === "ready" && current && !current.ready && <p className="text-small text-muted">{t("enginesPage.defaultNotReady")}</p>}
      {phase === "ready" && efforts.length > 0 && preference?.provider && (
        <div className="flex flex-col gap-1.5">
          <span className="text-small font-medium text-muted">{t("enginesPage.effort")}</span>
          <SegmentedControl
            label={t("enginesPage.effort")}
            value={efforts.find((level) => level.toLowerCase() === effort?.toLowerCase()) ?? ""}
            options={efforts.map((level) => ({ value: level, label: effortLabel(level) }))}
            disabled={!editable || saving}
            busy={saving}
            onChange={(level) => void save({ provider: preference.provider, model: preference.model, effort: level })}
            className="w-fit flex-wrap"
          />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Applies when="new chats" />
        <SavedConfirmation visible={confirmation.saved.has("default")} />
      </div>
      {error && <p role="alert" className="text-small text-danger">{error}</p>}
    </div>
  );
}
