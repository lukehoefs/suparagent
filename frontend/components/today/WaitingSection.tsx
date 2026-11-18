"use client";

import { AlertTriangle, ChevronRight, Gauge, Inbox, KeyRound, Repeat } from "lucide-react";
import Link from "next/link";
import { Fragment, useEffect, useId, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { aboutSentence, parseRisk, riskTag, toolDisplayName } from "@/lib/approval-card";
import { isScreenInput } from "@/lib/approvals";
import { cn } from "@/lib/cn";
import { isComputerTool, toolLabel } from "@/lib/computers";
import { can } from "@/lib/permissions";
import type { WaitingApproval, WaitingItem, WaitingRow } from "@/lib/today";
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

// On a phone each waiting item is its own card with the waiting line (MobileToday.html); on a wide
// screen it is a row of the section card (Today.html).
const ITEM = "flex min-w-0 flex-col gap-2.5 rounded-card border border-warning-line bg-raised p-3.5 sm:flex-row sm:flex-wrap sm:items-start sm:gap-x-3 sm:gap-y-2 sm:rounded-none sm:border-0 sm:border-b sm:border-line sm:bg-transparent sm:px-4 sm:py-3 sm:last:border-b-0";
// The answers and links: full width and 44 px on a phone, side by side on a wide screen.
const ACTIONS = "flex gap-2 sm:ml-auto sm:shrink-0";
const ACTION = "max-sm:h-touch max-sm:flex-1";
// The same box as a phone's card, for what the section says when it lists nothing.
const PLAIN = "rounded-card border border-line bg-raised sm:rounded-none sm:border-0 sm:bg-transparent";
// Cards apart on a phone, one card on a wide screen: the list and the notes under it.
const NOTES = "flex flex-col gap-3 sm:gap-0";
// Marks where a translated sentence puts the agent's name or the tool.
const NAME = "\u0001";
const TOOL = "\u0000";

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
  // Answered here, and hidden until the next read drops them.
  const [answered, setAnswered] = useState<ReadonlySet<string>>(() => new Set());
  const shown = items.filter((item) => !answered.has(item.key));
  // An answered item leaves with the button that had focus: focus goes on to the next item (the
  // row itself, so a held key cannot answer the next call too), else to the section's heading.
  const rows = useRef(new Map<string, HTMLLIElement>());
  const heading = useRef<HTMLHeadingElement>(null);
  const latest = useRef(shown);
  const focusNext = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    latest.current = shown;
    const target = focusNext.current;
    if (target === undefined) return;
    focusNext.current = undefined;
    ((target !== null ? rows.current.get(target) : null) ?? heading.current)?.focus();
  });
  const hide = (key: string) => {
    const list = latest.current;
    const index = list.findIndex((item) => item.key === key);
    const next = index >= 0 ? (list[index + 1] ?? list[index - 1] ?? null) : null;
    // Focus left with the call (its buttons were disabled while the answer was sent), unless the
    // person has gone on to something else meanwhile.
    const active = document.activeElement;
    if (!active || active === document.body || rows.current.get(key)?.contains(active)) focusNext.current = next?.key ?? null;
    setAnswered((current) => new Set(current).add(key));
  };
  const partial = runningFailed || briefFailed;
  // One primary action on the page: Allow once on the first call that can be answered here.
  const firstCall = shown.find((item): item is WaitingApproval => item.type === "approval" && item.call !== null)?.key ?? null;
  const badge = shown.length > 0 ? (
    <span role="img" aria-label={t("today.waiting.count", { count: shown.length })}>
      <StatusPill status="waiting">{shown.length}</StatusPill>
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
    body = shown.length === 0 ? (
      notes ?? (
        <div className={PLAIN}>
          <EmptyState compact tone="done" headingLevel={3} icon={<Inbox size={20} />} title={t("today.waiting.emptyTitle")} description={t("today.waiting.emptyBody")} className="py-6" />
        </div>
      )
    ) : (
      <div className={NOTES}>
        <ul className="flex flex-col gap-3 sm:gap-0">
          {shown.map((item) => (
            <li
              key={item.key}
              tabIndex={-1}
              ref={(node) => {
                if (node) rows.current.set(item.key, node);
                else rows.current.delete(item.key);
              }}
              className={ITEM}
            >
              {item.type === "approval" ? (
                <ApprovalItem
                  item={item}
                  name={agentName(item.agentId)}
                  primary={item.key === firstCall}
                  onDone={(gone) => {
                    if (gone) hide(item.key);
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
          {part === NAME ? <strong className="font-semibold">{name}</strong> : part === TOOL ? <span className="break-all font-mono">{tool}</span> : part}
        </Fragment>
      ))}
    </>
  );
}

function ApprovalItem({ item, name, primary, onDone }: { item: WaitingApproval; name: string | null; primary: boolean; onDone: (gone: boolean) => void }) {
  const t = useT();
  const toast = useToast();
  const { session } = useSession();
  const mayAnswer = can(session?.permissions, "approve");
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
        <div className="flex min-w-0 flex-1 basis-60 items-start gap-2.5">
          <Avatar agentId={item.agentId} name={name} size="sm" className="mt-0.5" />
          <div className="min-w-0 flex-1">
            <p className="text-label text-ink"><Sentence template={t("today.waiting.asks", { name: NAME })} name={who} /></p>
            <p className="break-words text-small text-muted">{item.summary}</p>
          </div>
        </div>
        <div className={ACTIONS}>
          <LinkButton href={item.href} className={ACTION}>{t("today.waiting.openChat")}</LinkButton>
        </div>
      </>
    );
  }

  const tool = isComputerTool(call.tool) ? toolLabel(call.tool) : toolDisplayName(call.tool, call.summary);
  const about = aboutSentence(call.tool, call.tool_summary, call.kind);
  const tag = riskTag(parseRisk(call.risk));
  const entries = Object.entries(call.input ?? {});

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

  return (
    <>
      <div className="flex min-w-0 flex-1 basis-60 items-start gap-2.5">
        <Avatar agentId={item.agentId} name={name} size="sm" className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <p id={textId} className="text-label text-ink">
            <Sentence template={t("approval.wantsToUse", { name: NAME, tool: TOOL })} name={who} tool={tool} />
          </p>
          <p className="break-words text-small text-muted">{call.summary || call.tool}</p>
          {(tag || about) && (
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-small text-muted">
              {tag && <StatusPill status={tag.tone} className="h-5 px-2">{t(tag.key)}</StatusPill>}
              {about && <span>{"key" in about ? t(about.key) : about.text}</span>}
            </p>
          )}
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-small">
            <Link href={item.href} className="inline-flex min-w-0 items-center text-muted underline underline-offset-2 hover:text-ink max-sm:min-h-touch">
              <span className="truncate">{item.title ? t("today.waiting.in", { title: item.title }) : t("today.waiting.openChat")}</span>
            </Link>
            {entries.length > 0 && (
              <button
                type="button"
                aria-expanded={open}
                aria-controls={detailsId}
                onClick={() => setOpen((value) => !value)}
                className="inline-flex cursor-pointer items-center gap-1 rounded-inner text-muted hover:text-ink max-sm:min-h-touch"
              >
                <ChevronRight size={12} aria-hidden="true" className={cn("transition-transform", open && "rotate-90")} />
                {t(open ? "today.waiting.hideDetails" : "today.waiting.details")}
              </button>
            )}
          </p>
          {open && (
            <dl id={detailsId} className="mt-2 flex flex-col gap-1.5 rounded-field bg-inset px-2.5 py-2 font-mono text-small">
              {entries.map(([key, value]) => (
                <div key={key} className="min-w-0">
                  <dt className="text-muted">{key}</dt>
                  <dd className="max-h-48 overflow-auto whitespace-pre-wrap break-words text-ink">{typeof value === "string" ? value : JSON.stringify(value, null, 2)}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </div>
      {mayAnswer ? (
        <div className={ACTIONS}>
          <Button variant={primary ? "primary" : "secondary"} className={ACTION} disabled={busy} aria-describedby={textId} onClick={() => void answer("allow")}>
            {isScreenInput(call.tool) ? t("approval.allowThisTurn") : t("approval.allowOnce")}
          </Button>
          <Button className={cn(ACTION, "text-danger")} disabled={busy} aria-describedby={textId} onClick={() => void answer("deny")}>
            {t("approval.deny")}
          </Button>
        </div>
      ) : (
        <p className="text-small text-muted sm:basis-full">{t("approvalCard.noPermission")}</p>
      )}
      {error && <p role="alert" className="text-small text-danger sm:basis-full">{error}</p>}
    </>
  );
}

const ROW_ICONS = { signed_out: KeyRound, out_of_credit: Gauge, usage_limit: Gauge, routine: Repeat } as const;

function RowItem({ item, name }: { item: WaitingRow; name: string | null }) {
  const t = useT();
  const { row } = item;
  const Icon = ROW_ICONS[row.kind as keyof typeof ROW_ICONS] ?? AlertTriangle;
  return (
    <>
      <div className="flex min-w-0 flex-1 basis-60 items-start gap-2.5">
        {item.agentId !== null ? (
          <Avatar agentId={item.agentId} name={name} size="sm" className="mt-0.5" />
        ) : (
          <span aria-hidden="true" className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-inset text-muted">
            <Icon size={13} />
          </span>
        )}
        <div className="min-w-0 flex-1">
          {item.type === "question" ? (
            <>
              <p className="text-label text-ink">
                <Sentence template={t("today.waiting.question", { name: NAME })} name={name || t("approval.yourAgent")} />
              </p>
              <p className="break-words text-small text-muted">{row.title}</p>
            </>
          ) : (
            <>
              <p className="break-words text-label font-medium text-ink">{row.title}</p>
              {row.detail && <p className="break-words text-small text-muted">{row.detail}</p>}
            </>
          )}
        </div>
      </div>
      {item.href && (
        <div className={ACTIONS}>
          <LinkButton href={item.href} className={ACTION}>{t(item.actionKey)}</LinkButton>
        </div>
      )}
    </>
  );
}
