"use client";

import type { ReactNode, Ref } from "react";
import { Button } from "@/components/ui/Button";
import { StatusText, type Status } from "@/components/ui/StatusPill";
import { Card } from "@/components/ui/Surface";
import type { FollowUp, FollowUpState } from "@/lib/new-agent";
import { useT } from "@/lib/use-i18n";
import { LinkButton } from "./LinkButton";

const STATUS: Record<FollowUpState["status"], Status> = { queued: "idle", running: "running", done: "done", failed: "denied" };

// After POST /agents: the agent exists, and each follow-up request is listed with its own state and a
// Retry when it failed. Retrying never creates another agent.
export function FollowUpPanel({
  name,
  plan,
  states,
  outcome,
  retrying,
  onRetry,
  chatHref,
  settingsHref,
  headingRef,
}: {
  name: string;
  plan: FollowUp[];
  states: Record<string, FollowUpState>;
  outcome: "running" | "done" | "partial";
  retrying: string | null;
  onRetry: (item: FollowUp) => void;
  chatHref: string;
  settingsHref: string;
  headingRef: Ref<HTMLHeadingElement>;
}) {
  const t = useT();
  const word = (status: FollowUpState["status"]) =>
    status === "running" ? t("status.working") : status === "done" ? t("newAgent.stateDone") : status === "failed" ? t("newAgent.stateFailed") : t("newAgent.stateQueued");
  const label = (item: FollowUp) => {
    switch (item.kind) {
      case "apps": return t("newAgent.followApps");
      case "tools": return t("newAgent.followTools", { server: item.connectionName });
      case "soul": return t("newAgent.followSoul");
      case "client": return t("newAgent.followClient", { client: item.clientName });
      case "skills": return t("newAgent.followSkills");
    }
  };
  const title = outcome === "running" ? t("newAgent.progressTitle", { name }) : outcome === "done" ? t("newAgent.readyTitle", { name }) : t("newAgent.partialTitle", { name });

  return (
    <Card className="flex flex-col gap-4 p-6">
      <div className="flex flex-col gap-1" aria-live="polite">
        <h2 ref={headingRef} tabIndex={-1} className="text-h2 font-semibold tracking-[-0.01em] outline-none">{title}</h2>
        {outcome === "partial" ? <p className="text-body text-muted">{t("newAgent.partialBody")}</p> : null}
      </div>
      <ul className="flex flex-col divide-y divide-line">
        <Row label={t("newAgent.followAgent")} status="done" word={word("done")} />
        {plan.map((item) => {
          const state = states[item.key] ?? { status: "queued", error: null };
          const busy = retrying === item.key || state.status === "running";
          return (
            <Row
              key={item.key}
              label={label(item)}
              status={state.status}
              word={word(state.status)}
              error={state.status === "failed" ? state.error : null}
              note={state.status === "done" ? state.note ?? null : null}
              action={state.status === "failed" || retrying === item.key ? (
                <Button size="sm" loading={busy} disabled={retrying !== null && retrying !== item.key} onClick={() => onRetry(item)}>
                  {t("newAgent.retry")}
                </Button>
              ) : null}
            />
          );
        })}
      </ul>
      {outcome !== "running" ? (
        <div className="flex flex-wrap gap-2 pt-1">
          <LinkButton href={chatHref} variant="primary">{t("newAgent.openChat")}</LinkButton>
          <LinkButton href={settingsHref}>{t("newAgent.openSettings")}</LinkButton>
        </div>
      ) : null}
    </Card>
  );
}

function Row({ label, status, word, error = null, note = null, action = null }: { label: string; status: FollowUpState["status"]; word: string; error?: string | null; note?: string | null; action?: ReactNode }) {
  return (
    <li className="flex flex-col gap-1 py-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="min-w-0 flex-1 text-body text-ink">{label}</span>
        <StatusText status={STATUS[status]}>{word}</StatusText>
        {action}
      </div>
      {error ? <p className="text-small text-danger">{error}</p> : null}
      {note ? <p className="text-small text-muted">{note}</p> : null}
    </li>
  );
}
