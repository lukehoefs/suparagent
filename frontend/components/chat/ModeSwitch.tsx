"use client";

// Task or Conversational, per agent (design: Chat.html, the switch in the header). `ModeSwitch`
// saves at once: it shows the new mode straight away, PATCHes only `conversational_mode`, and goes
// back with a message if the save fails. `ModeSegments` is the same control without saving, for a
// form with its own Save (the Profile tab). Neither mode changes approvals (lib/agent-mode.ts).
import { MessageSquare, X, Zap } from "lucide-react";
import { useId, useState } from "react";
import { api, type Agent } from "@/lib/api";
import { AGENT_MODES, mayManageAgents, modeChange, modeHint, modeLabel, modeOf, withMode, type AgentMode } from "@/lib/agent-mode";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/use-i18n";
import { useSession } from "@/components/AuthGate";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { StatusDotMark } from "@/components/ui/StatusPill";
import { Tooltip } from "@/components/ui/Tooltip";

// The design's icons: a lightning bolt for Task, a speech bubble for Conversational.
export const MODE_ICONS: Record<AgentMode, typeof Zap> = { task: Zap, conversational: MessageSquare };

export function ModeIcon({ mode, size = 14, className }: { mode: AgentMode; size?: number; className?: string }) {
  const Icon = MODE_ICONS[mode];
  return <Icon size={size} strokeWidth={1.7} aria-hidden="true" className={cn("shrink-0", className)} />;
}

export function ModeSegments({
  name,
  value,
  onChange,
  disabled = false,
  disabledReason,
  busy = false,
  className,
}: {
  // The agent's name, for the group's accessible name ("How Atlas works").
  name: string;
  value: AgentMode;
  onChange: (mode: AgentMode) => void;
  // The options stay focusable and a click does nothing; `disabledReason` says why, as a tooltip
  // and to a screen reader.
  disabled?: boolean;
  disabledReason?: string;
  busy?: boolean;
  className?: string;
}) {
  const t = useT();
  const reasonId = useId();
  const explained = disabled && Boolean(disabledReason);
  const control = (
    <SegmentedControl
      size="md"
      label={t("agentMode.groupLabel", { name })}
      value={value}
      onChange={onChange}
      disabled={disabled}
      busy={busy}
      describedBy={explained ? reasonId : undefined}
      options={AGENT_MODES.map((mode) => ({
        value: mode,
        label: modeLabel(t, mode),
        icon: <ModeIcon mode={mode} />,
        // One hint at a time: the reason replaces the options' own hints.
        title: explained ? undefined : modeHint(t, mode),
      }))}
      className={className}
    />
  );
  if (!explained || !disabledReason) return control;
  return (
    <>
      <Tooltip content={disabledReason}>
        <span className="inline-flex">{control}</span>
      </Tooltip>
      <span id={reasonId} className="sr-only">{disabledReason}</span>
    </>
  );
}

type ForAgent<T> = T & { id: number };

export function ModeSwitch({
  agent,
  onChanged,
  className,
}: {
  agent: Agent;
  // The agent as the switch now shows it, so the page can keep its copy (and the line under the
  // header, and the subtitle) in step: at once with the new mode, then with the agent as saved,
  // or with the agent as it was when the save fails.
  onChanged?: (agent: Agent) => void;
  className?: string;
}) {
  const t = useT();
  const { session } = useSession();
  const allowed = mayManageAgents(session);
  // Each is kept with the agent it is about, so moving to another conversation shows that
  // agent's own mode, and an answer that arrives late changes nothing on screen.
  const [pending, setPending] = useState<ForAgent<{ mode: AgentMode }> | null>(null);
  // A save made here, shown until `agent` itself shows a different mode than it did then (the page
  // caught up, or someone changed it elsewhere): a page that passes no `onChanged` still agrees.
  const [saved, setSaved] = useState<ForAgent<{ mode: AgentMode; before: AgentMode }> | null>(null);
  const [error, setError] = useState<ForAgent<{ text: string }> | null>(null);

  const passed = modeOf(agent);
  const mine = <T extends { id: number }>(value: T | null) => (value !== null && value.id === agent.id ? value : null);
  const pendingNow = mine(pending);
  const savedNow = mine(saved);
  const errorNow = mine(error);
  const shown = pendingNow?.mode ?? (savedNow !== null && savedNow.before === passed ? savedNow.mode : passed);

  const choose = async (mode: AgentMode) => {
    if (!allowed || pendingNow !== null || mode === shown) return;
    const before = agent;
    const { id, name } = agent;
    setPending({ id, mode });
    setError(null);
    onChanged?.(withMode(before, mode));
    try {
      const next = await api.updateAgent(id, modeChange(mode));
      setSaved({ id, mode: modeOf(next), before: passed });
      onChanged?.(next);
    } catch {
      // Nothing changed on the server: the switch, and the page, go back to what is saved.
      setError({ id, text: t("agentMode.saveFailed", { name, mode: modeLabel(t, mode) }) });
      onChanged?.(before);
    } finally {
      setPending((current) => (current !== null && current.id === id ? null : current));
    }
  };

  return (
    <div className={cn("relative inline-flex shrink-0", className)}>
      <ModeSegments
        name={agent.name}
        value={shown}
        onChange={(mode) => void choose(mode)}
        disabled={!allowed}
        disabledReason={t("agentMode.noPermission")}
        busy={pendingNow !== null}
      />
      {errorNow && (
        // A floating panel: shadow, no border.
        <div
          role="alert"
          className="absolute right-0 top-full z-30 mt-2 flex w-72 max-w-[calc(100vw-2rem)] items-start gap-2 rounded-card bg-raised py-2 pl-3 pr-1 text-small text-ink shadow-float"
        >
          <StatusDotMark status="denied" className="mt-[5px]" />
          <p className="min-w-0 flex-1 py-0.5">{errorNow.text}</p>
          <button
            type="button"
            aria-label={t("common.close")}
            onClick={() => setError(null)}
            className="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-field text-muted transition-colors duration-(--dur-fast) hover:bg-hover hover:text-ink touch:size-11"
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
