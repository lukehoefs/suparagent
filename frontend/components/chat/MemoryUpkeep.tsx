"use client";

// Memory upkeep for one agent (switch, tidy up now, the summary and helper switches) and the
// settings every agent shares (the hour, the helper models, learning from group chats, keeping
// chats warm), plus the About me text every agent reads (docs/MEMORY.md). Shown inside the memory
// panel under an agent's notes; the shared settings sit in their own "all agents" group.
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { api, ApiError, type AboutMe, type Agent, type Engine, type MemorySettings, type MemoryUpkeepStatus } from "@/lib/api";
import { tidyLine } from "@/lib/agents";
import { captureLine, helperChange, helperModelLine, tidyHourLabel, withHelperModel } from "@/lib/memory";
import { useT } from "@/lib/use-i18n";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { Switch } from "@/components/ui/Switch";

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

// A switch with its title and explanation beside it.
function SwitchRow({
  checked,
  disabled,
  onChange,
  title,
  children,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <Switch checked={checked} disabled={disabled} onChange={onChange} label={title} className="mt-0.5" />
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink">{title}</p>
        {children && <div className="text-xs text-muted">{children}</div>}
      </div>
    </div>
  );
}

export function UpkeepCard({
  agent,
  onAgentChange,
  onError,
  onNotesChanged,
  showUpkeepSwitch = true,
}: {
  agent: Agent;
  onAgentChange: (patch: Partial<Agent>) => void;
  onError: (e: string | null) => void;
  onNotesChanged: () => void;
  // False where the page already shows the memory upkeep switch above (the agent settings page).
  showUpkeepSwitch?: boolean;
}) {
  const t = useT();
  const notesOn = agent.memory_enabled ?? true;
  const upkeepOn = agent.memory_upkeep ?? true;
  const summaryOn = agent.compaction_summary ?? true;
  const helperAllowed = agent.use_helper ?? true;
  const [status, setStatus] = useState<MemoryUpkeepStatus | null>(null);
  const [settings, setSettings] = useState<MemorySettings | null>(null);
  const [model, setModel] = useState("");
  const [engines, setEngines] = useState<Engine[]>([]);
  const [helperEngine, setHelperEngine] = useState("");
  const [helperName, setHelperName] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [nextStatus, nextSettings] = await Promise.all([api.memoryUpkeep(agent.id), api.memorySettings()]);
      setStatus(nextStatus);
      setSettings(nextSettings);
      setModel(nextSettings.helper_models[nextStatus.engine ?? agent.provider] ?? "");
      setHelperEngine(nextSettings.helper?.engine ?? "");
      setHelperName(nextSettings.helper?.model ?? "");
    } catch (err) {
      onError(errorText(err));
    }
  }, [agent.id, agent.provider, onError]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load, upkeepOn]);

  useEffect(() => {
    api.getEngines().then(setEngines).catch(() => setEngines([]));
  }, []);

  const guard = async (work: () => Promise<void>) => {
    setBusy(true);
    onError(null);
    try {
      await work();
    } catch (err) {
      onError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const toggleSummary = () =>
    guard(async () => {
      await api.updateAgent(agent.id, { compaction_summary: !summaryOn });
      onAgentChange({ compaction_summary: !summaryOn });
    });

  const toggleHelper = () =>
    guard(async () => {
      await api.updateAgent(agent.id, { use_helper: !helperAllowed });
      onAgentChange({ use_helper: !helperAllowed });
      await load();
    });

  const toggleUpkeep = () =>
    guard(async () => {
      await api.updateAgent(agent.id, { memory_upkeep: !upkeepOn });
      onAgentChange({ memory_upkeep: !upkeepOn });
    });

  const tidyNow = () =>
    guard(async () => {
      const report = await api.tidyAgentMemory(agent.id);
      setResult(tidyLine(report));
      onNotesChanged();
      await load();
    });

  const change = (patch: Partial<MemorySettings>) =>
    guard(async () => {
      setSettings(await api.saveMemorySettings(patch));
      await load();
    });

  const engine = status?.engine ?? agent.provider;
  const savedModel = settings?.helper_models[engine] ?? "";
  const tidied = status?.last_tidy;
  const noticed = captureLine(status?.last_capture);
  const active = notesOn && upkeepOn;
  const fromEnvironment = settings?.helper_active?.source === "environment";
  return (
    <div className="space-y-3 rounded-card border border-line p-3 text-xs" aria-label="Memory upkeep">
      {showUpkeepSwitch && (
        <SwitchRow checked={upkeepOn} disabled={busy || !notesOn} onChange={() => void toggleUpkeep()} title="Memory upkeep">
          Notices facts when a conversation goes quiet and tidies the notes once a night, with quick calls to this
          agent&apos;s own engine. Every change is in History and can be undone.
          {!notesOn && " Switch the notes on first."}
        </SwitchRow>
      )}
      <SwitchRow checked={summaryOn} disabled={busy} onChange={() => void toggleSummary()} title="Summarize long conversations with a model">
        When a conversation outgrows an engine that replays it (an OpenAI-compatible endpoint), the earlier part is
        summarized by that same engine, with secrets removed first; if the call fails or takes over 20 seconds,
        excerpts are used instead. Off: always excerpts.
      </SwitchRow>
      {active && (
        <>
          {noticed && <p className="text-muted">{noticed}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => void tidyNow()} disabled={busy} loading={busy}>
              Tidy up now
            </Button>
            <span className="text-muted">
              {tidied
                ? `Last tidy-up ${new Date(tidied.at * 1000).toLocaleString()}: ${tidyLine(tidied)}`
                : "Not tidied yet."}
            </span>
          </div>
          {result && <p role="status">{result}</p>}
          <SwitchRow checked={helperAllowed} disabled={busy} onChange={() => void toggleHelper()} title="Allow the helper model for this agent">
            Off: the helper never writes this agent&apos;s texts, whatever is set for all agents below. This covers this
            agent&apos;s own jobs only; what it says in a room becomes part of the other agents&apos; conversations.
          </SwitchRow>

          <fieldset className="min-w-0 space-y-3 rounded-card border border-line p-3">
            <legend className="px-1 text-label font-medium text-ink">{t("agentSettings.memory.allAgents")}</legend>
            <p className="text-muted">{t("agentSettings.memory.allAgentsHint")}</p>
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor={`tidy-hour-${agent.id}`}>Tidy up each night after</label>
              <Select
                id={`tidy-hour-${agent.id}`}
                className="w-36"
                value={settings?.tidy_hour ?? status?.tidy_hour ?? 3}
                disabled={busy || !settings}
                onChange={(e) => void change({ tidy_hour: Number(e.target.value) })}
              >
                {Array.from({ length: 25 }, (_, h) => (
                  <option key={h} value={h}>
                    {tidyHourLabel(h)}
                  </option>
                ))}
              </Select>
              <span className="text-muted">Never while the agent is working.</span>
            </div>
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <label htmlFor={`helper-model-${agent.id}`}>Helper model for {engine}</label>
                <Input
                  id={`helper-model-${agent.id}`}
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="the agent's own model"
                  className="max-w-56"
                />
                <Button
                  size="sm"
                  onClick={() => settings && void change({ helper_models: withHelperModel(settings.helper_models, engine, model) })}
                  disabled={busy || !settings || model.trim() === savedModel}
                >
                  Save model
                </Button>
              </div>
              <p className="text-muted">
                {helperModelLine(status, helperAllowed)}
                {status?.engine_can_call &&
                  " A smaller model is enough. This model is on the engine this agent already uses, so nothing goes to another provider."}
              </p>
            </div>
            <div className="space-y-1 rounded-card border border-line p-2">
              <p className="font-medium">Helper on another provider (off unless you set it)</p>
              <div className="flex flex-wrap items-center gap-2">
                <label htmlFor={`helper-engine-${agent.id}`}>Engine</label>
                <Select
                  id={`helper-engine-${agent.id}`}
                  className="w-56"
                  value={helperEngine}
                  disabled={busy || !settings || fromEnvironment}
                  onChange={(e) => setHelperEngine(e.target.value)}
                >
                  <option value="">None (nothing leaves the agent&apos;s provider)</option>
                  {engines
                    .filter((e) => e.can_write_text)
                    .map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.label}
                      </option>
                    ))}
                </Select>
                <label htmlFor={`helper-engine-model-${agent.id}`}>Model</label>
                <Input
                  id={`helper-engine-model-${agent.id}`}
                  value={helperName}
                  onChange={(e) => setHelperName(e.target.value)}
                  placeholder="its default"
                  disabled={!helperEngine || fromEnvironment}
                  className="max-w-48"
                />
                <Button
                  size="sm"
                  onClick={() => void change(helperChange(helperEngine, helperName))}
                  disabled={
                    busy ||
                    !settings ||
                    fromEnvironment ||
                    (helperEngine === (settings.helper?.engine ?? "") && helperName.trim() === (settings.helper?.model ?? ""))
                  }
                >
                  Save helper
                </Button>
              </div>
              {fromEnvironment && settings?.helper_active && (
                <p className="text-muted">Set by the server&apos;s environment ({settings.helper_active.engine}); change it there.</p>
              )}
              <p className="text-muted">
                Used only for agents whose own engine cannot write the job (Codex and ACP agents): the summary of a long
                conversation and the memory upkeep steps. An agent whose engine can write it always writes it itself.
                With a helper set, <strong>the conversations being read, the notes (secrets removed first) and the history
                being summarized are sent to the helper&apos;s provider</strong>, which may not be this agent&apos;s. Each
                call is listed under Usage.
              </p>
            </div>
            <SwitchRow
              checked={settings?.learn_from_rooms ?? false}
              disabled={busy || !settings}
              onChange={() => settings && void change({ learn_from_rooms: !settings.learn_from_rooms })}
              title="Learn from group chats"
            >
              Off by default. When on, what an agent read and answered in a room can be noticed too: your own lines
              count as yours; another person&apos;s lines give only facts about the shared work and never reach About
              me; another agent&apos;s lines give only an outcome it verified or a decision you agreed to. Entries are
              marked with the room.
            </SwitchRow>
            <SwitchRow
              checked={settings?.keep_cache_warm ?? false}
              disabled={busy || !settings}
              onChange={() => settings && void change({ keep_cache_warm: !settings.keep_cache_warm })}
              title="Keep recent chats fast"
            >
              Off by default. Claude and Codex remember a long chat for only a few minutes, so a chat you left for a
              while is slow and costs more to continue. When on, up to 3 chats you used in the last 2 hours get one
              tiny message every few minutes (it shows in the chat, uses your plan, and never runs while the chat is
              busy). Chats you stop using are left alone after 2 hours.
            </SwitchRow>
          </fieldset>
        </>
      )}
    </div>
  );
}

export function AboutMeTab({
  onError,
  onDirtyChange,
}: {
  onError: (e: string | null) => void;
  // True while the text differs from what was loaded or saved (the page's leave guard).
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [about, setAbout] = useState<AboutMe | null>(null);
  const [text, setText] = useState("");
  const dirty = about !== null && text !== about.text;
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState<{ current: string; hash: string } | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const next = await api.aboutMe();
      setAbout(next);
      setText(next.text);
    } catch (err) {
      onError(errorText(err));
    }
  }, [onError]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const save = async (overwrite = false) => {
    if (!about) return;
    setBusy(true);
    onError(null);
    try {
      const next = await api.saveAboutMe(text, overwrite ? null : about.hash);
      setAbout(next);
      setText(next.text);
      setConflict(null);
      setSaved(next.redacted ? `Saved. ${next.redacted} thing(s) that looked like secrets were replaced.` : "Saved.");
    } catch (err) {
      if (err instanceof ApiError && err.code === "memory_changed") {
        const current = await api.aboutMe();
        setConflict({ current: current.text, hash: current.hash });
      } else onError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    onError(null);
    try {
      const next = await api.removeLearnedFact(id);
      if (about && text === about.text) setText(next.text);
      setAbout(next);
    } catch (err) {
      onError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  if (about === null) return <p className="text-xs text-muted">Loading…</p>;
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted">
        What you want every agent to know about you. All of your agents read it, even one whose notes are off. Agents
        add a line when you tell them something lasting about yourself (never from another person&apos;s words, and
        never from what an agent said); it is background, never an instruction.
      </p>
      <Textarea
        value={text}
        rows={6}
        onChange={(e) => {
          setText(e.target.value);
          setSaved(null);
        }}
        aria-label="About me"
        placeholder={"- I live in Pune\n- I like short answers"}
        className="font-mono"
      />
      <p className="text-xs text-muted">
        {text.length.toLocaleString()} of {about.max_chars.toLocaleString()} characters
      </p>
      {conflict && (
        <div role="alert" className="rounded-card border border-warning/60 p-3 text-xs">
          <p>An agent added to About me while you were editing. Load the new text, or keep yours and overwrite it.</p>
          <div className="mt-2 flex gap-2">
            <Button
              size="sm"
              onClick={() => {
                setAbout({ ...about, text: conflict.current, hash: conflict.hash });
                setText(conflict.current);
                setConflict(null);
              }}
              disabled={busy}
            >
              Load the new text
            </Button>
            <Button size="sm" onClick={() => void save(true)} disabled={busy}>
              Overwrite with mine
            </Button>
          </div>
        </div>
      )}
      {saved && <p className="text-xs text-muted">{saved}</p>}
      <div className="flex gap-2">
        <Button size="sm" onClick={() => void save()} disabled={busy || !dirty} loading={busy}>
          Save About me
        </Button>
        {dirty && (
          <Button size="sm" variant="ghost" onClick={() => setText(about.text)} disabled={busy}>
            Discard
          </Button>
        )}
      </div>
      <div className="space-y-1 border-t border-line pt-2">
        <p className="text-xs font-medium">Added by your agents</p>
        {about.learned.length === 0 ? (
          <p className="text-xs text-muted">Nothing yet.</p>
        ) : (
          <ul className="space-y-1">
            {about.learned.map((fact) => (
              <li key={fact.id} className="flex flex-wrap items-center gap-2 text-xs">
                <span>{fact.text}</span>
                <span className="text-muted">
                  learned by {fact.agent_name || "an agent"} · {new Date(fact.at * 1000).toLocaleDateString()}
                </span>
                <Button size="sm" variant="ghost" onClick={() => void remove(fact.id)} disabled={busy}>
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted">A removed fact is never added again.</p>
      </div>
    </div>
  );
}
