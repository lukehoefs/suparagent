"use client";

// The routine editor (design: Routines.html, "Edit routine"): name, agent, prompt, schedule with
// the server's check of the next dates, approval mode, run limit and retries; the rest of the
// routine's settings (approval wait, catch-up, retry delay, quiet checks, connected-app grants,
// uninterrupted access) sit under disclosures. Save sends the whole routine; the server checks it
// again. A run of a routine always goes through the approval gate: nothing here bypasses it.
import { useCallback, useEffect, useId, useState } from "react";
import { api, type Agent, type ApprovalMode, type Routine } from "@/lib/api";
import type { ComposioAccount } from "@/lib/connected-apps";
import { activeAgents } from "@/lib/agents";
import { canSaveSchedulePreview } from "@/lib/routines";
import {
  approvalModeFor,
  draftChanged,
  draftProblems,
  hasAppGrants,
  LIMITS,
  newRoutineDraft,
  routineApprovalModes,
  routineDraft,
  routineInput,
  type DraftField,
  type RoutineDraft,
} from "@/lib/routines-page";
import { useT } from "@/lib/use-i18n";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Field, Input, Select, Textarea } from "@/components/ui/Input";
import { AppAccessFields } from "./AppAccessFields";
import { ScheduleFields } from "./ScheduleFields";
import { Disclosure, useErrorText } from "./shared";

// The number fields: each has its draft field of the same name and its range in LIMITS.
type NumberField = Exclude<keyof typeof LIMITS, "everyMinutes">;

export function RoutineEditor({
  routine,
  agents,
  agentId,
  onSaved,
  onCancel,
  onDelete,
  onDirtyChange,
}: {
  // null: a new routine.
  routine: Routine | null;
  agents: Agent[] | null;
  // The agent a new routine starts with (?agent=).
  agentId: number | null;
  onSaved: (routine: Routine, created: boolean) => void;
  onCancel: () => void;
  onDelete?: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const t = useT();
  const errorText = useErrorText();
  const formId = useId();
  const providerOf = useCallback((id: number | null) => agents?.find((agent) => agent.id === id)?.provider ?? null, [agents]);
  const [start, setStart] = useState<RoutineDraft>(() => (
    routine ? routineDraft(routine, providerOf(routine.agent_id)) : newRoutineDraft(agents, agentId)
  ));
  const [draft, setDraft] = useState<RoutineDraft>(start);
  const [validPreviewKey, setValidPreviewKey] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<ComposioAccount[] | null>(null);

  // Changed since it opened (or was last saved): leaving then asks first. A new routine can be
  // created as it is; a saved one has nothing to save until something changed.
  const changed = draftChanged(start, draft);
  const canSubmit = draft.id === null || changed;
  useEffect(() => { onDirtyChange(changed); }, [changed, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  // A backend without connected apps answers with an error: it then has no accounts to offer.
  useEffect(() => {
    let live = true;
    api.listComposioAccounts()
      .then((list) => { if (live) setAccounts(list); })
      .catch(() => { if (live) setAccounts([]); });
    return () => { live = false; };
  }, []);

  const reportPreview = useCallback((key: string, valid: boolean) => setValidPreviewKey(valid ? key : null), []);
  const set = (patch: Partial<RoutineDraft>) => setDraft((current) => ({ ...current, ...patch }));

  const live = activeAgents(agents);
  const agent = agents?.find((item) => item.id === draft.agentId);
  // The live agents, and the routine's own agent when it is archived or gone, so the field never
  // shows another agent's name than the one the routine runs as.
  const agentOptions = live.map((item) => ({ value: String(item.id), label: item.name }));
  if (draft.agentId !== null && !live.some((item) => item.id === draft.agentId)) {
    agentOptions.unshift({
      value: String(draft.agentId),
      label: agent ? t("routines.agent.archived", { name: agent.name }) : t("routines.agent.missing"),
    });
  }
  const modes = routineApprovalModes(agent?.provider);
  const problems = draftProblems(draft);
  const shown: Partial<Record<DraftField, { key: string; params?: Record<string, string | number> }>> = submitted ? problems : {};
  const scheduleReady = canSaveSchedulePreview(draft.schedule, validPreviewKey);
  const problemText = (field: DraftField) => {
    const problem = shown[field];
    return problem ? t(problem.key, problem.params) : undefined;
  };

  const save = async () => {
    setSubmitted(true);
    setSaveError(null);
    if (Object.keys(problems).length > 0 || !scheduleReady) {
      // The first field that needs attention takes focus.
      window.requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-routine-form="${formId}"] [aria-invalid="true"]`)?.focus());
      return;
    }
    setSaving(true);
    try {
      const body = routineInput(draft);
      const saved = draft.id === null ? await api.createRoutine(body) : await api.updateRoutine(draft.id, body);
      const next = routineDraft(saved, providerOf(saved.agent_id));
      setStart(next);
      setDraft(next);
      setSubmitted(false);
      onSaved(saved, draft.id === null);
    } catch (err) {
      setSaveError(errorText(err, "routines.error.save"));
    } finally {
      setSaving(false);
    }
  };

  const numberField = (field: NumberField, labelKey: string) => (
    <Field label={t(labelKey)} error={problemText(field)}>
      {(ids) => (
        <Input
          {...ids}
          type="number"
          inputMode="numeric"
          min={LIMITS[field][0]}
          max={LIMITS[field][1]}
          value={draft[field]}
          onChange={(event) => set({ [field]: event.target.value } as Partial<RoutineDraft>)}
        />
      )}
    </Field>
  );

  return (
    <form
      noValidate
      data-routine-form={formId}
      className="flex flex-col gap-4"
      onSubmit={(event) => { event.preventDefault(); void save(); }}
    >
      <Field label={t("routines.field.name")} error={problemText("name")}>
        {(ids) => <Input {...ids} value={draft.name} maxLength={80} autoComplete="off" onChange={(event) => set({ name: event.target.value })} />}
      </Field>

      <Field label={t("routines.field.agent")} error={problemText("agent")}>
        {(ids) => (
          <Select
            {...ids}
            value={draft.agentId === null ? "" : String(draft.agentId)}
            options={agentOptions.length > 0 ? agentOptions : [{ value: "", label: t("routines.agent.none") }]}
            disabled={agentOptions.length === 0}
            onChange={(event) => {
              const nextId = Number(event.target.value);
              const provider = providerOf(nextId);
              setDraft((current) => ({ ...current, agentId: nextId, approvalMode: approvalModeFor(current.approvalMode, provider) }));
            }}
            className="h-control touch:h-touch"
          />
        )}
      </Field>

      <Field label={t("routines.field.prompt")} hint={problemText("prompt") ? undefined : t("routines.field.promptHint")} error={problemText("prompt")}>
        {(ids) => <Textarea {...ids} rows={4} maxLength={20_000} value={draft.prompt} onChange={(event) => set({ prompt: event.target.value })} />}
      </Field>

      <ScheduleFields
        value={draft.schedule}
        onChange={(schedule) => { setValidPreviewKey(null); set({ schedule }); }}
        onPreviewResult={reportPreview}
        problems={shown}
      />

      <Field label={t("routines.field.approvalMode")} hint={t(`routines.mode.${draft.approvalMode}.help`)}>
        {(ids) => (
          <Select
            {...ids}
            value={draft.approvalMode}
            options={modes.map((mode) => ({ value: mode, label: t(`routines.mode.${mode}`) }))}
            onChange={(event) => set({ approvalMode: event.target.value as ApprovalMode })}
            className="h-control touch:h-touch"
          />
        )}
      </Field>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {numberField("runLimit", "routines.field.runLimit")}
        {numberField("retryLimit", "routines.field.retries")}
      </div>

      <Disclosure
        title={t("routines.more")}
        defaultOpen={Boolean(shown.approvalWait || shown.catchUp || shown.retryDelay)}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {numberField("approvalWait", "routines.field.approvalWait")}
          {numberField("catchUp", "routines.field.catchUp")}
          {numberField("retryDelay", "routines.field.retryDelay")}
        </div>
        <p className="text-small text-muted">{t("knowledgeRoutines.approvalModeHelp")}</p>
        <Checkbox
          checked={draft.quietReporting}
          onChange={(event) => set({ quietReporting: event.target.checked })}
          label={t("knowledgeRoutines.quietScheduledChecks")}
          description={t("knowledgeRoutines.quietScheduledHelp")}
        />
      </Disclosure>

      <Disclosure title={t("knowledgeRoutines.connectedAppAccess")} defaultOpen={hasAppGrants(start.connectedAppGrants)}>
        <AppAccessFields
          grants={draft.connectedAppGrants}
          agent={agent}
          accounts={accounts}
          onChange={(connectedAppGrants) => set({ connectedAppGrants })}
        />
      </Disclosure>

      <Disclosure title={t("knowledgeRoutines.uninterruptedAccess")} defaultOpen={start.uninterruptedAccess}>
        <p className="text-small text-muted">{t("knowledgeRoutines.uninterruptedAccessHelp")}</p>
        <Checkbox
          checked={draft.uninterruptedAccess}
          onChange={(event) => set({ uninterruptedAccess: event.target.checked })}
          label={t("knowledgeRoutines.allowUninterruptedAccess")}
        />
      </Disclosure>

      {submitted && !scheduleReady && <p role="alert" className="text-xs text-danger">{t("routines.problem.schedule")}</p>}
      {saveError && <Banner tone="danger" onDismiss={() => setSaveError(null)}>{saveError}</Banner>}

      <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center gap-2 border-t border-line bg-raised px-1 py-3">
        {onDelete && (
          <Button variant="ghost" className="text-danger" onClick={onDelete} disabled={saving}>
            {t("routines.delete")}
          </Button>
        )}
        <div className="ml-auto flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={saving}>{t("routines.cancel")}</Button>
          <Button type="submit" variant="primary" loading={saving} disabled={!canSubmit}>
            {draft.id === null ? t("routines.create") : t("routines.save")}
          </Button>
        </div>
      </div>
    </form>
  );
}
