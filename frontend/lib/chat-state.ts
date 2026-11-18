// The chat's three states and the approval card's rules, with no runtime imports so node tests can load them.
// The header pill, the status line and the composer button all read chatState, so they always agree.

export type ChatState = "waiting" | "working" | "idle";

/** Waiting for you outranks working: a turn that asks for approval is still running, but only the person can move it on. */
export function chatState({ running, waiting }: { running: boolean; waiting: boolean }): ChatState {
  if (waiting) return "waiting";
  if (running) return "working";
  return "idle";
}

/** What a tool does, from the approval's kind (set by the engine adapter). Unknown kinds say so rather than guess. */
export type ApprovalEffect = "read" | "screen_read" | "command" | "write" | "screen_input" | "other";

export function approvalEffect(kind: string | null | undefined): ApprovalEffect {
  switch (kind) {
    case "file_read":
      return "read";
    case "screen_read":
      return "screen_read";
    case "command":
      return "command";
    case "file_write":
      return "write";
    case "screen_input":
      return "screen_input";
    default:
      return "other";
  }
}

/** Only reading leaves everything as it was; that is the one effect shown as "Read-only". */
export function isReadOnly(effect: ApprovalEffect): boolean {
  return effect === "read" || effect === "screen_read";
}

/** The short pill on a decided approval. Keys are i18n message keys. `reach` is how far a
 * person's allow reached ("hour", "thread"), or which conversation allow decided it. */
export function decidedPill(
  status: string,
  resolvedBy: string,
  reach: "hour" | "thread" | null = null,
): { tone: "done" | "denied" | "idle"; key: string } {
  if (status === "allowed") {
    if (resolvedBy === "saved_rule") return { tone: "done", key: "approval.pill.byRule" };
    if (resolvedBy === "scoped_rule") return { tone: "done", key: "approvalCard.pill.byChatAllow" };
    if (!resolvedBy && reach === "hour") return { tone: "done", key: "approvalCard.pill.allowedHour" };
    if (!resolvedBy && reach === "thread") return { tone: "done", key: "approvalCard.pill.allowedChat" };
    if (resolvedBy === "computer_read" || resolvedBy === "accept_edits" || resolvedBy === "routine_uninterrupted_grant") {
      return { tone: "done", key: "approval.pill.auto" };
    }
    return { tone: "done", key: "approval.pill.allowedOnce" };
  }
  if (status === "denied") {
    if (resolvedBy === "plan_mode") return { tone: "denied", key: "approval.planRefused" };
    // Refused by the app, not by a person: someone holds the agent's cloud computer.
    if (resolvedBy === "human_control") return { tone: "denied", key: "approvalCard.pill.youHaveControl" };
    return { tone: "denied", key: "approval.denied" };
  }
  if (status === "expired") return { tone: "idle", key: "approval.pill.expired" };
  return { tone: "idle", key: "approval.pill.cancelled" };
}

type KeyTarget = { tagName?: string; isContentEditable?: boolean; closest?: (selector: string) => unknown } | null;

/** True while the person is typing somewhere, so A and D stay letters there. */
export function isTypingTarget(target: KeyTarget): boolean {
  if (!target) return false;
  if (target.isContentEditable) return true;
  const tag = (target.tagName ?? "").toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select";
}

/** A press of A allows and D denies, with no modifier, not repeated, not while typing, inside a
 * dialog or on a remote computer's screen (its keys are for the computer). */
export function approvalShortcut(event: {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  repeat?: boolean;
  target: KeyTarget;
}): "allow" | "deny" | null {
  if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || event.repeat) return null;
  if (isTypingTarget(event.target)) return null;
  if (event.target?.closest?.('[role="dialog"], [role="menu"], [role="listbox"], [role="application"], [data-remote-screen]')) return null;
  const key = event.key.toLowerCase();
  if (key === "a") return "allow";
  if (key === "d") return "deny";
  return null;
}
