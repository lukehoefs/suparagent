"use client";

// An agent's SOUL.md: the person writes who the agent is; the tools section below is kept up to date by
// the app whenever tools are granted or removed. Saving only ever changes the person's part.
import { useCallback, useEffect, useState } from "react";
import { api, type Agent, type AgentSoul } from "@/lib/api";

const FIELD =
  "w-full rounded-md border border-line bg-transparent px-3 py-2 text-sm leading-relaxed placeholder:text-muted";
const BUTTON =
  "cursor-pointer rounded-md border border-line px-3 py-1.5 text-sm font-medium hover:bg-hover disabled:cursor-not-allowed disabled:opacity-50";
const PRIMARY =
  "cursor-pointer rounded-md px-4 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 bg-accent text-accent-fg hover:opacity-90";

const STARTER = (name: string) =>
  `# Soul of ${name}\n\n## Role\n${name} is …\n\n## Voice\n- Direct, friendly, concise.\n\n## Rules\n- Ask before sending, publishing, buying or deleting anything.\n`;

function toolCount(managed: string): number {
  return managed.split("\n").filter((line) => line.trim().startsWith("- `")).length;
}

export function SoulPanel({ agent }: { agent: Agent }) {
  const [soul, setSoul] = useState<AgentSoul | null>(null);
  const [mine, setMine] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    try {
      const doc = await api.getSoul(agent.id);
      setSoul(doc);
      setMine(doc.mine);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load SOUL.md.");
    }
  }, [agent.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const dirty = soul !== null && mine !== soul.mine;
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const doc = await api.saveSoul(agent.id, mine);
      setSoul(doc);
      setMine(doc.mine);
      setSavedAt(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save SOUL.md.");
    } finally {
      setBusy(false);
    }
  };

  const tools = soul ? toolCount(soul.managed) : 0;
  return (
    <section aria-label="Soul" className="space-y-3 border-t border-line pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Soul</h3>
        <span className="rounded-full border border-line px-2 py-0.5 text-xs text-muted">
          {tools === 1 ? "1 tool" : `${tools} tools`} granted
        </span>
      </div>
      <p className="text-xs text-muted">
        Who {agent.name} is: role, voice and standing rules. Loaded into every conversation. The tools list below
        updates automatically when you grant or remove tools.
      </p>
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
      {soul === null ? (
        <p className="text-xs text-muted">Loading…</p>
      ) : (
        <>
          <textarea
            className={`${FIELD} min-h-48 font-mono text-[13px]`}
            value={mine}
            onChange={(event) => setMine(event.target.value)}
            placeholder={`Describe ${agent.name}: its role, how it talks, and what it must never do.`}
            aria-label={`${agent.name}'s soul`}
          />
          <div className="flex flex-wrap items-center gap-2">
            <button className={PRIMARY} onClick={save} disabled={busy || !dirty}>{busy ? "Saving…" : "Save soul"}</button>
            {dirty && <button className={BUTTON} onClick={() => setMine(soul.mine)} disabled={busy}>Discard</button>}
            {!mine.trim() && (
              <button className={BUTTON} onClick={() => setMine(STARTER(agent.name))} disabled={busy}>Use a starter</button>
            )}
            {savedAt && !dirty && <span className="text-xs text-muted">Saved {savedAt.toLocaleTimeString()}</span>}
          </div>
          <details className="rounded-md border border-line bg-inset/50 p-3" open={tools > 0}>
            <summary className="cursor-pointer text-xs font-medium">Tools you can use · managed automatically</summary>
            <pre className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-muted">{soul.managed || "No tools yet."}</pre>
          </details>
        </>
      )}
    </section>
  );
}
