"use client";

// The selected result (design: Results.html, the panel beside the list): its status, the first
// lines of what it produced, and what you can do with it. A task in Review is approved here
// (PATCH /planner/items/{id} moves it to Done) or sent back with a request for changes (the page
// posts it into the task's conversation with POST /threads/{id}/turns, which then opens).
// Everything the agent does next still asks for approval in that chat.
import { Check, Download, MessageSquare } from "lucide-react";
import { forwardRef, useEffect, useState, type FormEvent, type RefObject } from "react";
import { ApiError } from "@/lib/api";
import { chatPath } from "@/lib/chat-link";
import { cn } from "@/lib/cn";
import { collaboration } from "@/lib/collaboration";
import { planner, type WorkItem } from "@/lib/planner-api";
import {
  boardTaskHref,
  downloadName,
  jobOutput,
  previewOf,
  routineHref,
  rowOutput,
  taskOutput,
  type ResultOutput,
  type ResultRow,
} from "@/lib/results";
import { useT } from "@/lib/use-i18n";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Field, Textarea } from "@/components/ui/Input";
import { LinkButton } from "@/components/ui/LinkButton";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatusPill } from "@/components/ui/StatusPill";
import { Panel } from "@/components/ui/Surface";
import { useToast } from "@/components/ui/Toast";
import { STATUS_TONE, useResultLabels } from "./labels";

type Output = { state: "loading" } | ({ state: "ready" } & ResultOutput) | { state: "failed"; message: string };

const MAX_REQUEST = 4000;
const GHOST = "text-muted hover:text-ink";
const messageOf = (err: unknown) => (err instanceof Error && err.message ? err.message : null);

// A routine run carries its output in the list; a task's and a job's are read when picked.
function needsRead(row: ResultRow): boolean {
  return (row.source === "task" && row.taskId !== null) || (row.source === "chat" && row.jobId !== null);
}

function saveText(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/markdown;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// The open "Ask for changes" form. The page keeps it per result, so picking another result, a
// filter or a read that moves the task does not lose the typed request.
export type AskState = { draft: string; sending: boolean; error: string | null };

export const ResultDetail = forwardRef<HTMLDivElement, {
  id: string;
  row: ResultRow;
  headingRef: RefObject<HTMLHeadingElement | null>;
  // The board's Done column; null when the board has none (Approve is then left out).
  doneColumnId: number | null;
  // The task behind a task row, with its current revision.
  task: WorkItem | null;
  // Kept open for its unsent request though the result is no longer listed (the task left Review).
  gone: boolean;
  ask: AskState | null;
  // A string opens the form or sets its text (and clears its error); null closes it.
  onAskChange: (draft: string | null) => void;
  // Sends the request; the page posts it, so it still lands if this panel closes meanwhile.
  onSend: () => void;
  onTaskSaved: (item: WorkItem) => void;
  // The board changed elsewhere: read it again.
  onStale: () => void;
}>(function ResultDetail({ id, row, headingRef, doneColumnId, task, gone, ask, onAskChange, onSend, onTaskSaved, onStale }, ref) {
  const t = useT();
  const toast = useToast();
  const labels = useResultLabels();
  const [read, setRead] = useState<Output>({ state: "loading" });
  const [readTick, setReadTick] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  // The form takes the focus when it is opened here, not when a kept draft is shown again.
  const [opened, setOpened] = useState(false);

  // Read again when the result changes state (a run finishing, a task edited); the shown output
  // stays until the new one arrives. The page keys this panel by the row, so the ids are fixed.
  const { source, taskId, jobId, description, status, at } = row;
  const reads = needsRead(row);
  useEffect(() => {
    if (!reads) return;
    let alive = true;
    const pending: Promise<ResultOutput> = source === "task" && taskId !== null
      ? planner.runs(taskId).then((runs) => taskOutput(runs, description))
      : collaboration.job(jobId as number).then(jobOutput);
    pending
      .then((value) => { if (alive) setRead({ state: "ready", ...value }); })
      .catch((err: unknown) => { if (alive) setRead({ state: "failed", message: messageOf(err) ?? t("results.detailFailed") }); });
    return () => { alive = false; };
  }, [reads, source, taskId, jobId, description, status, at, readTick, t]);
  const output: Output = reads ? read : { state: "ready", ...rowOutput(row) };

  // A name for the sentences; without one they are said without it.
  const name = labels.nameOf(row);
  const outputText = output.state === "ready" && output.kind === "output" ? output.text : null;

  const approve = async () => {
    if (!task || doneColumnId === null) return;
    setApproving(true);
    setError(null);
    try {
      const saved = await planner.update(task, { column_id: doneColumnId });
      onTaskSaved(saved);
      toast(t("results.approved", { title: row.title }));
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError(t("results.changedElsewhere"));
        onStale();
      } else setError(messageOf(err) ?? t("results.actionFailed"));
    } finally {
      setApproving(false);
    }
  };

  const send = (event: FormEvent) => {
    event.preventDefault();
    onSend();
  };

  const review = row.status === "review";
  const canApprove = review && !gone && task !== null && doneColumnId !== null;
  // A form already open stays open (with its draft) when the task leaves Review meanwhile.
  const canAsk = row.threadId !== null && (review || ask !== null);
  const workLabel = name ? t("results.openWork", { name }) : t("results.openWorkNoName");

  return (
    // The design sizes the panel's content box (340 to 460 px) and adds its 20 px padding and
    // 1 px edge; this box is border-box, so those are counted in: 382 to 502 px.
    <Panel ref={ref} id={id} role="complementary" aria-label={t("results.selected")} className="flex w-full min-w-0 max-w-full flex-[1_1_382px] flex-col gap-3.5 p-5 sm:max-w-[502px] xl:sticky xl:top-6">
      <div className="flex flex-wrap items-center gap-2">
        {/* A result no longer listed has no current status to show. */}
        {gone ? null : <StatusPill status={STATUS_TONE[row.status]}>{labels.statusOf(row)}</StatusPill>}
        <span className="min-w-0 text-small text-muted">{labels.metaOf(row)}</span>
      </div>
      <h2 ref={headingRef} tabIndex={-1} className="break-words text-h2 leading-[30px] font-semibold tracking-[-0.01em] text-ink">{row.title || t("results.untitled")}</h2>

      <OutputBox output={output} row={row} name={name} onRetry={() => { setRead({ state: "loading" }); setReadTick((n) => n + 1); }} />

      {error ? <Banner tone="danger" onDismiss={() => setError(null)}>{error}</Banner> : null}
      {ask?.error ? <Banner tone="danger" onDismiss={() => onAskChange(ask.draft)}>{ask.error}</Banner> : null}

      {ask && canAsk ? (
        <form onSubmit={send} className="flex flex-col gap-3">
          {gone || !review ? <p className="text-small text-muted">{t("results.leftReview")}</p> : null}
          <Field label={t("results.changesLabel")} hint={name ? t("results.changesHint", { name }) : t("results.changesHintNoName")}>
            {(props) => (
              <Textarea
                {...props}
                autoFocus={opened}
                rows={4}
                maxLength={MAX_REQUEST}
                value={ask.draft}
                onChange={(event) => onAskChange(event.target.value)}
                placeholder={t("results.changesPlaceholder")}
              />
            )}
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="primary" loading={ask.sending} disabled={ask.draft.trim() === ""}>{t("results.sendChanges")}</Button>
            <Button variant="ghost" disabled={ask.sending} onClick={() => onAskChange(null)}>{t("common.cancel")}</Button>
          </div>
        </form>
      ) : canApprove || canAsk ? (
        <div className="flex flex-wrap gap-2">
          {canApprove ? <Button variant="primary" icon={<Check size={15} strokeWidth={1.7} aria-hidden="true" />} loading={approving} onClick={() => void approve()}>{t("results.approve")}</Button> : null}
          {canAsk ? <Button disabled={approving} onClick={() => { setOpened(true); onAskChange(""); }}>{t("results.askChanges")}</Button> : null}
        </div>
      ) : null}
      {review && !canAsk ? <p className="text-small text-muted">{t("results.noConversation")}</p> : null}

      <div className="flex flex-wrap gap-2 border-t border-line pt-3.5">
        {row.threadId !== null ? (
          <LinkButton variant="ghost" href={chatPath({ kind: "thread", id: row.threadId })} icon={<MessageSquare size={15} strokeWidth={1.7} aria-hidden="true" />} className={GHOST}>{t("results.openChat")}</LinkButton>
        ) : null}
        {row.workThreadId !== null ? (
          // The label carries the agent's name (up to 80 characters): it shortens to fit a phone.
          <LinkButton variant="ghost" href={chatPath({ kind: "thread", id: row.workThreadId })} title={workLabel} className={cn(GHOST, "min-w-0 max-w-full shrink")}>
            <span className="truncate">{workLabel}</span>
          </LinkButton>
        ) : null}
        {row.taskId !== null ? <LinkButton variant="ghost" href={boardTaskHref(row.taskId)} className={GHOST}>{t("results.openTask")}</LinkButton> : null}
        {row.routineId !== null ? <LinkButton variant="ghost" href={routineHref(row.routineId)} className={GHOST}>{t("results.openRoutine")}</LinkButton> : null}
        {outputText ? (
          <Button variant="ghost" icon={<Download size={15} strokeWidth={1.7} aria-hidden="true" />} className={GHOST} onClick={() => saveText(downloadName(row.title), outputText)}>
            {t("results.download")}
          </Button>
        ) : null}
      </div>
    </Panel>
  );
});

function OutputBox({ output, row, name, onRetry }: { output: Output; row: ResultRow; name: string | null; onRetry: () => void }) {
  const t = useT();
  const box = "flex flex-col gap-2 rounded-card bg-inset p-3.5 text-body";
  if (output.state === "loading") {
    return (
      <div role="status" className={box}>
        <span className="sr-only">{t("results.loadingOutput")}</span>
        <Skeleton className="h-4 w-40 max-w-full" />
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-3/4" />
      </div>
    );
  }
  if (output.state === "failed") {
    return (
      <div className={box}>
        <p className="text-muted">{t("results.detailFailed")} {output.message !== t("results.detailFailed") ? output.message : null}</p>
        <div><Button size="sm" onClick={onRetry}>{t("results.retry")}</Button></div>
      </div>
    );
  }
  const preview = previewOf(output.text);
  // Work under way or waiting on you says so, whatever else is shown.
  const statusLine = row.status === "running" ? (name ? t("results.stillWorking", { name }) : t("results.stillWorkingNoName"))
    : row.status === "waiting" ? (name ? t("results.waitingAnswer", { name }) : t("results.waitingAnswerNoName"))
    : null;
  if (output.kind === "none" || !preview) {
    return <div className={box}><p className="text-muted">{statusLine ?? t("results.noOutput")}</p></div>;
  }
  // What was asked, or the question it waits on, is labelled so it is not read as the output.
  const label = output.kind === "brief" ? t(row.source === "chat" ? "results.preview.asked" : "results.preview.task")
    : output.kind === "question" ? (name ? t("results.preview.question", { name }) : t("results.preview.questionNoName"))
    : null;
  return (
    <div className={box}>
      {label ? <p className="text-small font-medium text-muted">{label}</p> : null}
      {preview.heading ? <p className="break-words font-medium text-ink">{preview.heading}</p> : null}
      {preview.body ? <p className="break-words text-muted">{preview.body}</p> : null}
      {statusLine ? <p className="text-small text-muted">{statusLine}</p> : null}
    </div>
  );
}
