"use client";

import { useEffect, useRef } from "react";
import { approvalShortcut } from "@/lib/chat-state";
import type { TranscriptItem } from "@/lib/transcript";
import { can } from "@/lib/permissions";
import { useSession } from "@/components/AuthGate";
import { ApprovalRequest } from "./items";

type Approval = Extract<TranscriptItem, { kind: "approval" }>;

// The waiting approval, docked above the composer (design: Chat.html). One question at a time,
// oldest first, with "1 of 2" when more wait. A allows and D denies while the person is not typing;
// every answer still goes through the same call as the buttons.
export function DockedApproval({
  approvals,
  agentName,
  answering,
  errors,
  onAnswer,
}: {
  approvals: Approval[];
  agentName?: string | null;
  // The approval id being answered right now, if any.
  answering: string | null;
  errors: Record<string, string>;
  onAnswer: (approvalId: string, decision: "allow" | "deny", remember?: boolean) => void;
}) {
  const { session } = useSession();
  const mayAnswer = can(session?.permissions, "approve");
  const current = approvals[0] ?? null;
  // The latest values for the key listener, which is attached once.
  const latest = useRef({ current, answering, onAnswer, mayAnswer });
  useEffect(() => {
    latest.current = { current, answering, onAnswer, mayAnswer };
  });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const { current: item, answering: busy, onAnswer: answer, mayAnswer: allowed } = latest.current;
      if (!item || busy !== null || !allowed || event.defaultPrevented) return;
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
      answer(item.approvalId, decision);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!current) return null;
  return (
    <div className="mb-2.5">
      <ApprovalRequest
        key={current.approvalId}
        item={current}
        agentName={agentName}
        answering={answering === current.approvalId}
        error={errors[current.approvalId] ?? null}
        onAnswer={(decision, remember) => onAnswer(current.approvalId, decision, remember)}
        position={{ n: 1, total: approvals.length }}
        shortcuts={mayAnswer}
      />
    </div>
  );
}
