"use client";

import { Check, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api, ApiError, type ApprovalScope } from "@/lib/api";
import { allowAllNoteFor, type AllowAllResult } from "@/lib/approval-card";
import { approvalShortcut } from "@/lib/chat-state";
import type { TranscriptItem } from "@/lib/transcript";
import { can } from "@/lib/permissions";
import { useT } from "@/lib/use-i18n";
import { useSession } from "@/components/AuthGate";
import { Banner } from "@/components/ui/Banner";
import { ApprovalRequest } from "./items";

type Approval = Extract<TranscriptItem, { kind: "approval" }>;

// The waiting approval, docked above the composer (design: Chat.html). One question at a time,
// oldest first, with "1 of 2" when more wait and "Allow all 2" beside the answers. "Allow all" names
// the calls it counted, so one that arrives after the card was drawn still asks. A allows once and
// D denies while the person is not typing; every answer still goes through the same call as the
// buttons, and nothing can be answered twice while an answer is on its way. When nothing waits and
// the last call was answered on another device, the slot says so (design: States, "Approval:
// already answered"), until it is dismissed or another call asks.
export function DockedApproval({
  approvals,
  agentName,
  threadId,
  answering,
  errors,
  onAnswer,
  onAnswering,
  elsewhere = null,
}: {
  approvals: Approval[];
  agentName?: string | null;
  // The conversation they wait in; "Allow all" needs it.
  threadId: number | null;
  // The approval id being answered right now, if any.
  answering: string | null;
  errors: Record<string, string>;
  onAnswer: (approvalId: string, decision: "allow" | "deny", scope?: ApprovalScope) => void;
  // Called with the calls "Allow all" is about to answer, so the page knows they were answered here.
  onAnswering?: (approvalIds: string[]) => void;
  // "Allowed by Luke on another device.", shown while no call waits.
  elsewhere?: { text: string; allowed: boolean; onDismiss: () => void } | null;
}) {
  const t = useT();
  const { session } = useSession();
  const mayAnswer = can(session?.permissions, "approve");
  const current = approvals[0] ?? null;
  const [allowingAll, setAllowingAll] = useState(false);
  const [allResult, setAllResult] = useState<AllowAllResult | null>(null);
  const [allError, setAllError] = useState<string | null>(null);
  const busy = answering !== null || allowingAll;
  // The latest values for the key listener, which is attached once.
  const latest = useRef({ current, busy, onAnswer, mayAnswer });
  useEffect(() => {
    latest.current = { current, busy, onAnswer, mayAnswer };
  });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const { current: item, busy: waiting, onAnswer: answer, mayAnswer: allowed } = latest.current;
      if (!item || waiting || !allowed || event.defaultPrevented) return;
      const decision = approvalShortcut({
        key: event.key,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
        shiftKey: event.shiftKey,
        repeat: event.repeat,
        target: event.target as HTMLElement | null,
      });
      if (!decision) return;
      event.preventDefault();
      setAllResult(null);
      setAllError(null);
      answer(item.approvalId, decision);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const allowAll = async () => {
    if (threadId === null || busy) return;
    const ids = approvals.map((approval) => approval.approvalId);
    onAnswering?.(ids);
    setAllowingAll(true);
    setAllError(null);
    setAllResult(null);
    try {
      setAllResult({ thread: threadId, ids, answer: await api.allowAllThreadApprovals(threadId, ids) });
    } catch (err) {
      setAllError(err instanceof ApiError ? err.message : t("approvalCard.allowAllError"));
    } finally {
      setAllowingAll(false);
    }
  };

  // What the last "Allow all" left for its own answer, said only on a card it left.
  const note = allowAllNoteFor(allResult, threadId, current?.approvalId ?? null);
  if (!current) {
    if (!elsewhere) return null;
    return (
      <Banner
        tone="info"
        icon={elsewhere.allowed ? <Check size={14} strokeWidth={1.7} /> : <X size={14} strokeWidth={1.7} />}
        onDismiss={elsewhere.onDismiss}
        className="mb-2.5"
      >
        {elsewhere.text}
      </Banner>
    );
  }
  return (
    <div className="mb-2.5">
      <ApprovalRequest
        key={current.approvalId}
        item={current}
        agentName={agentName}
        answering={busy}
        error={errors[current.approvalId] ?? allError}
        onAnswer={(decision, scope) => {
          setAllResult(null);
          setAllError(null);
          onAnswer(current.approvalId, decision, scope);
        }}
        position={{ n: 1, total: approvals.length }}
        shortcuts={mayAnswer}
        onAllowAll={threadId !== null ? () => void allowAll() : undefined}
        note={note ? t(note.key, note.params) : null}
      />
    </div>
  );
}
