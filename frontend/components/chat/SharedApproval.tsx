"use client";

import { useState } from "react";
import { api, ApiError, type ApprovalScope } from "@/lib/api";
import { parseRisk, parseScopes } from "@/lib/approval-card";
import type { SharedApproval as Approval } from "@/lib/collaboration";
import { useT } from "@/lib/use-i18n";
import { ApprovalCard } from "./items";

// A waiting approval shown where a room, a team job or a routine lists it: the same card as the
// docked one, with the same answers (an allow for an hour or for good applies in the conversation
// the call was made in).
export function SharedApproval({ approval, onChanged }: { approval: Approval; onChanged: () => void }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const answer = async (decision: "allow" | "deny", scope: ApprovalScope = "once") => {
    setBusy(true); setError(null);
    try { await api.answerThreadApproval(approval.thread_id, approval.id, decision, false, scope); onChanged(); }
    catch (err) { setError(err instanceof ApiError ? err.message : t("approvalCard.answerError")); onChanged(); }
    finally { setBusy(false); }
  };
  return (
    <ApprovalCard
      item={{
        kind: "approval", key: approval.id, turnId: approval.turn_id, approvalId: approval.id, tool: approval.tool,
        approvalKind: approval.kind ?? "other", summary: approval.summary ?? approval.tool, input: approval.input,
        status: approval.status, resolvedBy: "", ruleId: null, toolSummary: approval.tool_summary ?? null,
        risk: parseRisk(approval.risk), scopes: parseScopes(approval.scopes),
      }}
      answering={busy}
      error={error}
      onAnswer={(decision, scope) => void answer(decision, scope)}
    />
  );
}
