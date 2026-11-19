"use client";

import { ArrowDown, Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import { Fragment, useEffect, useRef, useState } from "react";
import { formatReactionReply, isLatestAssistantMessage, loadThreadReactions, saveThreadReaction, type ReactionKind, type ReactionsMap } from "@/lib/reactions";
import type { ApprovalScope } from "@/lib/api";
import type { Transcript, TranscriptItem } from "@/lib/transcript";
import { announcement, groupToolCalls } from "@/lib/transcript-view";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { useT } from "@/lib/use-i18n";
import { useMediaQuery } from "@/lib/use-media-query";
import { workingPhase } from "@/lib/working-status";
import { agentRunStarts, awaitingCalls, dateDividerKeys, usageHomes } from "@/lib/chat-page";
import { WorkingStatus } from "./WorkingStatus";
import {
  AgentByline,
  ApprovalCard,
  AssistantMessage,
  DateDivider,
  SessionReset,
  RecalledChip,
  CompactedMarker,
  EngineSwitched,
  ToolGroup,
  type Remembered,
  TurnEnd,
  turnUsage,
  UserMessage,
} from "./items";

import { NeedsYouCard } from "./NeedsYouCard";
import { RoutineChangeCard } from "./RoutineChangeCard";
import { DelegationCard, AgentCreatedCard, TeamNoticeCard, TeamSetupCard } from "./TeamCards";

const STICK_DISTANCE_PX = 80;
const PHONE = "(max-width: 639px)";

// Says the few things worth hearing (an approval waiting, a finished answer, a failure) once,
// in a visually hidden polite region. The transcript itself is not live: it would be re-read on
// every tool update.
function Announcer({ items }: { items: Transcript["items"] }) {
  const [text, setText] = useState("");
  const spoken = useRef<string | null>(null);
  useEffect(() => {
    const next = announcement(items);
    if (next && next.key !== spoken.current) {
      // The first look at a conversation is history, not news: remember it without speaking.
      if (spoken.current !== null) setText(next.text);
      spoken.current = next.key;
    } else if (!next && spoken.current === null) {
      spoken.current = "";
    }
  }, [items]);
  return <div role="status" aria-live="polite" className="sr-only">{text}</div>;
}

// The transcript, oldest first. It follows new content only while the person is
// at the bottom: scrolling up to read leaves the view where it is, and a button brings
// them back. With nothing open (onNewChat given) the empty state is the chat home (design:
// Main.html): the team, "Pick an agent to start" and New chat, with no message box below.
export function Conversation({
  transcript,
  answering,
  approvalErrors,
  onAnswer,
  onReactionReply,
  sendingReactionReplyDisabled,
  remembered = {},
  undoneRules = [],
  onUndo,
  onBranch,
  threadId = null,
  workspacePath = null,
  emptyHint,
  emptyAction,
  agent = null,
  team = [],
  loading = false,
  onNewChat,
  onOpenComputer,
  computersHref,
  underChrome = false,
  onUnderChange,
}: {
  // The transcript runs under the chat's floating top bar (ChatApp): it reaches up behind the bar by
  // --chat-under and starts below it, and onUnderChange says whether any of it is under the bar
  // (scrolled at all), so the bar can turn from the page colour to frosted glass.
  underChrome?: boolean;
  onUnderChange?: (under: boolean) => void;
  // The chat home: nothing is open. The empty state offers New chat (the page shows no message box).
  onNewChat?: () => void;
  // Edit a past message and resend it in a new branch.
  onBranch?: (turnId: number, text: string) => Promise<boolean>;
  // The conversation the transcript belongs to: attachments are fetched from it.
  threadId?: number | null;
  // The pinned workspace also scopes download links in assistant replies.
  workspacePath?: string | null;
  // What to say when there is nothing yet (depends on whether an engine is ready).
  emptyHint?: string;
  // Shown under the hint, e.g. a button that opens the engine sign-in.
  emptyAction?: { label: string; onClick: () => void };
  // Who the conversation is with, for the empty state; null for a plain chat.
  agent?: { id: number; name: string } | null;
  // A few of the team's agents, shown when no agent is picked yet.
  team?: { id: number; name: string }[];
  // The conversation is still being fetched: show placeholders instead of the empty state.
  loading?: boolean;
  // Opens this conversation's Computer panel: a failed answer whose agent could not reach its own
  // computer offers it. `computersHref`: the Computers page, when the agent has a cloud computer there.
  onOpenComputer?: () => void;
  computersHref?: string;
  transcript: Transcript;
  answering: string | null;
  approvalErrors: Record<string, string>;
  onAnswer: (approvalId: string, decision: "allow" | "deny", scope?: ApprovalScope) => void;
  onReactionReply: (message: string) => Promise<boolean>;
  sendingReactionReplyDisabled: boolean;
  // "Always allow" outcomes by approval id, from answers given on this page.
  remembered?: Record<string, Remembered>;
  undoneRules?: number[];
  onUndo?: (ruleId: number) => void;
}) {
  const t = useT();
  const scroller = useRef<HTMLDivElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const stuck = useRef(true);
  const [away, setAway] = useState(false);
  // What onUnderChange last said (null: nothing yet), so it is told only when that changes.
  const under = useRef<boolean | null>(null);
  const reportUnder = () => {
    const el = scroller.current;
    if (!el || !onUnderChange) return;
    const next = el.scrollTop > 0;
    if (next === under.current) return;
    under.current = next;
    onUnderChange(next);
  };
  // Scrolling says it (onScroll, also when the view follows new content); after each render too, as
  // a conversation that never scrolls, or one cut shorter, may send no scroll event.
  useEffect(() => { reportUnder(); });

  useEffect(() => {
    const el = scroller.current;
    if (el && stuck.current) el.scrollTop = el.scrollHeight;
  }, [transcript.items.length, transcript.typing, transcript.runningTurnId]);

  // Reading back through the conversation, the first row in view and how far it sat from the top of
  // the view, so a change of layout can put it back where it was.
  const anchor = useRef<{ row: Element; offset: number } | null>(null);
  const rememberAnchor = () => {
    const el = scroller.current;
    const content = log.current;
    if (!el || !content) return;
    const top = el.getBoundingClientRect().top;
    anchor.current = null;
    for (const row of Array.from(content.children)) {
      const box = row.getBoundingClientRect();
      if (box.bottom > top) {
        anchor.current = { row, offset: box.top - top };
        return;
      }
    }
  };

  // Stay at the end while the person is there, whatever changes the height afterwards: the
  // approval card docking or the message box growing (the view gets shorter), a table or a
  // picture laying itself out (the transcript gets longer). Away from the end, keep their place:
  // opening the right-hand panel narrows the column, which rewraps every message above and
  // can grow the top bar, and without this the line being read would slide out of view.
  useEffect(() => {
    const el = scroller.current;
    const content = log.current;
    if (!el || !content || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (stuck.current) {
        el.scrollTop = el.scrollHeight;
        return;
      }
      const held = anchor.current;
      if (held && held.row.isConnected) {
        const moved = held.row.getBoundingClientRect().top - el.getBoundingClientRect().top - held.offset;
        if (Math.abs(moved) >= 1) el.scrollTop += moved;
      }
      rememberAnchor();
    });
    observer.observe(el);
    // The border box: the top bar growing changes the transcript's top padding, not its content.
    observer.observe(content, { box: "border-box" });
    return () => observer.disconnect();
  }, []);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    stuck.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_DISTANCE_PX;
    setAway((previous) => (previous === !stuck.current ? previous : !stuck.current));
    reportUnder();
    rememberAnchor();
  };

  const jumpToLatest = () => {
    const el = scroller.current;
    if (!el) return;
    stuck.current = true;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  };

  const [threadReactions, setThreadReactions] = useState<{ id: number | null | undefined; map: ReactionsMap }>(() => ({
    id: threadId,
    map: loadThreadReactions(threadId),
  }));

  const reactions = threadReactions.id === threadId ? threadReactions.map : loadThreadReactions(threadId);

  const handleReact = async (itemKey: string, reaction: ReactionKind) => {
    if (reactions[itemKey] === reaction) {
      const next = saveThreadReaction(threadId, itemKey, null);
      setThreadReactions({ id: threadId, map: next });
      return;
    }
    if (!await onReactionReply(formatReactionReply(reaction))) return;
    const next = saveThreadReaction(threadId, itemKey, reaction);
    setThreadReactions({ id: threadId, map: next });
  };

  const working = transcript.runningTurnId !== null && !transcript.typing;
  const waitingOnYou = transcript.items.some((i) => i.kind === "approval" && i.status === "pending");
  const phone = useMediaQuery(PHONE, false);
  const empty = transcript.items.length === 0 && transcript.typing === null && !loading;
  const showSkeleton = loading && transcript.items.length === 0 && transcript.typing === null;
  // The home, or a new chat with no agent yet: the team and "Pick an agent to start".
  const picking = onNewChat !== undefined || (!agent && team.length > 0);
  // A waiting approval is docked above the composer (DockedApproval), not in the transcript, and so
  // is the call it holds (design: Chat.html, MobileChat.html): the transcript ends with the agent's
  // words. The call comes back as a normal row once it is answered.
  const awaiting = awaitingCalls(transcript.items);
  const groupedItems = groupToolCalls(transcript.items.filter((item) =>
    !(item.kind === "approval" && item.status === "pending") && !(item.kind === "tool" && awaiting.has(item.key))));
  const dividerKeys = dateDividerKeys(groupedItems);
  // The agent's face and name open each run of its replies (a plain chat has no agent to show).
  const runs = agentRunStarts(groupedItems, dividerKeys);
  // Each turn's usage line sits with its last answer's actions (shown on hover), not on its own.
  const homes = usageHomes(transcript.items);
  const usageFor = new Map<string, string>();
  for (const item of transcript.items) {
    if (item.kind !== "turn_end" || item.turnId === null) continue;
    const home = homes.get(item.turnId);
    const usage = turnUsage(item);
    if (home && usage) usageFor.set(home, usage);
  }
  return (
    // Under the top bar, the transcript reaches up behind it (a negative margin of --chat-under) and
    // its first line starts below it, so at rest nothing is under the bar and the page looks as it
    // did; scrolling, the lines pass under the frosted bar.
    <div className={cn("relative flex min-h-0 flex-1 flex-col", underChrome && "mt-[calc(var(--chat-under)*-1)]")}>
      <Announcer items={transcript.items} />
      {/* Only the conversation scrolls; the approval card and composer stay pinned below it. */}
      <div
        ref={scroller}
        onScroll={onScroll}
        className={cn(
          // scroll-pb-16: what Tab focuses stops 64 px above the bottom, clear of the fade and the
          // floating jump button below; while focus is shown inside, the fade lifts as well (peer).
          // Under the top bar, it also stops below the bar (scroll-pt).
          "peer relative min-h-0 flex-1 scroll-pb-16 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          underChrome && "scroll-pt-(--chat-under)",
        )}
      >
        <div
          ref={log}
          role="log"
          aria-live="off"
          aria-label={t("chat.conversation")}
          className={cn(
            "mx-auto flex w-full max-w-[760px] flex-col gap-4 px-4 sm:px-6",
            underChrome ? "pb-6 pt-[calc(var(--chat-under)_+_1.5rem)]" : "py-6",
            empty && "min-h-full justify-center",
          )}
        >
          {showSkeleton && (
            // Design: States, "Chat: loading": one message, then four lines of an answer.
            <div role="status" aria-busy="true" className="flex flex-col gap-3.5 py-2">
              <span className="sr-only">{t("chat.loading")}</span>
              <Skeleton className="ml-auto h-9 w-[55%]" />
              <Skeleton className="h-2.5 w-[90%]" />
              <Skeleton className="h-2.5 w-3/4" />
              <Skeleton className="h-2.5 w-[82%]" />
              <Skeleton className="h-2.5 w-2/5" />
            </div>
          )}
          {empty && (
            <div className={cn("flex flex-col items-center px-6 py-16 text-center", picking ? "gap-4" : "gap-3")}>
              {picking ? (
                <>
                  {team.length > 0 && (
                    <div aria-hidden="true" className="flex pl-2">
                      {team.slice(0, 3).map((member) => (
                        // A 2px page-coloured border (not a ring): each face takes 40px and steps 32px
                        // (design: Main.html), so the next one never clips the initials.
                        <span key={member.id} className="-ml-2 inline-flex rounded-full border-2 border-surface">
                          <Avatar agentId={member.id} name={member.name} size="md" className="size-9 text-[13px]" />
                        </span>
                      ))}
                    </div>
                  )}
                  <h1 className="text-h2 font-semibold tracking-[-0.01em]">{t("chat.pickAgent")}</h1>
                  {/* The home has no message box; a new chat with no agent yet has one below. */}
                  <p className="max-w-[360px] text-body text-muted">{onNewChat ? t("chatPage.pickAgentBody") : t("chat.pickAgentBody")}</p>
                  {onNewChat && (
                    <Button variant="primary" icon={<Plus size={15} strokeWidth={1.7} aria-hidden="true" />} onClick={onNewChat}>
                      {t("shell.newChat")}
                    </Button>
                  )}
                </>
              ) : (
                // Design: States, "Chat: new conversation".
                <>
                  <Avatar agentId={agent?.id ?? null} name={agent?.name} size="xl" />
                  <h1 className="text-h3 font-semibold tracking-[-0.01em]">{agent ? t("chatPage.startWith", { name: agent.name }) : t("chat.emptyPrompt")}</h1>
                </>
              )}
              {emptyHint && <p className="max-w-md text-sm text-muted">{emptyHint}</p>}
              {emptyAction && <Button onClick={emptyAction.onClick}>{emptyAction.label}</Button>}
            </div>
          )}

          {groupedItems.map((item) => {
            const ts = "ts" in item && typeof item.ts === "string" ? item.ts : null;
            const dateDivider = dividerKeys.has(item.key) && ts ? (
              <DateDivider key={`date-${item.key}`} ts={ts} />
            ) : null;

              let node: React.ReactNode = null;
              switch (item.kind) {
                case "needs_you":
                  node = <NeedsYouCard key={item.key} item={item} />;
                  break;
                case "team_job":
                  node = <DelegationCard key={item.key} item={item} />;
                  break;
                case "team_notice":
                  node = <TeamNoticeCard key={item.key} item={item} />;
                  break;
                case "team_setup":
                  node = <TeamSetupCard key={item.key} item={item} />;
                  break;
                case "routine_change":
                  node = <RoutineChangeCard key={item.key} item={item} />;
                  break;
                case "agent_created":
                  node = <AgentCreatedCard key={item.key} item={item} />;
                  break;
                case "tool_group":
                  node = (
                    <ToolGroup
                      key={item.key}
                      tools={item.tools as Extract<TranscriptItem, { kind: "tool" }>[]}
                      approvals={item.approvals as Record<string, Extract<TranscriptItem, { kind: "approval" }>>}
                    />
                  );
                  break;
                case "user":
                  node = <UserMessage key={item.key} item={item} threadId={threadId} onBranch={onBranch} />;
                  break;
                case "assistant": {
                  const canReplyToMessage = !item.incomplete && isLatestAssistantMessage(item.key, transcript.items);
                  node = (
                    <AssistantMessage
                      key={item.key}
                      text={item.text}
                      threadId={threadId}
                      workspacePath={workspacePath}
                      incomplete={item.incomplete}
                      ts={item.ts}
                      usage={usageFor.get(item.key) ?? null}
                      reaction={reactions[item.key] ?? null}
                      onReact={canReplyToMessage ? (r) => { void handleReact(item.key, r); } : undefined}
                      disabled={answering !== null || sendingReactionReplyDisabled}
                    />
                  );
                  break;
                }
                case "approval":
                  node = (
                    <ApprovalCard
                      key={item.key}
                      item={item}
                      answering={answering === item.approvalId}
                      error={approvalErrors[item.approvalId] ?? null}
                      onAnswer={(decision, scope) => onAnswer(item.approvalId, decision, scope)}
                      remembered={remembered[item.approvalId]}
                      undoneRules={undoneRules}
                      onUndo={onUndo}
                      agentName={agent?.name}
                    />
                  );
                  break;
                case "turn_end":
                  node = <TurnEnd key={item.key} item={item} agentName={agent?.name} showUsage={item.turnId === null || !homes.has(item.turnId)} onOpenComputer={onOpenComputer} computersHref={computersHref} />;
                  break;
                case "session_reset":
                  node = <SessionReset key={item.key} item={item} />;
                  break;
                case "recalled":
                  node = <RecalledChip key={item.key} item={item} />;
                  break;
                case "compacted":
                  node = <CompactedMarker key={item.key} item={item} />;
                  break;
                case "engine_switched":
                  node = <EngineSwitched key={item.key} item={item} />;
                  break;
              }

              if (agent && runs.starts.has(item.key)) {
                node = (
                  <div key={item.key} className="flex flex-col gap-2">
                    <AgentByline agent={agent} />
                    {node}
                  </div>
                );
              }

              if (dateDivider) {
                return (
                  <Fragment key={item.key}>
                    {dateDivider}
                    {node}
                  </Fragment>
                );
              }
              return node;
            })}

          {transcript.typing !== null && transcript.typing !== "" && (
            // A reply typed straight after the person spoke opens a run, so it carries the byline
            // now and keeps it when it lands as a stored message (nothing moves).
            agent && !runs.openAtEnd ? (
              <div className="flex flex-col gap-2">
                <AgentByline agent={agent} />
                <AssistantMessage text={transcript.typing} live />
              </div>
            ) : (
              <AssistantMessage text={transcript.typing} live />
            )
          )}

          {/* On a phone a waiting turn says so in the header pill and the docked card only
              (design: MobileChat.html); the line comes back while the agent works. `working` stays
              true while a call waits (the turn runs on, nothing is being typed), so the phone case
              is left out whatever it says. */}
          {transcript.runningTurnId !== null && (working || waitingOnYou) && !(phone && waitingOnYou) && (
            <WorkingStatus key={transcript.runningTurnId} phase={workingPhase(transcript.items)} turnId={transcript.runningTurnId} />
          )}
        </div>
      </div>
      {/* Away from the end the last 40 px fade into the page, so no line is cut mid-glyph at the
          edge. A gradient laid over the transcript, not a mask on it: in Chromium a mask on the
          scroller under the frosted top bar left stale strips of old lines on screen. */}
      {away && <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-linear-to-b from-transparent to-surface peer-has-[:focus-visible]:hidden" />}
      {/* Read away from the end: the way back floats over the bottom of the transcript, which runs
          straight down to the docked card (design: Chat.html). A floating control in frosted glass
          (its edge and shadow, no border) that blurs the lines under it; solid on hover. */}
      {away && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
          <button
            type="button"
            onClick={jumpToLatest}
            aria-label={t("chat.jumpLatest")}
            title={t("chat.jumpLatest")}
            className="pointer-events-auto inline-flex size-9 cursor-pointer animate-pop-in items-center justify-center rounded-full glass text-ink hover:bg-hover touch:size-11 max-sm:size-11"
          >
            <ArrowDown size={16} strokeWidth={1.7} aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
