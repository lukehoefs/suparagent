"use client";

// Below an agent's MEMORY.md editor: its topic notes, the notes proposed from
// quiet conversations, and the history of changes with Undo (docs/MEMORY.md).
import { useCallback, useEffect, useState } from "react";
import { api, ApiError, type Agent, type MemoryJournalRow, type MemoryProposal, type TopicDoc, type TopicList } from "@/lib/api";
import { useT } from "@/lib/use-i18n";
import { journalLabel, topicFileName } from "@/lib/memory";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { AboutMeTab, UpkeepCard } from "./MemoryUpkeep";
import { EmptyPanel, ErrorState, LoadingState } from "./PanelState";

type Tab = "topics" | "proposed" | "about" | "history";

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

// Saves here are secondary: the notes editor above holds the view's one primary button.
export function MemoryPanel({
  agent,
  onAgentChange,
  onNotesChanged,
  showUpkeepSwitch = true,
  onDirtyChange,
}: {
  agent: Agent;
  onAgentChange: (patch: Partial<Agent>) => void;
  onNotesChanged: () => void;
  // False where the page shows the memory upkeep switch itself (the agent settings page).
  showUpkeepSwitch?: boolean;
  // True while an open topic note or About me holds unsaved text (the page's leave guard).
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const t = useT();
  const agentId = agent.id;
  const [tab, setTab] = useState<Tab>("topics");
  const [topicDirty, setTopicDirty] = useState(false);
  const [aboutDirty, setAboutDirty] = useState(false);
  const dirty = topicDirty || aboutDirty;
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);
  const [proposed, setProposed] = useState<MemoryProposal[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadProposed = useCallback(async () => {
    try {
      setProposed(await api.memoryProposals(agentId));
    } catch (err) {
      setError(errorText(err));
    }
  }, [agentId]);

  useEffect(() => {
    // Reading the queue also reads any conversation that went quiet since.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadProposed();
  }, [loadProposed]);

  const tabs: { value: Tab; label: string }[] = [
    { value: "topics", label: "Topic notes" },
    { value: "proposed", label: `Proposed${proposed && proposed.length ? ` (${proposed.length})` : ""}` },
    // Every agent reads About me, so it says so here, inside one agent's memory.
    { value: "about", label: t("agentSettings.memory.aboutMeTab") },
    { value: "history", label: "History" },
  ];
  return (
    <section className="space-y-3 border-t border-line pt-3" aria-label="More memory">
      <UpkeepCard agent={agent} onAgentChange={onAgentChange} onError={setError} onNotesChanged={onNotesChanged} showUpkeepSwitch={showUpkeepSwitch} />
      <SegmentedControl value={tab} onChange={setTab} options={tabs} label={t("agentSettings.memory.sections")} className="max-w-full flex-wrap" />
      {error && <ErrorState message={error} />}
      {tab === "topics" && <Topics agentId={agentId} onError={setError} onDirtyChange={setTopicDirty} />}
      {tab === "proposed" && (
        <Proposed
          agentId={agentId}
          items={proposed}
          onError={setError}
          onDone={() => {
            void loadProposed();
            onNotesChanged();
          }}
        />
      )}
      {tab === "about" && <AboutMeTab onError={setError} onDirtyChange={setAboutDirty} />}
      {tab === "history" && <History agentId={agentId} onError={setError} onUndone={onNotesChanged} />}
    </section>
  );
}

type Open = { doc: TopicDoc; text: string; conflict: boolean; saved: string | null };

function Topics({
  agentId,
  onError,
  onDirtyChange,
}: {
  agentId: number;
  onError: (e: string | null) => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const t = useT();
  const [list, setList] = useState<TopicList | null>(null);
  const [open, setOpen] = useState<Open | null>(null);
  const openDirty = open !== null && open.text !== open.doc.text;
  useEffect(() => { onDirtyChange(openDirty); }, [openDirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setList(await api.listTopics(agentId));
    } catch (err) {
      onError(errorText(err));
    }
  }, [agentId, onError]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  const openTopic = async (name: string) => {
    onError(null);
    try {
      const doc = await api.getTopic(agentId, name);
      setOpen({ doc, text: doc.text, conflict: false, saved: null });
    } catch (err) {
      onError(errorText(err));
    }
  };

  const create = async () => {
    const name = topicFileName(newName);
    if (!name) {
      onError("Give the topic a name with letters or digits, for example travel.");
      return;
    }
    setNewName("");
    await openTopic(name);
  };

  const save = async (overwrite = false) => {
    if (!open) return;
    setBusy(true);
    onError(null);
    try {
      const doc = await api.saveTopic(agentId, open.doc.name, open.text, overwrite ? null : open.doc.hash);
      const saved = doc.redacted > 0 ? `Saved. ${doc.redacted} thing(s) that looked like secrets were replaced.` : "Saved.";
      setOpen({ doc, text: doc.text, conflict: false, saved });
      await refresh();
    } catch (err) {
      if (err instanceof ApiError && err.code === "memory_changed") setOpen({ ...open, conflict: true, saved: null });
      else onError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!open) return;
    setBusy(true);
    try {
      await api.deleteTopic(agentId, open.doc.name);
      setOpen(null);
      await refresh();
    } catch (err) {
      onError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  if (open) {
    const dirty = open.text !== open.doc.text;
    return (
      <div className="space-y-2">
        <p className="text-xs text-muted">
          <span className="font-mono">memory/{open.doc.name}</span>
          {open.doc.exists ? "" : " (new)"} · not loaded whole: the agent reads it when relevant, and matching passages
          are recalled in front of a message. Start with front matter (<span className="font-mono">title:</span>,{" "}
          <span className="font-mono">aliases:</span>) to give other words for the subject.
        </p>
        <Textarea
          value={open.text}
          rows={10}
          onChange={(e) => setOpen({ ...open, text: e.target.value, saved: null })}
          aria-label={`Topic note ${open.doc.name}`}
          placeholder={"---\ntitle: Travel\naliases: [trips, flights]\n---\n- Prefers aisle seats"}
          className="font-mono"
        />
        {open.conflict && (
          <div role="alert" className="rounded-card border border-warning/60 p-3 text-xs">
            <p>{t("agentTeam.topicNotesConflict")}</p>
            <div className="mt-2 flex gap-2">
              <Button size="sm" onClick={() => void openTopic(open.doc.name)} disabled={busy}>
                Load its version
              </Button>
              <Button size="sm" onClick={() => void save(true)} disabled={busy}>
                Overwrite with mine
              </Button>
            </div>
          </div>
        )}
        {open.saved && <p className="text-xs text-muted">{open.saved}</p>}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => void save(false)} disabled={busy || !dirty} loading={busy}>
            Save topic
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setOpen(null)} disabled={busy}>
            {dirty ? "Discard" : "Back to topics"}
          </Button>
          {open.doc.exists && (
            <Button size="sm" variant="ghost" onClick={() => void remove()} disabled={busy}>
              Delete (History can bring it back)
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted">
        {t("agentTeam.topicListGuidance", { folder: list?.folder ?? "memory/" })}
      </p>
      {list === null ? (
        <LoadingState rows={3} />
      ) : list.topics.length === 0 ? (
        <EmptyPanel title={t("agentTeam.topicsEmptyTitle")} description={t("agentTeam.topicsEmptyDescription")} />
      ) : (
        <ul className="space-y-1">
          {list.topics.map((t) => (
            <li key={t.name}>
              <button onClick={() => openTopic(t.name)} className="text-left text-sm hover:underline">
                <span className="font-mono">{t.name}</span>
                {t.title && <span className="text-muted"> — {t.title}</span>}
                <span className="text-xs text-muted"> · {Math.max(1, Math.round(t.bytes / 1024))} KB</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void create();
          }}
          placeholder="New topic, e.g. travel"
          aria-label="New topic name"
        />
        <Button onClick={() => void create()} disabled={!newName.trim()}>
          New topic
        </Button>
      </div>
    </div>
  );
}

function Proposed({
  agentId,
  items,
  onError,
  onDone,
}: {
  agentId: number;
  items: MemoryProposal[] | null;
  onError: (e: string | null) => void;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const decide = async (p: MemoryProposal, accept: boolean) => {
    setBusy(p.id);
    onError(null);
    try {
      if (accept) await api.acceptProposal(agentId, p.id);
      else await api.rejectProposal(agentId, p.id);
      onDone();
    } catch (err) {
      onError(errorText(err));
    } finally {
      setBusy(null);
    }
  };
  if (items === null) return <LoadingState rows={3} />;
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted">
        Lines picked from your own messages once a conversation has been quiet for two minutes. Nothing is saved until
        you accept it; a rejected line is not proposed again.
      </p>
      {items.length === 0 ? (
        <p className="text-xs text-muted">Nothing proposed right now.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((p) => (
            <li key={p.id} className="rounded-card border border-line p-2 text-sm">
              <p className="font-mono text-xs break-words">{p.line}</p>
              <p className="mt-1 text-xs text-muted">
                From “{p.thread_title || "a conversation"}” · would go to {p.target}
              </p>
              <div className="mt-2 flex gap-2">
                <Button size="sm" onClick={() => void decide(p, true)} disabled={busy !== null} loading={busy === p.id}>
                  Accept
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void decide(p, false)} disabled={busy !== null}>
                  Reject
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function History({
  agentId,
  onError,
  onUndone,
}: {
  agentId: number;
  onError: (e: string | null) => void;
  onUndone: () => void;
}) {
  const [rows, setRows] = useState<MemoryJournalRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [shown, setShown] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setRows(await api.memoryJournal(agentId));
    } catch (err) {
      onError(errorText(err));
    }
  }, [agentId, onError]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  const undo = async (row: MemoryJournalRow) => {
    setBusy(row.id);
    onError(null);
    try {
      await api.undoMemoryChange(agentId, row.id);
      await refresh();
      onUndone();
    } catch (err) {
      onError(errorText(err));
    } finally {
      setBusy(null);
    }
  };

  if (rows === null) return <LoadingState rows={3} />;
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted">
        Changes made here, by accepted proposals and by undo. Undo puts a file back the way it was before that change.
        Edits the agent makes with its own file tools are not listed.
      </p>
      {rows.length === 0 ? (
        <EmptyPanel title="No changes yet" description="Accepted proposals and undo actions are listed here." />
      ) : (
        <ul className="space-y-1">
          {rows.map((row) => (
            <li key={row.id} className="text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span>{journalLabel(row)}</span>
                <span className="text-muted">{new Date(row.at).toLocaleString()}</span>
                {row.diff && (
                  <button onClick={() => setShown(shown === row.id ? null : row.id)} className="underline">
                    {shown === row.id ? "Hide" : "Diff"}
                  </button>
                )}
                {row.can_undo ? (
                  <Button size="sm" onClick={() => void undo(row)} disabled={busy !== null} loading={busy === row.id}>
                    Undo
                  </Button>
                ) : (
                  <span className="text-muted" title={row.reason ?? ""}>
                    cannot be undone
                  </span>
                )}
              </div>
              {shown === row.id && (
                <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-inset p-2 font-mono">
                  {row.diff}
                </pre>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
