"use client";

import { AlertTriangle, ChevronRight, Gauge, Inbox, KeyRound, Repeat } from "lucide-react";
import Link from "next/link";
import { Fragment, useId, useState } from "react";
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
// Marks where a translated sentence puts the agent's name or the tool.
const NAME = "\u0001";
const TOOL = "\u0000";

export function WaitingSection({
  items,
  loading,
  failed,
  agentName,
  onAnswered,
}: {
  items: WaitingItem[];
  loading: boolean;
  failed: boolean;
  agentName: (id: number | null) => string | null;
  // An approval was answered here (or turned out to be answered already): read again.
  onAnswered: () => void;
}) {
  const t = useT();
  // Answered here, and hidden until the next read drops them.
  const [answered, setAnswered] = useState<ReadonlySet<string>>(() => new Set());
  const shown = items.filter((item) => !answered.has(item.key));
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
  } else if (failed && items.length === 0) {
    body = <div className={PLAIN}><SectionNote tone="danger">{t("today.waiting.loadFailed")}</SectionNote></div>;
  } else if (shown.length === 0) {
    body = (
      <div className={PLAIN}>
        <EmptyState compact icon={<Inbox size={20} />} title={t("today.waiting.emptyTitle")} description={t("today.waiting.emptyBody")} className="py-6" />
      </div>
    );
  } else {
    body = (
      <ul className="flex flex-col gap-3 sm:gap-0">
        {shown.map((item) => (
          <li key={item.key} className={ITEM}>
            {item.type === "approval" ? (
              <ApprovalItem
                item={item}
                name={agentName(item.agentId)}
                primary={item.key === firstCall}
                onDone={(gone) => {
                  if (gone) setAnswered((current) => new Set(current).add(item.key));
                  onAnswered();
                }}
              />
            ) : (
              <RowItem item={item} name={agentName(item.agentId)} />
            )}
          </li>
        ))}
      </ul>
    );
  }
  return <TodaySection title={t("today.waiting.title")} badge={badge} cards>{body}</TodaySection>;
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
      toast(t(decision === "allow" ? "today.waiting.allowed" : "today.waiting.denied", { tool }), "success");
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
