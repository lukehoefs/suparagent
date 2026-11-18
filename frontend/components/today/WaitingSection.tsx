"use client";

import { AlertTriangle, Check, Gauge, KeyRound, Repeat } from "lucide-react";
import Link from "next/link";
import { Fragment, useEffect, useId, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { aboutSentence, allowAllNote, parseRisk, riskTag, showAllowAll, toolDisplayName } from "@/lib/approval-card";
import { isScreenInput } from "@/lib/approvals";
import { cn } from "@/lib/cn";
import { isComputerTool, toolLabel } from "@/lib/computers";
import { can } from "@/lib/permissions";
import { allowAllGroups, requestLine, type WaitingApproval, type WaitingItem, type WaitingRow } from "@/lib/today";
import { useT } from "@/lib/use-i18n";
import { useSession } from "@/components/AuthGate";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { LinkButton } from "@/components/ui/LinkButton";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatusPill } from "@/components/ui/StatusPill";
import { useToast } from "@/components/ui/Toast";
import { SectionNote, TodaySection } from "./TodaySection";

// On a phone each waiting item is its own card, the call above its answers (MobileToday.html); on
// a wide screen it is a row of the section card, the answers on the right and centred against the
// text (Today.html). Either way a call is its face and two lines: the sentence and what it asks
// for. Opened details and notes take a line of their own under the row.
const ITEM = "flex min-w-0 flex-col gap-2.5 rounded-card border border-warning-line bg-raised p-3.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3 sm:gap-y-2 sm:rounded-none sm:border-0 sm:border-b sm:border-line sm:bg-transparent sm:px-4 sm:py-3 sm:last:border-b-0";
// The text beside the answers. On a phone it is as tall as its lines; in the wide row it is at
// least 176 px wide, so the text, "Allow" and "Deny" share one line in a 340 px card.
const TEXT = "flex min-w-0 flex-col sm:flex-1 sm:basis-44";
// The face and the two lines, the face centred against them.
const HEAD = "flex min-w-0 items-center gap-2.5";
// 30 px with 11 px initials on a phone (MobileToday.html), 24 px in the wide row.
const FACE = "max-sm:size-[30px] max-sm:text-[11px]";
const HEADLINE = "text-body text-ink sm:text-label";
// The line under the sentence (what the call asks for): one line on a phone (MobileToday.html),
// up to two in the wide row (Today.html), so a search is read whole.
const QUOTE = "text-small text-muted max-sm:truncate sm:line-clamp-2 sm:break-words";
// Under the row in the wide layout, whatever comes before it in the reading order.
const BELOW = "sm:order-last sm:basis-full";
// The answers and links: full width and 44 px on a phone, side by side on a wide screen.
const ACTIONS = "flex gap-2 sm:ml-auto sm:shrink-0";
const ACTION = "max-sm:h-touch max-sm:flex-1";
// The same box as a phone's card, for what the section says when it lists nothing.
const PLAIN = "rounded-card border border-line bg-raised sm:rounded-none sm:border-0 sm:bg-transparent";
// Cards apart on a phone, one card on a wide screen: the list and the notes under it.
const NOTES = "flex flex-col gap-4 sm:gap-0";
// Marks where a translated sentence puts the agent's name or the tool.
const NAME = "\u0001";
const TOOL = "\u0000";
// Where focus goes after "Allow all" when its button stays: back to the button.
const ALLOW_ALL = "\u0002allow-all";

export function WaitingSection({
  items,
  loading,
  runningFailed,
  briefFailed,
  more,
  agentName,
  onAnswered,
}: {
  items: WaitingItem[];
  loading: boolean;
  // What is running could not be read (the calls then come from the brief, as links).
  runningFailed: boolean;
  // The brief could not be read: engines, questions, routines and repeated failures are unknown.
  briefFailed: boolean;
  // What else waits that the brief left out.
  more: number;
  agentName: (id: number | null) => string | null;
  // An approval was answered here (or turned out to be answered already): read again.
  onAnswered: () => void;
}) {
  const t = useT();
  const toast = useToast();
  const { session } = useSession();
  const mayAnswer = can(session?.permissions, "approve");
  // Answered here, and hidden until the next read drops them.
  const [answered, setAnswered] = useState<ReadonlySet<string>>(() => new Set());
  const [allowingAll, setAllowingAll] = useState(false);
  // What the last "Allow all" left for its own answer, or why it failed.
  const [allNote, setAllNote] = useState<{ text: string; failed: boolean } | null>(null);
  const shown = items.filter((item) => !answered.has(item.key));
  // An answered item leaves with the button that had focus: focus goes on to the next item (the
  // row itself, so a held key cannot answer the next call too), else to the section's heading.
  const rows = useRef(new Map<string, HTMLLIElement>());
  const heading = useRef<HTMLHeadingElement>(null);
  const allButton = useRef<HTMLButtonElement>(null);
  const latest = useRef(shown);
  const focusNext = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    latest.current = shown;
    const target = focusNext.current;
    if (target === undefined) return;
    focusNext.current = undefined;
    const node = target === ALLOW_ALL ? allButton.current : target !== null ? rows.current.get(target) : null;
    (node ?? heading.current)?.focus();
  });
  const hide = (keys: readonly string[], keepAllowAll = false) => {
    const gone = new Set(keys);
    const list = latest.current;
    const index = list.findIndex((item) => gone.has(item.key));
    const rest = list.filter((item) => !gone.has(item.key));
    const next = index >= 0 ? (rest[index] ?? rest[index - 1] ?? null) : null;
    // Focus left with the call (its buttons were disabled while the answer was sent), unless the
    // person has gone on to something else meanwhile.
    const active = document.activeElement;
    const lost = !active || active === document.body || active === allButton.current || keys.some((key) => rows.current.get(key)?.contains(active));
    if (lost) focusNext.current = keepAllowAll ? ALLOW_ALL : (next?.key ?? null);
    setAnswered((current) => new Set([...current, ...keys]));
  };
  const partial = runningFailed || briefFailed;
  // One primary action on the page: the allow of the first call that can be answered here.
  const firstCall = shown.find((item): item is WaitingApproval => item.type === "approval" && item.call !== null)?.key ?? null;
  // "Allow all N" (MobileToday.html): every call listed that can be answered here, once each.
  const callCount = allowAllGroups(shown).reduce((sum, group) => sum + group.ids.length, 0);
  const offerAllowAll = mayAnswer && showAllowAll(callCount);

  const allowAll = async () => {
    if (allowingAll) return;
    const asked = allowAllGroups(latest.current);
    if (asked.length === 0) return;
    setAllowingAll(true);
    setAllNote(null);
    const results = await Promise.allSettled(asked.map((group) => api.allowAllThreadApprovals(group.threadId, group.ids)));
    let allowed = 0;
    let skipped = 0;
    const failures: string[] = [];
    // A conversation that skipped none has none of these left waiting; one that skipped some
    // keeps its calls until the next read says which.
    const done: string[] = [];
    for (const [index, result] of results.entries()) {
      if (result.status === "fulfilled") {
        allowed += result.value.allowed;
        skipped += result.value.skipped;
        if (result.value.skipped <= 0) done.push(...asked[index].keys);
      } else {
        failures.push(result.reason instanceof ApiError ? result.reason.message : t("approvalCard.allowAllError"));
      }
    }
    setAllowingAll(false);
    if (allowed > 0) toast(t("today.waiting.allowedAll", { count: allowed }), "success");
    const note = allowAllNote({ allowed, skipped });
    if (failures.length > 0) setAllNote({ text: failures[0], failed: true });
    else if (note) setAllNote({ text: t(note.key, note.params), failed: false });
    if (done.length > 0) {
      const left = allowAllGroups(latest.current.filter((item) => !done.includes(item.key))).reduce((sum, group) => sum + group.ids.length, 0);
      hide(done, showAllowAll(left));
    } else {
      // Nothing left the list: focus goes back to the button (it was disabled while it worked).
      const active = document.activeElement;
      if (!active || active === document.body || active === allButton.current) focusNext.current = ALLOW_ALL;
    }
    if (allowed > 0 || skipped > 0) onAnswered();
  };

  // A phone shows the count once, in the app bar's "N waiting" pill (AppShell). A flex box, so the
  // 22 px pill sets the header's height (no line box around it).
  const count = shown.length > 0 ? (
    <span role="img" aria-label={t("today.waiting.count", { count: shown.length })} className="flex max-sm:hidden">
      <StatusPill status="waiting" dot={false}>{shown.length}</StatusPill>
    </span>
  ) : null;
  const badge = offerAllowAll || count ? (
    <span className="flex shrink-0 items-center gap-2">
      {offerAllowAll && (
        // The phone's shortcut; on a wide screen each row's answers sit right beside it.
        <Button ref={allButton} variant="ghost" loading={allowingAll} onClick={() => void allowAll()} className="text-muted hover:text-ink sm:hidden">
          {t("approvalCard.allowAll", { count: callCount })}
        </Button>
      )}
      {count}
    </span>
  ) : null;

  let body;
  if (loading) {
    body = (
      <div role="status" className={cn(PLAIN, "flex flex-col gap-2 p-4")}>
        <span className="sr-only">{t("today.loading")}</span>
        <Skeleton className="h-10" />
        <Skeleton className="h-10" />
      </div>
    );
  } else if (runningFailed && briefFailed) {
    body = <div className={PLAIN}><SectionNote tone="danger">{t("today.waiting.loadFailed")}</SectionNote></div>;
  } else {
    // The all-clear only when both reads came in and nothing was left out: otherwise what did
    // load, and what could not be.
    const notes = partial || more > 0 ? (
      <div className={cn(NOTES, shown.length > 0 && "sm:border-t sm:border-line")}>
        {partial && <div className={PLAIN}><SectionNote tone="danger">{t("today.waiting.partialFailed")}</SectionNote></div>}
        {more > 0 && <div className={PLAIN}><SectionNote>{t("today.waiting.more", { count: more })}</SectionNote></div>}
      </div>
    ) : null;
    const allowAllLine = allNote && shown.length > 0 ? (
      <div className={cn(PLAIN, "sm:border-b sm:border-line")}>
        <p role={allNote.failed ? "alert" : "status"} className={cn("px-4 py-3 text-label", allNote.failed ? "text-danger" : "text-muted")}>{allNote.text}</p>
      </div>
    ) : null;
    body = shown.length === 0 ? (
      notes ?? (
        <div className={PLAIN}>
          <EmptyState tone="done" headingLevel={3} icon={<Check size={28} strokeWidth={1.7} />} title={t("today.waiting.emptyTitle")} description={t("today.waiting.emptyBody")} className="py-8" />
        </div>
      )
    ) : (
      <div className={NOTES}>
        {allowAllLine}
        <ul className="flex flex-col gap-4 sm:gap-0">
          {shown.map((item) => (
            <li
              key={item.key}
              tabIndex={-1}
              ref={(node) => {
                if (node) rows.current.set(item.key, node);
                else rows.current.delete(item.key);
              }}
              // A question's card is one link on a phone, in the neutral hairline: amber stays for
              // the calls that wait on an answer here (MobileToday.html).
              className={cn(ITEM, item.type === "question" && "max-sm:relative max-sm:border-line")}
            >
              {item.type === "approval" ? (
                <ApprovalItem
                  item={item}
                  name={agentName(item.agentId)}
                  primary={item.key === firstCall}
                  mayAnswer={mayAnswer}
                  onDone={(gone) => {
                    setAllNote(null);
                    if (gone) hide([item.key]);
                    onAnswered();
                  }}
                />
              ) : (
                <RowItem item={item} name={agentName(item.agentId)} />
              )}
            </li>
          ))}
        </ul>
        {notes}
      </div>
    );
  }
  return <TodaySection title={t("today.waiting.title")} badge={badge} headingRef={heading} cards>{body}</TodaySection>;
}

// A translated sentence with the agent's name in bold, and the tool (if any) in mono, wherever the
// language puts them.
function Sentence({ template, name, tool }: { template: string; name: string; tool?: string }) {
  return (
    <>
      {template.split(/(\u0000|\u0001)/).map((part, index) => (
        <Fragment key={index}>
          {/* The tool's name moves to the next line whole, and breaks only where it cannot fit one. */}
          {part === NAME ? <strong className="font-semibold">{name}</strong> : part === TOOL ? <span className="break-words font-mono">{tool}</span> : part}
        </Fragment>
      ))}
    </>
  );
}

function ApprovalItem({ item, name, primary, mayAnswer, onDone }: { item: WaitingApproval; name: string | null; primary: boolean; mayAnswer: boolean; onDone: (gone: boolean) => void }) {
  const t = useT();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const textId = useId();
  const detailsId = useId();
  const who = name || t("approval.yourAgent");
  const call = item.call;

  if (!call) {
    // Only the brief knows of it, not what it would run: it is answered in its conversation.
    return (
      <>
        <div className={TEXT}>
          <div className={HEAD}>
            <Avatar agentId={item.agentId} name={name} size="sm" className={FACE} />
            <div className="min-w-0 flex-1">
              <p className={HEADLINE}><Sentence template={t("today.waiting.asks", { name: NAME })} name={who} /></p>
              <p className={QUOTE}>{item.summary}</p>
            </div>
          </div>
        </div>
        <div className={ACTIONS}>
          <LinkButton href={item.href} className={ACTION}>{t("today.waiting.openChat")}</LinkButton>
        </div>
      </>
    );
  }

  const tool = isComputerTool(call.tool) ? toolLabel(call.tool) : toolDisplayName(call.tool, call.summary);
  const aboutRule = aboutSentence(call.tool, call.tool_summary, call.kind);
  const about = aboutRule ? ("key" in aboutRule ? t(aboutRule.key) : aboutRule.text) : null;
  const tag = riskTag(parseRisk(call.risk));
  // A call that changes, deletes or sends says so beside its tool; a read-only one in its details.
  const warning = tag && tag.tone !== "done" ? tag : null;
  const quietTag = tag && tag.tone === "done" ? tag : null;
  // What it asks for (Today.html: the quoted search); without that, what the tool does.
  const request = requestLine(call.tool, call.input, call.summary, tool);
  const second = request ? (request.quoted ? t("chatPage.tool.quoted", { text: request.text }) : request.text) : about;
  const aboutInDetails = request ? about : null;
  // The engine's own summary of the call, in full, where the line above does not already say it.
  const summary = call.summary?.trim() && call.summary.trim() !== request?.text ? call.summary.trim() : null;
  const entries = Object.entries(call.input ?? {});
  const hasDetails = Boolean(quietTag || aboutInDetails || summary || entries.length > 0);

  const answer = async (decision: "allow" | "deny") => {
    setBusy(true);
    setError(null);
    try {
      await api.answerThreadApproval(item.threadId, call.id, decision);
      // Green is for what was allowed; a denial is the person's own choice, said in grey.
      toast(t(decision === "allow" ? "today.waiting.allowed" : "today.waiting.denied", { tool }), decision === "allow" ? "success" : "info");
      onDone(true);
    } catch (err) {
      if (err instanceof ApiError && err.code === "approval_not_waiting") {
        setError(t("today.waiting.alreadyAnswered"));
        onDone(false);
      } else {
        setError(err instanceof ApiError && err.status === 403 ? err.message : t("approvalCard.answerError"));
      }
    } finally {
      setBusy(false);
    }
  };

  const detailsLabel = t(open ? "today.waiting.hideDetails" : "today.waiting.details");
  return (
    <>
      <div className={TEXT}>
        {/* `relative`: on a phone the sentence's link covers all of this, one tap target. */}
        <div className={cn(HEAD, "relative")}>
          <Avatar agentId={item.agentId} name={name} size="sm" className={FACE} />
          <div className="min-w-0 flex-1">
            <p id={textId} className={HEADLINE}>
              {/* The sentence opens the conversation it was asked in (the design has no line for
                  it). On a phone its link covers the face and both lines, a 44 px target. */}
              <Link
                href={item.href}
                className="rounded-inner underline-offset-2 hover:underline max-sm:after:absolute max-sm:after:inset-x-0 max-sm:after:-inset-y-1 max-sm:after:content-['']"
              >
                <Sentence template={t("approval.wantsToUse", { name: NAME, tool: TOOL })} name={who} tool={tool} />
                {item.title && <span className="sr-only"> ({t("today.waiting.in", { title: item.title })})</span>}
              </Link>
              {warning && (
                <>
                  {" "}
                  <StatusPill status={warning.tone} className="h-5 px-2 align-middle">{t(warning.key)}</StatusPill>
                </>
              )}
            </p>
            {hasDetails ? (
              <>
                {second && <p className="truncate text-small text-muted sm:hidden">{second}</p>}
                {/* In the wide row the line under the sentence also opens the rest of the call, so
                    the details need no line of their own; on a phone they are in the conversation. */}
                <button
                  type="button"
                  aria-expanded={open}
                  aria-controls={detailsId}
                  title={second ? detailsLabel : undefined}
                  onClick={() => setOpen((value) => !value)}
                  className="block w-full min-w-0 cursor-pointer rounded-inner text-left text-small text-muted underline-offset-2 hover:text-ink hover:underline max-sm:hidden"
                >
                  {second ? <span className="line-clamp-2 break-words">{second}</span> : detailsLabel}
                </button>
              </>
            ) : (
              second && <p className={QUOTE}>{second}</p>
            )}
          </div>
        </div>
      </div>
      {open && (
        <div id={detailsId} className={cn(BELOW, "flex min-w-0 flex-col gap-2 sm:pl-[34px]")}>
          {(quietTag || aboutInDetails) && (
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-small text-muted">
              {quietTag && <StatusPill status={quietTag.tone} className="h-5 px-2">{t(quietTag.key)}</StatusPill>}
              {aboutInDetails && <span>{aboutInDetails}</span>}
            </p>
          )}
          {summary && <p className="break-words text-small text-muted">{summary}</p>}
          {entries.length > 0 && (
            <dl className="flex flex-col gap-1.5 rounded-field bg-inset px-2.5 py-2 font-mono text-small">
              {entries.map(([key, value]) => (
                <div key={key} className="min-w-0">
                  <dt className="text-muted">{key}</dt>
                  <dd className="max-h-48 overflow-auto whitespace-pre-wrap break-words text-ink">{typeof value === "string" ? value : JSON.stringify(value, null, 2)}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      )}
      {mayAnswer ? (
        <div className={ACTIONS}>
          <Button variant={primary ? "primary" : "secondary"} className={ACTION} disabled={busy} aria-describedby={textId} onClick={() => void answer("allow")}>
            {/* One answer here, so it is just "Allow" (once); a screen tool's covers the turn. */}
            {isScreenInput(call.tool) ? t("approval.allowThisTurn") : t("approval.allow")}
          </Button>
          <Button className={cn(ACTION, "text-danger")} disabled={busy} aria-describedby={textId} onClick={() => void answer("deny")}>
            {t("approval.deny")}
          </Button>
        </div>
      ) : (
        <p className={cn(BELOW, "text-small text-muted")}>{t("approvalCard.noPermission")}</p>
      )}
      {error && <p role="alert" className={cn(BELOW, "text-small text-danger")}>{error}</p>}
    </>
  );
}

const ROW_ICONS = { signed_out: KeyRound, out_of_credit: Gauge, usage_limit: Gauge, routine: Repeat } as const;

function RowItem({ item, name }: { item: WaitingRow; name: string | null }) {
  const t = useT();
  const { row } = item;
  const Icon = ROW_ICONS[row.kind as keyof typeof ROW_ICONS] ?? AlertTriangle;
  // On a phone a question is one card that opens its conversation, "Answer" in accent text at its
  // right (MobileToday.html; the li is `relative` for it). In the wide row it has an Answer button
  // like the other rows (Today.html).
  const cardHref = item.type === "question" ? item.href : null;
  return (
    <>
      <div className={TEXT}>
        <div className={HEAD}>
          {item.agentId !== null ? (
            <Avatar agentId={item.agentId} name={name} size="sm" className={FACE} />
          ) : (
            <span aria-hidden="true" className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-inset text-muted max-sm:size-[30px]">
              <Icon size={13} strokeWidth={1.7} />
            </span>
          )}
          <div className="min-w-0 flex-1">
            {item.type === "question" ? (
              <>
                <p className={HEADLINE}>
                  <Sentence template={t("today.waiting.question", { name: NAME })} name={name || t("approval.yourAgent")} />
                </p>
                <p className="line-clamp-2 break-words text-small text-muted">{row.title}</p>
              </>
            ) : (
              <>
                <p className={cn(HEADLINE, "break-words font-medium")}>{row.title}</p>
                {row.detail && <p className="break-words text-small text-muted">{row.detail}</p>}
              </>
            )}
          </div>
          {cardHref !== null && (
            <Link
              href={cardHref}
              // The whole card is the link (as on RoutineCard), its focus ring drawn around the card.
              className="shrink-0 text-body font-medium text-accent-text after:absolute after:inset-0 after:rounded-card after:content-[''] focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-focus sm:hidden"
            >
              {t(item.actionKey)}
            </Link>
          )}
        </div>
      </div>
      {item.href && (
        <div className={cn(ACTIONS, cardHref !== null && "max-sm:hidden")}>
          <LinkButton href={item.href} className={ACTION}>{t(item.actionKey)}</LinkButton>
        </div>
      )}
    </>
  );
}
