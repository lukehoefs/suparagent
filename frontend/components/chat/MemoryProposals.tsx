"use client";

// Notes proposed from quiet conversations (docs/MEMORY.md), waiting for the person: accept as it
// is, reject, or edit the line first and choose where it goes (the notes, or a topic note, new or
// existing). Only what was changed is sent; nothing is saved until Accept.
import { useCallback, useState } from "react";
import { api, type MemoryProposal } from "@/lib/api";
import { NEW_TOPIC, NOTES_FILE, proposalAcceptance, proposalTargets } from "@/lib/agent-automation";
import { useT } from "@/lib/use-i18n";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Input";
import { LoadingState } from "./PanelState";

type Draft = { id: string; line: string; target: string; newTopic: string; problem: string | null };

const REASON_KEY = {
  empty_line: "agentAutomation.proposals.emptyLine",
  too_long: "agentAutomation.proposals.tooLong",
  bad_topic: "agentAutomation.proposals.badTopic",
} as const;

export function MemoryProposals({
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
  const t = useT();
  const errorText = useCallback((err: unknown) => (err instanceof Error && err.message ? err.message : t("agentAutomation.failed")), [t]);
  const [busy, setBusy] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  // Topic notes to offer as a destination; read when the first edit opens.
  const [topics, setTopics] = useState<{ name: string }[] | null>(null);

  // In the sentence ("would go to the notes") and as a choice in the list ("Notes (MEMORY.md)").
  const targetLabel = (target: string) =>
    target === NOTES_FILE ? t("agentAutomation.proposals.toNotes") : t("agentAutomation.proposals.toTopic", { name: target });
  const targetOption = (target: string) =>
    target === NOTES_FILE ? t("agentAutomation.proposals.optionNotes") : t("agentAutomation.proposals.optionTopic", { name: target });

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

  const edit = (p: MemoryProposal) => {
    onError(null);
    setDraft({ id: p.id, line: p.line, target: p.target, newTopic: "", problem: null });
    if (topics === null) {
      // Without the list the notes, the proposal's own target and a new topic are still offered.
      api.listTopics(agentId).then((list) => setTopics(list.topics)).catch(() => setTopics([]));
    }
  };

  const acceptEdited = async (p: MemoryProposal) => {
    if (!draft) return;
    const result = proposalAcceptance(p, draft.line, draft.target, draft.newTopic);
    if (!result.ok) {
      setDraft({ ...draft, problem: t(REASON_KEY[result.reason]) });
      return;
    }
    setBusy(p.id);
    setDraft({ ...draft, problem: null });
    try {
      await api.acceptProposalAs(agentId, p.id, result.change);
      setDraft(null);
      onDone();
    } catch (err) {
      setDraft((current) => (current && current.id === p.id ? { ...current, problem: errorText(err) } : current));
    } finally {
      setBusy(null);
    }
  };

  if (items === null) return <LoadingState rows={3} />;
  return (
    <div className="space-y-2">
      <p className="text-small text-muted">{t("agentAutomation.proposals.intro")}</p>
      {items.length === 0 ? (
        <p className="text-small text-muted">{t("agentAutomation.proposals.empty")}</p>
      ) : (
        <ul className="space-y-2">
          {items.map((p) => {
            const editing = draft?.id === p.id ? draft : null;
            const targets = proposalTargets(topics ?? [], p.target);
            return (
              <li key={p.id} className="rounded-card border border-line p-3">
                {editing ? (
                  <div className="space-y-3">
                    <Field label={t("agentAutomation.proposals.lineLabel")} hint={t("agentAutomation.proposals.lineHint")}>
                      {(props) => (
                        <Textarea
                          {...props}
                          rows={2}
                          value={editing.line}
                          onChange={(e) => setDraft({ ...editing, line: e.target.value, problem: null })}
                          className="font-mono"
                        />
                      )}
                    </Field>
                    <Field label={t("agentAutomation.proposals.targetLabel")} hint={t("agentAutomation.proposals.targetHint")}>
                      {(props) => (
                        <Select
                          {...props}
                          value={editing.target}
                          onChange={(e) => setDraft({ ...editing, target: e.target.value, problem: null })}
                          options={[
                            ...targets.map((target) => ({ value: target, label: targetOption(target) })),
                            { value: NEW_TOPIC, label: t("agentAutomation.proposals.newTopic") },
                          ]}
                        />
                      )}
                    </Field>
                    {editing.target === NEW_TOPIC && (
                      <Field label={t("agentAutomation.proposals.topicName")} hint={t("agentAutomation.proposals.topicNameHint")}>
                        {(props) => (
                          <Input
                            {...props}
                            value={editing.newTopic}
                            maxLength={80}
                            placeholder={t("agentAutomation.proposals.topicPlaceholder")}
                            onChange={(e) => setDraft({ ...editing, newTopic: e.target.value, problem: null })}
                          />
                        )}
                      </Field>
                    )}
                    {editing.problem && <Banner tone="danger">{editing.problem}</Banner>}
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" onClick={() => void acceptEdited(p)} disabled={busy !== null} loading={busy === p.id}>
                        {t("agentAutomation.proposals.accept")}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setDraft(null)} disabled={busy === p.id}>
                        {t("common.cancel")}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="break-words font-mono text-small text-ink">{p.line}</p>
                    <p className="mt-1 text-small text-muted">
                      {t("agentAutomation.proposals.from", {
                        title: p.thread_title || t("agentAutomation.proposals.aConversation"),
                        target: targetLabel(p.target),
                      })}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button size="sm" onClick={() => void decide(p, true)} disabled={busy !== null} loading={busy === p.id}>
                        {t("agentAutomation.proposals.accept")}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => edit(p)} disabled={busy !== null}>
                        {t("agentAutomation.proposals.edit")}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => void decide(p, false)} disabled={busy !== null}>
                        {t("agentAutomation.proposals.reject")}
                      </Button>
                    </div>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
