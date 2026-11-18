"use client";

import { useCallback, useMemo } from "react";
import { formatMessageTime } from "@/lib/relative-time";
import { rowAgent, type ResultRow, type ResultSource, type ResultStatus } from "@/lib/results";
import { useT } from "@/lib/use-i18n";
import { useAppShell } from "@/components/shell/AppShell";
import type { Status } from "@/components/ui/StatusPill";

// Colour means status: amber for what needs you (review, a question), blue running, green done.
export const STATUS_TONE: Record<ResultStatus, Status> = { review: "waiting", waiting: "waiting", running: "running", done: "done" };

const STATUS_KEY: Record<ResultStatus, string> = {
  review: "results.status.review",
  waiting: "results.status.waiting",
  running: "results.status.running",
  done: "results.status.done",
};

const SOURCE_KEY: Record<ResultSource, string> = {
  task: "results.source.task",
  routine: "results.source.routine",
  chat: "results.source.chat",
};

/** The words a result row prints: who made it, where it came from, its status and when. */
export function useResultLabels() {
  const t = useT();
  const { agents } = useAppShell();
  // null until the shell has the agents (loading, or GET /agents failed): no name is known then.
  const names = useMemo(() => (agents === null ? null : new Map(agents.map((agent) => [agent.id, agent.name]))), [agents]);

  // What the row's meta line and the search print: the agent's or team's name, "Unassigned" for
  // a task nobody is on, "Removed agent" only for an id the loaded agents lack, and nothing while
  // the agents are not known.
  const agentOf = useCallback((row: ResultRow): string | null => {
    const who = rowAgent(row, names);
    switch (who.kind) {
      case "name": return who.name;
      case "team": return t("results.team");
      case "unassigned": return t("results.unassigned");
      case "removed": return t("results.unknownAgent");
      default: return null;
    }
  }, [names, t]);

  // The name a sentence can carry ("{name} is still working on this"); null when there is no
  // real name, so the sentence is said without one.
  const nameOf = useCallback((row: ResultRow): string | null => {
    const who = rowAgent(row, names);
    return who.kind === "name" ? who.name : who.kind === "team" ? t("results.team") : null;
  }, [names, t]);

  // The agent whose picture to show: none for an agent that is gone (no initials of a stand-in word).
  const avatarOf = useCallback((row: ResultRow) => (row.agentId !== null && names?.has(row.agentId) ? row.agentId : null), [names]);

  const statusOf = useCallback((row: Pick<ResultRow, "status">) => t(STATUS_KEY[row.status]), [t]);
  const sourceOf = useCallback((row: Pick<ResultRow, "source">) => t(SOURCE_KEY[row.source]), [t]);

  // "Verde · Routine · 07:35"; work under way says so instead of a time.
  const metaOf = useCallback((row: ResultRow) => {
    const when = row.status === "running" ? t("results.inProgress") : formatMessageTime(row.at, t);
    return [agentOf(row), sourceOf(row), when].filter(Boolean).join(" · ");
  }, [agentOf, sourceOf, t]);

  return { agentOf, nameOf, avatarOf, statusOf, sourceOf, metaOf };
}
