"use client";

// An agent's notes (MEMORY.md) on the settings page: the size gauge, the editor, and the conflict
// that a save meets when the agent changed the file meanwhile (load its version, or overwrite).
// The behaviour of the old Agents dialog's notes view, with the switches moved to the Memory tab.
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { api, ApiError, type Agent, type AgentMemory } from "@/lib/api";
import { memoryGauge } from "@/lib/agents";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/use-i18n";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { SkeletonList } from "@/components/ui/Skeleton";
import { Card } from "@/components/ui/Surface";

const GAUGE_COLOR = { ok: "bg-success", near: "bg-warning", over: "bg-danger" } as const;

export function NotesEditor({
  agent,
  reloadTick,
  onDirtyChange,
}: {
  agent: Agent;
  // Bumped when something else changed the notes (a tidy-up, an accepted proposal, an undo):
  // the editor reloads unless it holds unsaved text.
  reloadTick: number;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const t = useT();
  const fieldId = useId();
  const headingId = useId();
  const [memory, setMemory] = useState<AgentMemory | null>(null);
  const [text, setText] = useState("");
  const [conflict, setConflict] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const errorText = useCallback((err: unknown) => (err instanceof Error ? err.message : t("agentSettings.actionFailed")), [t]);

  const load = useCallback(async () => {
    try {
      const next = await api.getAgentMemory(agent.id);
      setMemory(next);
      setText(next.text);
      setConflict(false);
      setError(null);
    } catch (err) {
      setError(errorText(err));
    }
  }, [agent.id, errorText]);

  const dirty = memory !== null && text !== memory.text;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  // Another change to the notes: read them again, but never over text that is being edited.
  const dirtyRef = useRef(dirty);
  useEffect(() => { dirtyRef.current = dirty; }, [dirty]);
  useEffect(() => {
    if (reloadTick === 0 || dirtyRef.current) return;
    void load();
  }, [reloadTick, load]);

  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  // `overwrite` saves without the hash check, after the conflict was shown.
  const save = async (overwrite: boolean) => {
    if (!memory) return;
    setBusy(true);
    setError(null);
    try {
      const next = await api.saveAgentMemory(agent.id, text, overwrite ? null : memory.hash);
      setMemory(next);
      setText(next.text);
      setConflict(false);
      const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      setSaved(next.redacted > 0
        ? t("agentSettings.notes.savedRedacted", { time, n: next.redacted })
        : t("agentSettings.savedAt", { time }));
    } catch (err) {
      if (err instanceof ApiError && err.code === "memory_changed") setConflict(true);
      else setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const gauge = memory ? memoryGauge(memory) : null;

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 id={headingId} className="text-label font-semibold text-ink">{t("agentSettings.notes.title")}</h3>
          {memory && (
            <p className="mt-0.5 text-small text-muted">
              {t("agentSettings.notes.subtitle", { lines: memory.max_lines })}{" "}
              <span className="break-all font-mono">{memory.path}</span>
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {saved && !dirty && <span role="status" className="text-small text-muted">{saved}</span>}
          {dirty && memory && (
            <Button onClick={() => { setText(memory.text); setConflict(false); }} disabled={busy}>{t("agentSettings.discard")}</Button>
          )}
          <Button variant="primary" onClick={() => void save(false)} disabled={!dirty} loading={busy}>
            {t("agentSettings.notes.save")}
          </Button>
        </div>
      </div>

      {error && <Banner tone="danger">{error}</Banner>}
      {conflict && (
        <Banner
          tone="warning"
          action={(
            <>
              <Button size="sm" onClick={() => void load()} disabled={busy}>{t("agentSettings.notes.loadTheirs")}</Button>
              <Button size="sm" onClick={() => void save(true)} disabled={busy}>{t("agentSettings.notes.overwrite")}</Button>
            </>
          )}
        >
          {t("agentTeam.agentNotesConflict")}
        </Banner>
      )}

      {memory === null || gauge === null ? (
        !error && <SkeletonList rows={3} />
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="border-b border-line px-4 py-2.5">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-hover" aria-hidden="true">
              <div className={cn("h-full", GAUGE_COLOR[gauge.level])} style={{ width: `${gauge.percent}%` }} />
            </div>
            <p className={cn("mt-1.5 text-small", gauge.level === "over" ? "text-danger" : "text-muted")}>{gauge.text}</p>
          </div>
          <label htmlFor={fieldId} className="sr-only">{t("agentSettings.notes.title")}</label>
          <textarea
            id={fieldId}
            rows={12}
            value={text}
            onChange={(event) => { setText(event.target.value); setSaved(null); }}
            placeholder={t("agentSettings.notes.placeholder")}
            className="block min-h-48 w-full resize-y border-0 bg-transparent p-4 font-mono text-[13px] leading-[1.7] text-ink outline-none placeholder:text-faint focus-visible:bg-inset/40 touch:text-base"
          />
        </Card>
      )}
    </section>
  );
}
