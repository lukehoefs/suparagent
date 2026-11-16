"use client";

// The Memory tab: the three memory switches (saved at once), the notes (MEMORY.md), then topic
// notes, proposals (editable before accepting), About me, the daily logs and history (MemoryPanel).
// Switches show the new state straight away and go back
// if the save fails. Without admin only the switches show: the rest are admin-only routes.
import { useEffect, useId, useState } from "react";
import { api, type Agent, type AgentInput } from "@/lib/api";
import { memorySwitches, type MemoryFlag } from "@/lib/agent-settings";
import { useT } from "@/lib/use-i18n";
import { Banner } from "@/components/ui/Banner";
import { Card } from "@/components/ui/Surface";
import { Switch } from "@/components/ui/Switch";
import { MemoryPanel } from "@/components/chat/MemoryPanel";
import { NotesEditor } from "./NotesEditor";

function SettingRow({
  title,
  hint,
  checked,
  disabled,
  onChange,
}: {
  title: string;
  hint: string;
  checked: boolean;
  disabled: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-3">
      <div className="min-w-0">
        <p className="text-label font-medium text-ink">{title}</p>
        <p className="mt-0.5 text-small text-muted">{hint}</p>
      </div>
      <Switch checked={checked} disabled={disabled} onChange={onChange} label={title} className="mt-0.5" />
    </div>
  );
}

export function MemoryTab({
  agent,
  isAdmin,
  onAgentChange,
  onDirtyChange,
}: {
  agent: Agent;
  // The notes files, topic notes, upkeep and About me are admin-only routes; the switches are
  // agent fields anyone who may manage agents can change.
  isAdmin: boolean;
  onAgentChange: (patch: Partial<Agent>) => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const t = useT();
  const headingId = useId();
  const [pending, setPending] = useState<MemoryFlag | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notesTick, setNotesTick] = useState(0);
  // Unsaved text in the notes editor, or in an open topic note or About me below it.
  const [notesDirty, setNotesDirty] = useState(false);
  const [panelDirty, setPanelDirty] = useState(false);
  const dirty = notesDirty || panelDirty;
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);
  const flags = memorySwitches(agent);

  const flip = async (flag: MemoryFlag, next: boolean) => {
    const previous = (agent[flag] ?? true) as boolean;
    setPending(flag);
    setError(null);
    onAgentChange({ [flag]: next } as Partial<Agent>);
    try {
      const saved = await api.updateAgent(agent.id, { [flag]: next } as Partial<AgentInput>);
      onAgentChange({ [flag]: saved[flag] ?? next } as Partial<Agent>);
    } catch (err) {
      onAgentChange({ [flag]: previous } as Partial<Agent>);
      setError(err instanceof Error ? err.message : t("agentSettings.actionFailed"));
    } finally {
      setPending(null);
    }
  };

  const needsNotes = flags.dependentsDisabled ? ` ${t("agentSettings.memory.needsNotes")}` : "";

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby={headingId} className="flex flex-col gap-4">
        <div className="min-w-0">
          <h2 id={headingId} className="text-h3 font-semibold text-ink">{t("agentSettings.memory.title")}</h2>
          <p className="mt-0.5 text-small text-muted">{t("agentSettings.memory.subtitle", { name: agent.name })}</p>
        </div>
        {error && <Banner tone="danger" onDismiss={() => setError(null)}>{error}</Banner>}
        <Card className="divide-y divide-line p-0">
          <SettingRow
            title={t("agentSettings.memory.notes")}
            hint={t("agentSettings.memory.notesHint", { name: agent.name })}
            checked={flags.notes}
            disabled={pending === "memory_enabled"}
            onChange={(next) => void flip("memory_enabled", next)}
          />
          <SettingRow
            title={t("agentSettings.memory.recall")}
            hint={t("agentSettings.memory.recallHint") + needsNotes}
            checked={flags.recall}
            disabled={flags.dependentsDisabled || pending === "recall_enabled"}
            onChange={(next) => void flip("recall_enabled", next)}
          />
          <SettingRow
            title={t("agentSettings.memory.upkeep")}
            hint={t("agentSettings.memory.upkeepHint") + needsNotes}
            checked={flags.upkeep}
            disabled={flags.dependentsDisabled || pending === "memory_upkeep"}
            onChange={(next) => void flip("memory_upkeep", next)}
          />
        </Card>
        {!isAdmin && <p className="text-small text-muted">{t("agentSettings.memory.ownerOnly", { name: agent.name })}</p>}
      </section>

      {isAdmin && (
        <>
          <NotesEditor agent={agent} reloadTick={notesTick} onDirtyChange={setNotesDirty} />
          <MemoryPanel
            agent={agent}
            onAgentChange={onAgentChange}
            onNotesChanged={() => setNotesTick((n) => n + 1)}
            showUpkeepSwitch={false}
            onDirtyChange={setPanelDirty}
          />
        </>
      )}
    </div>
  );
}
