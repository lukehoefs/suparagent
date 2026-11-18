"use client";

import { Check, ChevronDown, ChevronRight, Copy, GitBranch, Loader2, Square, ThumbsDown, ThumbsUp, Wrench, X } from "lucide-react";
import type { ReactionKind } from "@/lib/reactions";
import { Fragment, useState } from "react";
import { isScreenInput } from "@/lib/approvals";
import type { ApprovalScope } from "@/lib/api";
import { aboutSentence, extraAnswers, reachNoteKey, riskTag, scopeIsExact, showAllowAll, toolDisplayName } from "@/lib/approval-card";
import { can } from "@/lib/permissions";
import { isComputerTool, toolLabel } from "@/lib/computers";
import { cn } from "@/lib/cn";
import { failureNextStep, interruptedText, turnUsageText } from "@/lib/everyday";
import { compactedLabel, recalledLabel } from "@/lib/memory";
import type { TranscriptItem } from "@/lib/transcript";
import { useT } from "@/lib/use-i18n";
import { toolRunSummary } from "@/lib/transcript-view";
import { Button } from "@/components/ui/Button";
import { StatusPill, StatusText } from "@/components/ui/StatusPill";
import { decidedPill } from "@/lib/chat-state";
import { useSession } from "../AuthGate";
import { Markdown } from "./Markdown";
import { copyToClipboard } from "@/lib/clipboard";
import { MessageAttachments } from "./Attachments";
import { canBranchFrom } from "@/lib/branch-link";
import { formatDateDivider, formatMessageTime } from "@/lib/relative-time";
export { formatDateDivider, formatMessageTime };

type Item<K extends TranscriptItem["kind"]> = Extract<TranscriptItem, { kind: K }>;

// A value is shown exactly as it will be used, so a person approves what runs:
// strings verbatim (a command, file contents), anything else as JSON.
function formatValue(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

const PREVIEW_CHARS = 4000;

// Long tool output is cut for display so one big result cannot swamp the page.
function LongText({ value }: { value: string }) {
  const [all, setAll] = useState(false);
  const cut = !all && value.length > PREVIEW_CHARS;
  return (
    <>
      <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-field bg-code p-2.5 font-mono text-xs text-ink">
        {cut ? value.slice(0, PREVIEW_CHARS) : value}
      </pre>
      {cut && (
        <button onClick={() => setAll(true)} className="mt-1 cursor-pointer text-xs text-muted underline">
          Show all ({value.length.toLocaleString()} characters)
        </button>
      )}
    </>
  );
}

export function DateDivider({ ts }: { ts: string }) {
  const t = useT();
  const label = formatDateDivider(ts, t);
  if (!label) return null;
  return (
    <div className="relative my-3 flex items-center justify-center select-none" role="separator" aria-label={label}>
      <div className="absolute inset-0 flex items-center" aria-hidden="true">
        <div className="w-full border-t border-line/60" />
      </div>
      <span className="relative rounded-full border border-line bg-surface px-2.5 py-0.5 text-[11px] font-medium text-muted shadow-2xs">
        {label}
      </span>
    </div>
  );
}

function CopyButton({ text, className }: { text: string; className?: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const copy = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const label = copied ? t("chat.copied") : t("chat.copy");
  return (
    <button
      type="button"
      onClick={copy}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex size-7 cursor-pointer items-center justify-center rounded-field text-muted transition-colors hover:bg-hover hover:text-ink touch:size-10",
        copied && "opacity-100 text-success",
        className,
      )}
    >
      {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
    </button>
  );
}

export function UserMessage({
  item,
  threadId = null,
  onBranch,
}: {
  item: Item<"user">;
  threadId?: number | null;
  // Edit this message and resend it in a new branch; resolves false on failure.
  onBranch?: (turnId: number, text: string) => Promise<boolean>;
}) {
  const t = useT();
  const timeStr = formatMessageTime(item.ts, t);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.text);
  const [busy, setBusy] = useState(false);
  const canBranch = onBranch !== undefined && canBranchFrom(item);
  if (editing && canBranch) {
    const submit = async () => {
      if (!draft.trim() || busy) return;
      setBusy(true);
      const ok = await onBranch(item.turnId as number, draft);
      setBusy(false);
      if (ok) setEditing(false);
    };
    return (
      <div className="flex flex-col items-end gap-2">
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={Math.min(8, Math.max(2, draft.split("\n").length))}
          aria-label={t("branch.edit")}
          className="w-full max-w-[88%] rounded-2xl border border-line bg-surface px-4 py-2.5 text-[15px] leading-relaxed text-ink sm:max-w-[80%]"
        />
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => { setEditing(false); setDraft(item.text); }} disabled={busy}>
            {t("branch.cancel")}
          </Button>
          <Button onClick={submit} disabled={busy || !draft.trim()}>
            {t("branch.send")}
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div className="group/msg flex flex-col items-end gap-1">
      <MessageAttachments threadId={threadId} items={item.attachments ?? []} />
      <div className="flex max-w-[88%] items-end gap-1.5 sm:max-w-[78%]">
        {item.text && <CopyButton text={item.text} />}
        {canBranch && (
          <button
            type="button"
            onClick={() => { setDraft(item.text); setEditing(true); }}
            aria-label={t("branch.edit")}
            title={t("branch.edit")}
            className="mb-1 shrink-0 rounded-md p-1 text-muted/60 opacity-0 transition hover:text-ink focus-visible:opacity-100 group-hover/msg:opacity-100"
          >
            <GitBranch size={14} aria-hidden="true" />
          </button>
        )}
        <p className="min-w-0 whitespace-pre-wrap break-words rounded-[20px] bg-bubble px-4 py-2.5 text-body text-ink">
          {item.text}
        </p>
      </div>
      {(timeStr || item.person) && (
        <time
          dateTime={item.ts ?? undefined}
          title={item.ts ? new Date(item.ts).toLocaleString() : undefined}
          className="select-none px-1 text-[11px] text-muted/70 font-normal"
        >
          {[item.person, timeStr].filter(Boolean).join(" · ")}
        </time>
      )}
      {item.skills && item.skills.length > 0 && (
        <p className="max-w-[88%] break-words text-xs text-muted sm:max-w-[80%]">
          Skill: <span className="font-mono">{item.skills.map((name) => `/${name}`).join(" ")}</span>
        </p>
      )}
    </div>
  );
}

export function AssistantMessage({
  text,
  incomplete = false,
  live = false,
  ts = null,
  reaction = null,
  onReact,
  disabled = false,
  threadId = null,
  workspacePath = null,
}: {
  text: string;
  incomplete?: boolean;
  live?: boolean;
  ts?: string | null;
  reaction?: ReactionKind | null;
  onReact?: (reaction: ReactionKind) => void;
  disabled?: boolean;
  threadId?: number | null;
  workspacePath?: string | null;
}) {
  const t = useT();
  const timeStr = formatMessageTime(ts, t);
  return (
    <div className="group/msg max-w-full text-body">
      <Markdown text={text} threadId={live ? null : threadId} workspacePath={live ? null : workspacePath} />
      {live && <span aria-hidden="true" className="animate-pulse text-muted motion-reduce:animate-none">▍</span>}
      {!live && text && (
        <div className="-ml-1 mt-1 flex flex-wrap items-center gap-1.5">
          <CopyButton text={text} />
          {onReact && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onReact("thumbs_up")}
                disabled={disabled}
                aria-label={t("chat.reaction.replyThumbsUp")}
                aria-pressed={reaction === "thumbs_up"}
                title={t("chat.reaction.replyThumbsUp")}
                className={cn(
                  "inline-flex size-7 cursor-pointer items-center justify-center rounded-field text-xs transition-colors",
                  reaction === "thumbs_up"
                    ? "bg-success/20 text-success font-medium"
                    : "text-muted hover:bg-hover hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
                )}
              >
                <ThumbsUp size={14} aria-hidden="true" className={reaction === "thumbs_up" ? "fill-current" : undefined} />
              </button>
              <button
                type="button"
                onClick={() => onReact("thumbs_down")}
                disabled={disabled}
                aria-label={t("chat.reaction.replyThumbsDown")}
                aria-pressed={reaction === "thumbs_down"}
                title={t("chat.reaction.replyThumbsDown")}
                className={cn(
                  "inline-flex size-7 cursor-pointer items-center justify-center rounded-field text-xs transition-colors",
                  reaction === "thumbs_down"
                    ? "bg-danger/20 text-danger font-medium"
                    : "text-muted hover:bg-hover hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
                )}
              >
                <ThumbsDown size={14} aria-hidden="true" className={reaction === "thumbs_down" ? "fill-current" : undefined} />
              </button>
            </div>
          )}
          {timeStr && (
            <time
              dateTime={ts ?? undefined}
              title={ts ? new Date(ts).toLocaleString() : undefined}
              className="select-none px-1 text-[11px] text-muted/70 font-normal"
            >
              {timeStr}
            </time>
          )}
        </div>
      )}
      {incomplete && <p className="mt-1 text-xs text-muted">This message stopped before it was finished.</p>}
    </div>
  );
}

// A tool call's state as an icon with its word (the label is the accessible name). Colour is status:
// blue running, green done, red failed; a call cut short by the end of the answer is grey.
const STEP_ICON = {
  running: { icon: <Loader2 size={13} className="animate-spin motion-reduce:animate-none" />, color: "text-running", label: "Running" },
  done: { icon: <Check size={13} />, color: "text-success", label: "Done" },
  error: { icon: <X size={13} />, color: "text-danger", label: "Failed" },
  // Never finished: the answer was stopped, failed or was interrupted first.
  stopped: { icon: <Square size={11} />, color: "text-faint", label: "Stopped" },
} as const;

// One call inside a tool group: state, the exact tool name, what it was called with, and the
// approval it needed ("Allowed once"). Opens to the full input and output.
function ToolRow({ item, approval }: { item: Item<"tool">; approval?: Item<"approval"> }) {
  const t = useT();
  const step = STEP_ICON[item.state];
  const input = formatValue(item.input);
  const pill = approval ? decidedPill(approval.status, approval.resolvedBy) : null;
  return (
    <details className="group/row border-t border-line">
      <summary className="flex min-h-[34px] cursor-pointer list-none items-center gap-2 px-3 py-1.5 text-small text-muted touch:min-h-11 [&::-webkit-details-marker]:hidden">
        <span className={cn("inline-flex w-4 shrink-0 justify-center", step.color)} role="img" aria-label={step.label}>
          {step.icon}
        </span>
        {isComputerTool(item.name) && <ComputerBadge />}
        <span className="shrink-0 font-mono text-ink">{item.name}</span>
        {pill && (
          <StatusPill status={pill.tone} className="h-5 px-2">
            {t(pill.key)}
          </StatusPill>
        )}
        <span className="min-w-0 flex-1 truncate">{item.summary}</span>
        <ChevronRight size={14} aria-hidden="true" className="shrink-0 text-faint transition-transform group-open/row:rotate-90" />
      </summary>
      <div className="space-y-2 bg-surface px-3 pb-3 pt-1 text-small">
        <div>
          <p className="mb-1 text-muted">Input</p>
          <LongText value={input} />
        </div>
        {item.state === "stopped" && <p className="text-muted">This call did not finish: the answer ended first.</p>}
        {(item.state === "done" || item.state === "error") && (
          <div>
            <p className="mb-1 text-muted">
              {item.state === "error" ? "Error" : "Output"}
              {item.truncated && " (cut at the stored limit)"}
            </p>
            {item.output ? <LongText value={item.output} /> : <p className="text-muted">No output.</p>}
          </div>
        )}
        {approval?.resolvedPerson && <p className="text-faint">Answered by {approval.resolvedPerson}</p>}
      </div>
    </details>
  );
}

// Tool calls in a row, as one card (design: "2 tool calls"). Open while any call runs or failed,
// and for short runs; a long finished run starts folded so the answer stays in view.
export function ToolGroup({ tools, approvals }: { tools: Item<"tool">[]; approvals: Record<string, Item<"approval">> }) {
  const t = useT();
  const { total, running, failed } = toolRunSummary(tools);
  const [open, setOpen] = useState(running > 0 || failed > 0 || total <= 3);
  return (
    <div className="overflow-hidden rounded-card border border-line">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((on) => !on)}
        className="flex h-9 w-full cursor-pointer items-center gap-2 bg-inset px-3 text-left text-small font-medium text-ink touch:h-11"
      >
        <Wrench size={14} aria-hidden="true" className="shrink-0 text-muted" />
        <span>{total === 1 ? t("tools.countOne") : t("tools.count", { n: total })}</span>
        {running > 0 && <StatusText status="running">{t("status.working")}</StatusText>}
        {failed > 0 && <StatusText status="denied">{failed} failed</StatusText>}
        <ChevronDown size={14} aria-hidden="true" className={cn("ml-auto shrink-0 text-muted transition-transform", !open && "-rotate-90")} />
      </button>
      {open && tools.map((tool) => <ToolRow key={tool.key} item={tool} approval={approvals[tool.key]} />)}
    </div>
  );
}

// The question itself (design: the docked approval card in Chat.html): who wants which tool,
// exactly what it will be called with, what the tool can do and does, and the answers. Allow once
// is the one primary action; "Allow for 1 hour" and "Always in this chat" show only when the
// server can save them for this call, and "Allow all N" only when more than one call waits.
// A full waiting-line border and a float shadow; never a side stripe.
export function ApprovalRequest({
  item,
  agentName,
  answering,
  error,
  onAnswer,
  position,
  shortcuts = false,
  onAllowAll,
  note = null,
}: {
  item: Item<"approval">;
  agentName?: string | null;
  // An answer is on its way: every button waits for it.
  answering: boolean;
  error: string | null;
  onAnswer: (decision: "allow" | "deny", scope?: ApprovalScope) => void;
  // "1 of 2" when more than one call waits.
  position?: { n: number; total: number };
  // Shows the A and D keys (the docked card listens for them).
  shortcuts?: boolean;
  // "Allow all N", for the docked card when more than one call waits.
  onAllowAll?: () => void;
  // A line about the last "Allow all" (what it left for its own answer).
  note?: string | null;
}) {
  const t = useT();
  const { session } = useSession();
  // A member may be limited to some answers; a device or the desktop app is not.
  const mayAnswer = can(session?.permissions, "approve");
  const screenInput = isScreenInput(item.tool);
  const extra = extraAnswers(item.scopes ?? ["once"], screenInput);
  const exact = scopeIsExact(item.tool, item.approvalKind);
  const tag = riskTag(item.risk);
  const about = aboutSentence(item.tool, item.toolSummary, item.approvalKind);
  const total = position?.total ?? 1;
  const entries = Object.entries(item.input);
  const kbd = "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[5px] border border-current px-1 font-sans text-[11px] font-medium opacity-75";
  return (
    <div
      role="group"
      aria-label={t("approval.waiting")}
      aria-describedby={shortcuts ? `${item.key}-keys` : undefined}
      className="flex flex-col gap-2.5 rounded-2xl border border-warning-line bg-raised px-4 py-3.5 text-body shadow-float"
    >
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill status="waiting">{t("approval.waiting")}</StatusPill>
        <span className="font-medium">
          {isComputerTool(item.tool) && <ComputerBadge />}
          {t("approval.wantsToUse", { name: agentName || t("approval.yourAgent"), tool: "\u0000" }).split("\u0000").map((part, index, parts) => (
            <Fragment key={index}>
              {part}
              {index < parts.length - 1 && <span className="font-mono">{isComputerTool(item.tool) ? toolLabel(item.tool) : toolDisplayName(item.tool, item.summary)}</span>}
            </Fragment>
          ))}
        </span>
        {position && position.total > 1 && (
          <span className="ml-auto text-small text-muted">{t("approval.counter", { n: position.n, total: position.total })}</span>
        )}
      </div>
      {entries.length > 0 && (
        <div className="flex flex-col gap-1.5 rounded-field bg-inset px-2.5 py-2 font-mono text-small">
          {entries.map(([key, value]) => {
            const text = formatValue(value);
            return text.length > 160 || text.includes("\n") ? (
              <div key={key}>
                <span className="text-muted">{key}:</span>
                <LongText value={text} />
              </div>
            ) : (
              <div key={key} className="break-words">
                <span className="text-muted">{key}:</span> {text}
              </div>
            );
          })}
        </div>
      )}
      {(tag || about) && (
        <div className="flex flex-wrap items-center gap-2 text-small text-muted">
          {tag && <StatusPill status={tag.tone}>{t(tag.key)}</StatusPill>}
          {about && <span>{"key" in about ? t(about.key) : about.text}</span>}
        </div>
      )}
      {!mayAnswer ? (
        <p className="text-small text-muted">{t("approvalCard.noPermission")}</p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" onClick={() => onAnswer("allow")} disabled={answering}>
            {screenInput ? t("approval.allowThisTurn") : t("approval.allowOnce")}
            {shortcuts && <kbd className={kbd}>A</kbd>}
          </Button>
          {extra.hour && (
            <Button onClick={() => onAnswer("allow", "hour")} disabled={answering} title={t(exact ? "approvalCard.hourHintExact" : "approvalCard.hourHint")}>
              {t("approvalCard.allowHour")}
            </Button>
          )}
          {extra.thread && (
            <Button onClick={() => onAnswer("allow", "thread")} disabled={answering} title={t(exact ? "approvalCard.chatHintExact" : "approvalCard.chatHint")}>
              {t("approvalCard.allowChat")}
            </Button>
          )}
          <Button onClick={() => onAnswer("deny")} disabled={answering} className="text-danger">
            {t("approval.deny")}
            {shortcuts && <kbd className={kbd}>D</kbd>}
          </Button>
          {onAllowAll && showAllowAll(total) && (
            <span className="ml-auto">
              <Button variant="ghost" onClick={onAllowAll} disabled={answering} title={t("approvalCard.allowAllHint")} className="text-muted">
                {t("approvalCard.allowAll", { count: total })}
              </Button>
            </span>
          )}
        </div>
      )}
      {note && <p role="status" className="text-small text-muted">{note}</p>}
      {shortcuts && <span id={`${item.key}-keys`} className="sr-only">{t("approval.keys")}</span>}
      {error && <p role="alert" className="text-small text-danger">{error}</p>}
    </div>
  );
}

// What became of a further-reaching allow on this card: the saved rule (null after Undo), or why it
// could not be saved (the call was then allowed this once only). `scope` says which: "hour" or
// "thread" for an allow in this conversation, "always" (or left out) for an "always allow" command.
export type Remembered = { ruleId: number | null; error: string | null; scope?: ApprovalScope | "always" };

// An approval in the transcript. A waiting one is the full request (rooms show it here; a chat docks
// it above the composer instead). A decided one is a single row with its pill, behind which the input
// it was asked about can be opened, plus the saved-rule Undo when there is one.
export function ApprovalCard({
  item,
  answering,
  error,
  onAnswer,
  remembered,
  undoneRules = [],
  onUndo,
  agentName,
}: {
  item: Item<"approval">;
  answering: boolean;
  error: string | null;
  onAnswer: (decision: "allow" | "deny", scope?: ApprovalScope) => void;
  remembered?: Remembered;
  // Rules removed since the page opened: their cards stop offering Undo.
  undoneRules?: number[];
  // Stop always allowing: removes the saved rule (or the allow for this chat); the next such call asks.
  onUndo?: (ruleId: number) => void;
  agentName?: string | null;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  if (item.status === "pending") {
    return <ApprovalRequest item={item} agentName={agentName} answering={answering} error={error} onAnswer={onAnswer} />;
  }
  const byRule = item.resolvedBy === "saved_rule";
  // Allowed by the person's allow for this chat, or answered here with one.
  const byChatAllow = item.resolvedBy === "scoped_rule";
  const reachKey = reachNoteKey(remembered?.scope);
  const chatAllow = byChatAllow || reachKey !== null;
  const savedRuleId = remembered?.ruleId ?? (byRule || byChatAllow ? item.ruleId : null);
  const undone = savedRuleId != null && undoneRules.includes(savedRuleId);
  const pill = decidedPill(item.status, item.resolvedBy, item.reach ?? null);
  const ruleNote = reachKey ?? (byChatAllow ? "approvalCard.byChatAllow"
    : remembered?.ruleId != null ? "approval.alwaysAllowedHere" : "approval.savedRuleAllows");
  const undoLabel = remembered?.ruleId != null ? "common.undo" : byChatAllow ? "approvalCard.stopAllowing" : "approval.stopAlwaysAllowing";
  return (
    <div className="rounded-card border border-line text-small">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        title={open ? t("chat.approval.hide") : t("chat.approval.show")}
        className="flex min-h-[34px] w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-muted touch:min-h-11"
      >
        {isComputerTool(item.tool) && <ComputerBadge />}
        <span className="shrink-0 font-mono text-ink">{toolDisplayName(item.tool, item.summary)}</span>
        <StatusPill status={pill.tone} className="h-5 px-2">{t(pill.key)}</StatusPill>
        <span className="min-w-0 flex-1 truncate">
          {item.summary}
          {item.resolvedPerson && <span className="text-faint"> · by {item.resolvedPerson}</span>}
        </span>
        <ChevronRight size={14} aria-hidden="true" className={cn("shrink-0 text-faint transition-transform", open && "rotate-90")} />
      </button>
      {open && (
        <dl className="space-y-1.5 border-t border-line px-3 py-2.5">
          {item.status === "expired" && <p className="text-muted">{t("approval.expired")}</p>}
          {item.status === "cancelled" && <p className="text-muted">{t("approval.cancelled")}</p>}
          {Object.entries(item.input).map(([key, value]) => (
            <div key={key}>
              <dt className="text-muted">{key}</dt>
              <dd>
                <LongText value={formatValue(value)} />
              </dd>
            </div>
          ))}
        </dl>
      )}
      {(remembered?.error || undone || (savedRuleId != null && !undone && onUndo) || error) && (
        <div className="space-y-1 border-t border-line px-3 py-2">
          {remembered?.error && <p className="text-muted">{t("approval.allowedOnce", { error: remembered.error })}</p>}
          {undone && <p className="text-muted">{t(chatAllow ? "approvalCard.allowUndone" : "approval.noLongerAlwaysAllowed")}</p>}
          {savedRuleId != null && !undone && onUndo && (
            <p className="flex flex-wrap items-center gap-2 text-muted">
              {t(ruleNote)}
              <button type="button" onClick={() => onUndo(savedRuleId)} className="cursor-pointer underline hover:text-ink">
                {t(undoLabel)}
              </button>
            </p>
          )}
          {error && <p className="text-danger">{error}</p>}
        </div>
      )}
    </div>
  );
}

const END_TEXT: Record<Item<"turn_end">["status"], (item: Item<"turn_end">) => string | null> = {
  completed: () => null,
  failed: (i) => i.error || "The run failed.",
  cancelled: () => "You stopped this answer.",
  interrupted: (i) => interruptedText(i.reason, i.replay),
};

export function TurnEnd({ item }: { item: Item<"turn_end"> }) {
  const message = END_TEXT[item.status](item);
  const usage = item.status === "completed" || item.usage ? turnUsageText(item.usage) : null;
  const next = item.status === "failed" ? failureNextStep(item.errorCode) : null;
  const bad = item.status === "failed";
  return (
    <>
      {message && (
        <div
          role={bad ? "alert" : undefined}
          className={cn("rounded-card border px-3.5 py-2.5 text-sm", bad ? "border-danger/50 bg-danger/10 text-ink" : "border-line text-muted")}
        >
          <p className={cn("whitespace-pre-wrap break-words", bad && "text-danger")}>{message}</p>
          {next && <p className="mt-1 text-xs text-muted">{next}</p>}
        </div>
      )}
      {usage && (
        <p className="text-right text-[11px] text-faint" title="As reported by the engine">
          {usage}
        </p>
      )}
    </>
  );
}

export function SessionReset({ item }: { item: Item<"session_reset"> }) {
  return (
    <p className="border-y border-dashed border-line py-2 text-center text-xs text-muted">
      {item.message ||
        "The engine's session for this conversation was reset. The messages above are shown for reference only."}
    </p>
  );
}

// Marks a call that runs in the agent's computer rather than on this machine.
function ComputerBadge() {
  return (
    <span
      className="mr-1 rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-text"
      title="Runs in the agent's computer (an isolated container), not on this machine"
    >
      computer
    </span>
  );
}

// What recall put in front of the person's message. Always shown, so nothing
// the engine was given is hidden (docs/MEMORY.md).
export function RecalledChip({ item }: { item: Item<"recalled"> }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="self-end text-xs text-muted">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="cursor-pointer rounded-full border border-line px-2.5 py-0.5 hover:bg-hover"
      >
        🧠 {recalledLabel(item.notes.length, item.conversations.length)}
      </button>
      {open && (
        <ul className="mt-1 max-w-xl space-y-1 rounded-field border border-line bg-raised p-2 text-left">
          <li className="text-muted">Background for the agent, not instructions. It grants no permission.</li>
          {item.notes.map((n, i) => (
            <li key={`n${i}`}>
              <span className="font-mono">memory/{n.name}</span>: {n.snippet}
            </li>
          ))}
          {item.conversations.map((c, i) => (
            <li key={`c${i}`}>
              <span className="font-medium">“{c.title || "untitled"}”</span>
              {c.at ? ` (${c.at.slice(0, 10)})` : ""}, {c.role === "user" ? "you said" : "the agent said"}: {c.snippet}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// The turn moved to the agent's fallback engine: always shown, never silent.
export function EngineSwitched({ item }: { item: Item<"engine_switched"> }) {
  return (
    <div role="status" className="rounded-card border border-warning/50 bg-warning/10 px-3.5 py-2.5 text-xs">
      <p className="font-medium text-ink">
        Switched engine: {item.from} → {item.to}
        {item.model ? ` (${item.model})` : ""}
      </p>
      {item.message && <p className="mt-1 whitespace-pre-wrap break-words text-muted">{item.message}</p>}
    </div>
  );
}

// Earlier messages were folded into a summary for the engine.
export function CompactedMarker({ item }: { item: Item<"compacted"> }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-y border-dashed border-line py-2 text-center text-xs text-muted">
      <p>{compactedLabel(item.folded, item.writtenBy)}</p>
      {item.summary && (
        <button onClick={() => setOpen((v) => !v)} aria-expanded={open} className="mt-1 cursor-pointer underline">
          {open ? "Hide the summary" : "Show the summary"}
        </button>
      )}
      {open && <pre className="mt-2 whitespace-pre-wrap break-words text-left font-mono">{item.summary}</pre>}
    </div>
  );
}
