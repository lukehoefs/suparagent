"use client";

import { Check, ChevronDown, ChevronRight, Copy, GitBranch, Loader2, Square, ThumbsDown, ThumbsUp, X } from "lucide-react";
import type { ReactionKind } from "@/lib/reactions";
import { Fragment, useState } from "react";
import { isScreenInput } from "@/lib/approvals";
import type { ApprovalScope } from "@/lib/api";
import { aboutSentence, extraAnswers, reachNoteKey, riskTag, scopeIsExact, showAllowAll, toolDisplayName } from "@/lib/approval-card";
import { can } from "@/lib/permissions";
import { isComputerTool, toolLabel } from "@/lib/computers";
import { cn } from "@/lib/cn";
import { turnUsageText } from "@/lib/everyday";
import { compactedLabel, recalledLabel } from "@/lib/memory";
import type { TranscriptItem } from "@/lib/transcript";
import { useLanguageChoice, useT } from "@/lib/use-i18n";
import { toolRunSummary } from "@/lib/transcript-view";
import { endedTurnKeys, failedTurnCopy, formatToolDuration, isAddress, toolArgument, toolDurationMs, toolResultCount } from "@/lib/chat-page";
import { useMediaQuery } from "@/lib/use-media-query";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { LinkButton } from "@/components/ui/LinkButton";
import { StatusPill, StatusText } from "@/components/ui/StatusPill";
import { decidedPill } from "@/lib/chat-state";
import { useSession } from "../AuthGate";
import { Markdown } from "./Markdown";
import { copyToClipboard } from "@/lib/clipboard";
import { MessageAttachments } from "./Attachments";
import { SlidersIcon } from "@/components/ui/SlidersIcon";
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

// The actions under or beside a message (copy, like, the time, the turn's usage): shown while the
// message is hovered or has focus, and always on touch screens, which have no hover.
const REVEAL = "opacity-0 transition-opacity duration-(--dur-fast) group-hover/msg:opacity-100 group-focus-within/msg:opacity-100 touch:opacity-100";

// Below Tailwind's sm: the phone layout of the approval card (design: MobileChat.html).
const PHONE = "(max-width: 639px)";

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
      {/* The bubble is up to 78% of the column plus its padding (design: Chat.html). The actions sit
          to its left, out of the flow, so they never narrow it; on touch screens they are in the flow. */}
      <div className="relative flex max-w-[calc(84%+2rem)] items-end gap-1 sm:max-w-[calc(78%+2rem)]">
        <div className={cn("absolute bottom-1 right-full mr-1 flex shrink-0 items-center gap-0.5 touch:static touch:mb-1 touch:mr-0", REVEAL)}>
          {timeStr && (
            <time
              dateTime={item.ts ?? undefined}
              title={item.ts ? new Date(item.ts).toLocaleString() : undefined}
              className="select-none whitespace-nowrap px-1 text-[11px] font-normal text-faint"
            >
              {timeStr}
            </time>
          )}
          {item.text && <CopyButton text={item.text} />}
          {canBranch && (
            <button
              type="button"
              onClick={() => { setDraft(item.text); setEditing(true); }}
              aria-label={t("branch.edit")}
              title={t("branch.edit")}
              className="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-field text-muted transition-colors hover:bg-hover hover:text-ink touch:size-10"
            >
              <GitBranch size={14} aria-hidden="true" />
            </button>
          )}
        </div>
        <p className="min-w-0 whitespace-pre-wrap break-words rounded-[20px] bg-bubble px-4 py-2.5 text-body text-ink">
          {item.text}
        </p>
      </div>
      {item.person && <p className="select-none px-1 text-[11px] text-muted">{item.person}</p>}
      {item.skills && item.skills.length > 0 && (
        <p className="max-w-[88%] break-words text-xs text-muted sm:max-w-[80%]">
          {t("chatPage.skillUsed")} <span className="font-mono">{item.skills.map((name) => `/${name}`).join(" ")}</span>
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
  usage = null,
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
  // What the engine reported this turn used ("1.2k in · 300 out · $0.01"), shown with the actions.
  usage?: string | null;
}) {
  const t = useT();
  const timeStr = formatMessageTime(ts, t);
  return (
    <div className="group/msg relative max-w-full text-body">
      <Markdown text={text} threadId={live ? null : threadId} workspacePath={live ? null : workspacePath} />
      {live && <span aria-hidden="true" className="animate-pulse text-muted motion-reduce:animate-none">▍</span>}
      {!live && text && (
        // Laid over the gap below the answer, so the hidden row takes no room; in the flow on touch.
        <div className={cn("absolute left-0 right-0 top-full -mt-1.5 -ml-1 flex h-7 min-w-0 items-center gap-1.5 touch:static touch:mt-1 touch:ml-0 touch:h-auto touch:flex-wrap", REVEAL)}>
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
              className="shrink-0 select-none px-1 text-[11px] font-normal text-faint"
            >
              {timeStr}
            </time>
          )}
          {usage && (
            <span className="min-w-0 truncate text-[11px] text-faint" title={t("chatPage.usageHint")}>
              {usage}
            </span>
          )}
        </div>
      )}
      {incomplete && <p className="mt-1 text-xs text-muted">{t("chatPage.incomplete")}</p>}
    </div>
  );
}

// A tool call's state as an icon with its word (the label is the accessible name). Colour is status:
// blue running, green done, red failed; a call cut short by the end of the answer is grey.
const STEP_ICON = {
  running: { icon: <Loader2 size={14} className="animate-spin motion-reduce:animate-none" />, color: "text-running", label: "chatPage.tool.running" },
  done: { icon: <Check size={14} />, color: "text-success", label: "chatPage.tool.done" },
  error: { icon: <X size={14} />, color: "text-danger", label: "chatPage.tool.failed" },
  // Never finished: the answer was stopped, failed or was interrupted first.
  stopped: { icon: <Square size={11} />, color: "text-faint", label: "chatPage.tool.stopped" },
} as const;

// One call inside a tool group (design: Chat.html): its state, the exact tool name, the approval it
// needed ("Allowed once", "Allowed for 1 hour", "Always in this chat"), what it was called with,
// how many results it returned and how long it ran, when those are known. Opens to the full input
// and output. A call waiting for the person's answer is not drawn here: the docked card holds it.
function ToolRow({ item, approval }: { item: Item<"tool">; approval?: Item<"approval"> }) {
  const t = useT();
  const locale = useLanguageChoice();
  const step = STEP_ICON[item.state];
  const input = formatValue(item.input);
  const pill = approval ? decidedPill(approval.status, approval.resolvedBy, approval.reach ?? null) : null;
  const argument = toolArgument(item.name, item.input, item.summary);
  const count = item.state === "done" ? toolResultCount(item.output) : null;
  const ms = toolDurationMs(item, approval);
  const took = ms === null ? null : formatToolDuration(ms, locale);
  return (
    <details className="group/row border-t border-line">
      <summary className="relative flex min-h-[46px] cursor-pointer list-none items-center gap-2 px-3 py-1.5 text-small text-muted [&::-webkit-details-marker]:hidden">
        <span className={cn("inline-flex w-4 shrink-0 justify-center", step.color)} role="img" aria-label={t(step.label)}>
          {step.icon}
        </span>
        {isComputerTool(item.name) && <ComputerBadge />}
        <span className="max-w-[45%] shrink-0 truncate font-mono text-ink">{toolDisplayName(item.name, item.summary)}</span>
        {pill && (
          <StatusPill status={pill.tone} className="h-5 px-2">
            {t(pill.key)}
          </StatusPill>
        )}
        <span className="min-w-0 flex-1 truncate" title={argument ?? undefined}>
          {argument ? (isAddress(argument) ? argument : t("chatPage.tool.quoted", { text: argument })) : null}
        </span>
        {count !== null && (
          <span className="shrink-0 whitespace-nowrap">{count === 1 ? t("chatPage.tool.resultsOne") : t("chatPage.tool.results", { n: count })}</span>
        )}
        {took && (
          <span className="shrink-0 whitespace-nowrap tabular-nums text-faint" title={t("chatPage.tool.took", { time: took })}>
            {took}
          </span>
        )}
        {/* Out of the flow in every state: it sits in the row's 12 px right padding and only fades
            in when pointed at, focused or open (always on touch), so the results and the time end
            at the card's padding (design: Chat.html) and never move. */}
        <ChevronRight size={12} strokeWidth={1.7} aria-hidden="true" className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 text-faint opacity-0 transition duration-(--dur-fast) group-hover/row:opacity-100 group-focus-within/row:opacity-100 group-open/row:rotate-90 group-open/row:opacity-100 touch:opacity-100" />
      </summary>
      <div className="space-y-2 bg-surface px-3 pb-3 pt-1 text-small">
        <div>
          <p className="mb-1 text-muted">{t("chatPage.tool.input")}</p>
          <LongText value={input} />
        </div>
        {item.state === "stopped" && <p className="text-muted">{t("chatPage.tool.unfinished")}</p>}
        {(item.state === "done" || item.state === "error") && (
          <div>
            <p className="mb-1 text-muted">
              {item.state === "error" ? t("chatPage.tool.error") : t("chatPage.tool.output")}
              {item.truncated && ` (${t("chatPage.tool.cut")})`}
            </p>
            {item.output ? <LongText value={item.output} /> : <p className="text-muted">{t("chatPage.tool.noOutput")}</p>}
          </div>
        )}
        {approval?.resolvedPerson && <p className="text-faint">{t("chatPage.tool.answeredBy", { name: approval.resolvedPerson })}</p>}
      </div>
    </details>
  );
}

// Tool calls in a row, as one card (design: "2 tool calls"). Open while any call runs or failed,
// and for short runs; a long finished run starts folded so the answer stays in view.
export function ToolGroup({
  tools,
  approvals,
}: {
  tools: Item<"tool">[];
  approvals: Record<string, Item<"approval">>;
}) {
  const t = useT();
  const { total, failed } = toolRunSummary(tools);
  const running = tools.filter((tool) => tool.state === "running").length;
  const [open, setOpen] = useState(running > 0 || failed > 0 || total <= 3);
  return (
    <div className="overflow-hidden rounded-card border border-line">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((on) => !on)}
        className="flex h-9 w-full cursor-pointer items-center gap-2 bg-inset px-3 text-left text-small font-medium text-ink touch:h-11"
      >
        <SlidersIcon size={14} className="shrink-0" />
        <span>{total === 1 ? t("tools.countOne") : t("tools.count", { n: total })}</span>
        {running > 0 && <StatusText status="running">{t("status.working")}</StatusText>}
        {failed > 0 && <StatusText status="denied">{t("chatPage.tool.failedCount", { n: failed })}</StatusText>}
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
  // On a phone (design: MobileChat.html) the card is the question, the input and the answers: no
  // pill above it (the header says Waiting for you), Allow once and Deny side by side, the other
  // allows full width under them, and no A and D keys.
  const compact = useMediaQuery(PHONE, false);
  // A one-line text value reads in quotes, as the tool row shows it; the quotes are not part of
  // what runs, so a screen reader is not given them.
  const [quoteOpen = "", quoteClose = ""] = t("chatPage.tool.quoted", { text: "\u0000" }).split("\u0000");
  const quoted = (text: string) => (
    <>
      {quoteOpen && <span aria-hidden="true">{quoteOpen}</span>}
      {text}
      {quoteClose && <span aria-hidden="true">{quoteClose}</span>}
    </>
  );
  const single = entries.length === 1 && typeof entries[0][1] === "string" ? (entries[0][1] as string) : null;
  const valueOnly = compact && single !== null && single.length <= 160 && !single.includes("\n");
  const kbd = "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[5px] border border-current px-1 font-sans text-[11px] font-medium opacity-75 touch:hidden";
  return (
    <div
      role="group"
      aria-label={t("approvalCard.needed")}
      aria-describedby={shortcuts && !compact ? `${item.key}-keys` : undefined}
      className={cn("flex flex-col gap-2.5 rounded-2xl border border-warning-line bg-raised text-body shadow-float", compact ? "p-3.5" : "px-4 py-3.5")}
    >
      <div className="flex flex-wrap items-center gap-2">
        {/* The same word as the header's pill and the status line. */}
        {!compact && <StatusPill status="waiting">{t("status.waiting")}</StatusPill>}
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
        // What it will be called with, in one colour (design: query: “…”), at the mono face's own
        // line height (the design's font shorthand), so a one-line value makes a 30px box.
        <div className="flex flex-col gap-1.5 rounded-field bg-inset px-2.5 py-2 font-mono text-small leading-[1.2] text-ink">
          {valueOnly && single !== null ? (
            <div className="break-words">{quoted(single)}</div>
          ) : entries.map(([key, value]) => {
            const text = formatValue(value);
            return text.length > 160 || text.includes("\n") ? (
              <div key={key}>
                <span>{key}:</span>
                <LongText value={text} />
              </div>
            ) : (
              <div key={key} className="break-words">
                <span>{key}:</span> {typeof value === "string" ? quoted(text) : text}
              </div>
            );
          })}
        </div>
      )}
      {(tag || about) && (compact ? (
        // One quiet line on a phone: what the tool does, then its risk as a word and a dot.
        <p className="text-small text-muted">
          {about && <span>{"key" in about ? t(about.key) : about.text}</span>}
          {tag && <StatusText status={tag.tone} className={cn("align-middle", about && "ml-2")}>{t(tag.key)}</StatusText>}
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2 text-small text-muted">
          {tag && <StatusPill status={tag.tone}>{t(tag.key)}</StatusPill>}
          {about && <span>{"key" in about ? t(about.key) : about.text}</span>}
        </div>
      ))}
      {!mayAnswer ? (
        <p className="text-small text-muted">{t("approvalCard.noPermission")}</p>
      ) : compact ? (
        // 44px answers whatever the pointer: the card is drawn this way only on a phone.
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <Button variant="primary" onClick={() => onAnswer("allow")} disabled={answering} className="h-touch min-w-0 flex-1">
              {screenInput ? t("approval.allowThisTurn") : t("approval.allowOnce")}
            </Button>
            <Button onClick={() => onAnswer("deny")} disabled={answering} className="h-touch min-w-0 flex-1 text-danger">
              {t("approval.deny")}
            </Button>
          </div>
          {extra.hour && (
            <Button variant="ghost" onClick={() => onAnswer("allow", "hour")} disabled={answering} className="h-touch w-full text-muted">
              {t("approvalCard.allowHour")}
            </Button>
          )}
          {extra.thread && (
            <Button variant="ghost" onClick={() => onAnswer("allow", "thread")} disabled={answering} className="h-touch w-full text-muted">
              {t("approvalCard.allowChat")}
            </Button>
          )}
          {onAllowAll && showAllowAll(total) && (
            <Button variant="ghost" onClick={onAllowAll} disabled={answering} className="h-touch w-full text-muted">
              {t("approvalCard.allowAll", { count: total })}
            </Button>
          )}
        </div>
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
      {shortcuts && !compact && <span id={`${item.key}-keys`} className="sr-only">{t("approval.keys")}</span>}
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
        className="group/row flex min-h-[46px] w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-muted"
      >
        {isComputerTool(item.tool) && <ComputerBadge />}
        <span className="shrink-0 font-mono text-ink">{toolDisplayName(item.tool, item.summary)}</span>
        <StatusPill status={pill.tone} className="h-5 px-2">{t(pill.key)}</StatusPill>
        <span className="min-w-0 flex-1 truncate">
          {item.summary}
          {item.resolvedPerson && <span className="text-faint"> · {t("chatPage.byPerson", { name: item.resolvedPerson })}</span>}
        </span>
        <ChevronRight size={14} strokeWidth={1.7} aria-hidden="true" className={cn("shrink-0 text-faint opacity-0 transition duration-(--dur-fast) group-hover/row:opacity-100 group-focus-within/row:opacity-100 touch:opacity-100", open && "rotate-90 opacity-100")} />
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

// The usage line of a turn, as its answer or the turn's end shows it; null when there is none.
export function turnUsage(item: Item<"turn_end">): string | null {
  return item.status === "completed" || item.usage ? turnUsageText(item.usage) : null;
}

// How a turn ended, when there is something to say. A failed answer is an alert card (design: States,
// "Chat: agent error"): what failed as its title, the engine's own words and the next step under it.
// When the agent could not reach its own computer, the card opens this conversation's Computer
// panel, where that computer is started and fixed (`onOpenComputer`), and the Computers page too
// when the agent also has a cloud computer there (`computersHref`). A stopped or interrupted one is
// a quiet note. The usage line follows when no answer of the turn carries it.
export function TurnEnd({
  item,
  showUsage = true,
  agentName,
  onOpenComputer,
  computersHref,
}: {
  item: Item<"turn_end">;
  showUsage?: boolean;
  agentName?: string | null;
  onOpenComputer?: () => void;
  computersHref?: string;
}) {
  const t = useT();
  const usage = showUsage ? turnUsage(item) : null;
  const failed = item.status === "failed" ? failedTurnCopy(item.errorCode) : null;
  const ended = endedTurnKeys(item);
  const detail = item.error.trim();
  const computerActions = failed?.openComputerPanel && (onOpenComputer || computersHref) ? (
    <>
      {onOpenComputer && <Button onClick={onOpenComputer}>{t("chatPage.openComputerPanel")}</Button>}
      {computersHref && <LinkButton href={computersHref} variant={onOpenComputer ? "ghost" : "secondary"}>{t("chatPage.openComputers")}</LinkButton>}
    </>
  ) : undefined;
  return (
    <>
      {failed && (
        <Banner
          tone="danger"
          title={t(failed.titleKey, { name: agentName || t("approval.yourAgent") })}
          action={computerActions}
        >
          {(detail || failed.nextKey) && (
            <>
              {detail && <p className="whitespace-pre-wrap break-words">{detail}</p>}
              {failed.nextKey && <p className={cn(detail && "mt-1")}>{t(failed.nextKey)}</p>}
            </>
          )}
        </Banner>
      )}
      {ended && (
        <div className="rounded-card border border-line px-3.5 py-2.5 text-sm text-muted">
          <p className="whitespace-pre-wrap break-words">{ended.map((key) => t(key)).join(" ")}</p>
        </div>
      )}
      {usage && (
        <p className="group/msg -mt-2 text-right text-[11px] text-faint" title={t("chatPage.usageHint")}>
          <span className={REVEAL}>{usage}</span>
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
  const t = useT();
  return (
    <span
      className="mr-1 shrink-0 rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-text"
      title={t("chatPage.tool.computerHint")}
    >
      {t("chatPage.tool.computer")}
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
