"use client";

import { Select } from "@/components/ui/Select";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { ApiError, type Agent } from "@/lib/api";
import { LANGUAGE_TAGS, resolveLocale } from "@/lib/i18n";
import { localDateTime } from "@/lib/planner";
import { planner, type WorkItem, type WorkRun, type WorkRunInput, type WorkEvent } from "@/lib/planner-api";
import { browserTimezone } from "@/lib/routines";
import { approvalModesForProvider } from "@/lib/agents";
import { useLanguageChoice, useT } from "@/lib/use-i18n";
import { EmptyPanel, ErrorState, LoadingState } from "./PanelState";

// Copy: lib/locales/planner-editor-extra.ts (plannerRun.*).
const control = "w-full rounded-field border border-line bg-surface px-3 py-2 text-sm";
const activeStates = ["scheduled", "queued", "claimed", "running", "needs_input"];
// Read when the person confirms, never while rendering.
const inFuture = (date: Date) => date.getTime() > Date.now();
// Every state GET /planner/items/{id}/runs reports (backend services/work_execution.py); another
// one is shown as the server wrote it.
const KNOWN_STATES = new Set(["scheduled", "claimed", "queued", "running", "needs_input", "completed", "failed", "cancelled", "interrupted", "missed", "skipped"]);

export function WorkExecutionPanel({ item, agents, onClose, onOpenThread, onReview }: {
  item: WorkItem; agents: Agent[]; onClose: () => void; onOpenThread: () => void; onReview: () => Promise<void>;
}) {
  const t = useT();
  const tag = LANGUAGE_TAGS[resolveLocale(useLanguageChoice())];
  const id = useId();
  const [runs, setRuns] = useState<WorkRun[] | null>(null);
  const [events, setEvents] = useState<WorkEvent[]>([]);
  const [agentId, setAgentId] = useState(item.agent_id ?? agents[0]?.id ?? 0);
  const [prompt, setPrompt] = useState(`${item.title}\n\n${item.description}`.trim());
  const [mode, setMode] = useState<WorkRunInput["approval_mode"]>("ask");
  const [when, setWhen] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<WorkRunInput | null>(null);
  const [retrying, setRetrying] = useState(false);
  const timezone = browserTimezone();
  const availableApprovalModes = approvalModesForProvider(agents.find((agent) => agent.id === agentId)?.provider);
  const fallback = t("plannerRun.loadFailed");
  const message = (failure: unknown) => failure instanceof Error ? failure.message : fallback;
  const modeLabel = (value: string) => t(`plannerRun.mode.${value}`);
  const stateLabel = (state: string) => (KNOWN_STATES.has(state) ? t(`plannerRun.state.${state}`) : state);
  const formatTime = (value: string) => new Date(value).toLocaleString(tag);
  useEffect(() => {
    let live = true;
    const load = async () => {
      try { const [result, history] = await Promise.all([planner.runs(item.id), planner.events(item.id)]); if (live) { setRuns(result); setEvents(history); } }
      catch (err) { if (live) setError(err instanceof Error ? err.message : fallback); }
    };
    void load();
    const timer = setInterval(() => void load(), 3000);
    return () => { live = false; clearInterval(timer); };
  }, [item.id, fallback]);
  const active = runs?.some(run => activeStates.includes(run.state));
  const refresh = async () => setRuns(await planner.runs(item.id));

  async function start(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError(null);
    let scheduled: string | null = null;
    if (!pending && when) {
      const date = new Date(when);
      if (!Number.isFinite(date.getTime()) || localDateTime(date.toISOString()) !== when || !inFuture(date)) {
        setError(t("plannerRun.error.future")); return;
      }
      scheduled = date.toISOString();
    }
    const data = pending ?? { revision: item.revision, idempotency_key: crypto.randomUUID(), agent_id: agentId,
      prompt, approval_mode: mode, scheduled_for: scheduled };
    setPending(data); setBusy(true);
    try {
      const saved = await planner.start(item.id, data);
      setRuns(current => [saved, ...(current ?? []).filter(run => run.id !== saved.id)]);
      setPending(null); setRetrying(false);
      await refresh().catch(err => setError(message(err)));
    } catch (err) {
      // A lost response may have committed. Keep its exact request/key so
      // retrying the request never launches another attempt.
      if (err instanceof ApiError && err.status >= 400 && err.status < 500) setPending(null);
      setError(message(err));
    } finally { setBusy(false); }
  }
  async function cancel(run: WorkRun) {
    setBusy(true); setError(null);
    try { await planner.cancelRun(item.id, run.id); await refresh(); }
    catch (err) { setError(message(err)); }
    finally { setBusy(false); }
  }
  return <Dialog open title={t("plannerRun.title", { title: item.title })} description={t("plannerRun.description")} size="wide"
    onOpenChange={open => { if (!open && !busy) onClose(); }}>
    <div className="space-y-5">
      <p className="text-sm text-muted">{t("plannerRun.intro")}</p>
      {error && <ErrorState message={error} />}
      {runs === null ? <LoadingState rows={3} /> : <>
        {(!active || pending) && !item.archived && <form onSubmit={event => void start(event)} className="space-y-3 rounded-field border border-line p-3">
          <h3 className="font-medium">{retrying ? t("plannerRun.reviewAttempt") : t("plannerRun.start")}</h3>
          {retrying && <p className="text-sm text-warning">{t("plannerRun.retryWarning")}</p>}
          <fieldset disabled={busy || !!pending} className="space-y-3">
            <label htmlFor={`${id}-agent`} className="block text-sm">{t("plannerRun.agent")}
              <Select id={`${id}-agent`} required className={control} value={agentId} onChange={event => { const nextAgentId = Number(event.target.value); setAgentId(nextAgentId); if (!approvalModesForProvider(agents.find((agent) => agent.id === nextAgentId)?.provider).some((entry) => entry.value === mode)) setMode("ask"); }}>
                <option value={0} disabled>{t("plannerRun.chooseAgent")}</option>
                {agents.filter(agent => !agent.archived_at).map(agent => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
              </Select></label>
            <label htmlFor={`${id}-prompt`} className="block text-sm">{t("plannerRun.prompt")}
              <textarea id={`${id}-prompt`} required maxLength={20000} rows={5} className={control} value={prompt} onChange={event => setPrompt(event.target.value)} /></label>
            <label htmlFor={`${id}-mode`} className="block text-sm">{t("plannerRun.mode")}
              <Select id={`${id}-mode`} className={control} value={mode} onChange={event => setMode(event.target.value as WorkRunInput["approval_mode"])}>
                {availableApprovalModes.map((entry) => <option key={entry.value} value={entry.value}>{modeLabel(entry.value)}</option>)}
              </Select></label>
            <p className="text-xs text-muted">{t("plannerRun.modeHelp")}</p>
            <label htmlFor={`${id}-when`} className="block text-sm">{t("plannerRun.when", { zone: timezone })}
              <input id={`${id}-when`} type="datetime-local" className={control} value={when} onChange={event => setWhen(event.target.value)} /></label>
          </fieldset>
          <p className="text-sm">{when ? t("plannerRun.confirmScheduled", { zone: timezone }) : t("plannerRun.confirmNow")}</p>
          {pending && !busy && <p className="text-sm text-warning">{t("plannerRun.maybeSent")}</p>}
          <Button type="submit" variant="primary" loading={busy} disabled={!agentId || !prompt.trim()}>{pending ? t("plannerRun.retrySame") : when ? t("plannerRun.confirmSchedule") : t("plannerRun.confirmStart")}</Button>
        </form>}
        {item.archived && <p className="text-sm text-muted">{t("plannerRun.restore")}</p>}
        <div className="space-y-3" aria-live="polite">
          <h3 className="font-medium">{t("plannerRun.attempts")}</h3>
          {runs.length === 0 && <EmptyPanel title={t("plannerRun.empty.title")} description={t("plannerRun.empty.body")} />}
          {runs.map(run => <article key={run.id} className="space-y-2 rounded-field border border-line p-3 text-sm">
            <p className="font-medium">{t("plannerRun.attempt", { n: run.attempt, state: stateLabel(run.state) })}</p>
            <p className="text-xs text-muted">{agents.find(agent => agent.id === run.agent_id)?.name ?? t("plannerRun.agentFallback", { id: run.agent_id })} · {modeLabel(run.approval_mode)} · {formatTime(run.scheduled_for ?? run.created_at)}</p>
            {run.state === "queued" && <p className="text-muted">{t("plannerRun.queuedNote")}</p>}
            {run.state === "interrupted" && <p className="text-warning">{t("plannerRun.interruptedNote")}</p>}
            {run.result && <p className="whitespace-pre-wrap break-words">{run.result}</p>}
            {run.error && <p className="whitespace-pre-wrap text-danger">{run.error}</p>}
            <details><summary className="cursor-pointer text-muted">{t("plannerRun.approvedPrompt")}</summary><pre className="whitespace-pre-wrap break-words py-2 font-sans">{run.prompt}</pre></details>
            <div className="flex flex-wrap items-center gap-3">
              {run.thread_id && <Link className="text-accent-text underline" href={`/chat?thread=${run.thread_id}`} onClick={onOpenThread}>{t("plannerRun.openThread")}</Link>}
              {activeStates.includes(run.state) && <Button size="sm" disabled={busy} onClick={() => void cancel(run)}>{run.state === "scheduled" || run.state === "queued" ? t("plannerRun.cancel") : t("plannerRun.stop")}</Button>}
              {!active && !item.archived && ["failed", "cancelled", "interrupted", "missed", "skipped"].includes(run.state) && <Button size="sm" disabled={busy || !!pending} onClick={() => { setAgentId(run.agent_id); setPrompt(run.prompt); setMode(approvalModesForProvider(agents.find((agent) => agent.id === run.agent_id)?.provider).some((entry) => entry.value === run.approval_mode) ? run.approval_mode : "ask"); setWhen(""); setRetrying(true); }}>{t("plannerRun.prepareRetry")}</Button>}
              {run.state === "completed" && <Button size="sm" disabled={busy} onClick={async () => { setBusy(true); try { await onReview(); } catch (err) { setError(message(err)); } finally { setBusy(false); } }}>{t("plannerRun.moveToReview")}</Button>}
            </div>
          </article>)}
        </div>
        <details><summary className="cursor-pointer text-sm text-muted">{t("plannerRun.activity")}</summary>
          <ol className="mt-2 space-y-1 text-xs text-muted">{events.map(event => <li key={event.id}>
            {formatTime(event.created_at)} · {event.actor} · {event.kind.replaceAll("_", " ")}{event.detail ? ` · ${event.detail}` : ""}
          </li>)}</ol>
        </details>
      </>}
      <div className="flex justify-end"><Button disabled={busy} onClick={onClose}>{t("plannerRun.close")}</Button></div>
    </div>
  </Dialog>;
}
