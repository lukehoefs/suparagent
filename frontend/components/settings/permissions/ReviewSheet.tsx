"use client";

// The pending changes before they are saved (design: the review panel of Permissions.html): per agent,
// each tool or skill granted (+) or removed (−) and each app's new access, what did not save last time
// and why, agents that would pass the skill limit, and a tick to confirm access that lets an agent
// change things in an app. A floating panel: shadow, no border.
import { X } from "lucide-react";
import { forwardRef, useState, type RefObject } from "react";
import type { Agent } from "@/lib/api";
import {
  MAX_AGENT_SKILLS, SKILLS_GROUP, appWithoutAccount, changeKey, itemGroup, type AppChange, type Change, type MatrixSource,
} from "@/lib/permissions-matrix";
import type { Level } from "@/lib/connected-apps";
import { useT } from "@/lib/use-i18n";
import { cn } from "@/lib/cn";
import { Avatar } from "@/components/ui/Avatar";
import { IconButton } from "@/components/ui/IconButton";
import { StatusDotMark, StatusPill, StatusText } from "@/components/ui/StatusPill";
import { itemOrigin, itemText, usePlural } from "./shared";

// Lines shown per agent before "Show n more".
const LINES = 5;
const RANK: Record<Level, number> = { off: 0, read: 1, write: 2 };

export const ReviewSheet = forwardRef<HTMLDivElement, {
  id: string;
  changes: Change[];
  failed: ReadonlyMap<string, string>;
  agents: Agent[];
  sources: MatrixSource[];
  labelOf: (source: MatrixSource) => string;
  over: ReadonlySet<number>;
  raises: AppChange[];
  confirmed: boolean;
  onConfirm: (confirmed: boolean) => void;
  confirmRef: RefObject<HTMLInputElement | null>;
  headingRef: RefObject<HTMLHeadingElement | null>;
  onClose: () => void;
}>(function ReviewSheet({ id, changes, failed, agents, sources, labelOf, over, raises, confirmed, onConfirm, confirmRef, headingRef, onClose }, ref) {
  const t = useT();
  const plural = usePlural();
  const [opened, setOpened] = useState<ReadonlySet<number>>(new Set());
  const headingId = `${id}-heading`;

  const byAgent = new Map<number, Change[]>();
  for (const change of changes) byAgent.set(change.agentId, [...(byAgent.get(change.agentId) ?? []), change]);
  const appsSource = sources.find((source) => source.kind === "apps");
  const appName = (slug: string) => appsSource?.items.find((item) => item.id === slug)?.label ?? slug;
  const levelWord = (level: Level) => t(level === "off" ? "permissions.apps.off" : level === "read" ? "permissions.apps.read" : "permissions.apps.write");

  const line = (change: Change) => {
    if (change.kind === "app") {
      const direction = RANK[change.to] - RANK[change.from];
      const accounts = change.to === "off" ? null : appWithoutAccount(change)
        ? <StatusText status="waiting" className="align-middle">{t("permissions.review.noAccount")}</StatusText>
        : plural("permissions.apps.accountCount", change.accountsTo.length);
      return {
        sign: direction > 0 ? "+" : direction < 0 ? "−" : "·",
        tone: direction > 0 ? "text-success" : direction < 0 ? "text-danger" : "text-ink",
        action: t(direction > 0 ? "permissions.review.granted" : direction < 0 ? "permissions.review.removed" : "permissions.review.changedSr"),
        text: <>{t("permissions.review.app", { app: appName(change.app), level: levelWord(change.to), source: appsSource ? labelOf(appsSource) : "" })}{accounts ? <> · {accounts}</> : null}</>,
      };
    }
    // In the Computer source each tool is saved to its own computer's server, so the item's group decides.
    const source = sources.find((s) => s.items.some((i) => i.id === change.item && itemGroup(s, i) === change.group));
    const item = source ? source.items.find((i) => i.id === change.item && itemGroup(source, i) === change.group) : undefined;
    const name = source && item ? itemText(source, item.label) : change.item;
    return {
      sign: change.grant ? "+" : "−",
      tone: change.grant ? "text-success" : "text-danger",
      action: t(change.grant ? "permissions.review.granted" : "permissions.review.removed"),
      text: <>{t("permissions.review.item", { item: name, source: source && item ? itemOrigin(source, item, labelOf) : "" })}</>,
    };
  };

  return (
    <section
      ref={ref}
      id={id}
      aria-labelledby={headingId}
      className="pointer-events-auto flex max-h-[min(60vh,560px)] w-full max-w-[420px] flex-col gap-3.5 overflow-y-auto rounded-card bg-raised p-4 shadow-float"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 id={headingId} ref={headingRef} tabIndex={-1} className="text-h3 font-semibold text-ink">{t("permissions.review.title")}</h3>
        <IconButton label={t("permissions.review.close")} onClick={onClose}>
          <X size={16} aria-hidden="true" />
        </IconButton>
      </div>
      {[...byAgent].map(([agentId, list]) => {
        const agent = agents.find((a) => a.id === agentId);
        const showAll = opened.has(agentId) || list.length <= LINES + 1;
        const shown = showAll ? list : list.slice(0, LINES);
        return (
          <div key={agentId} className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2 font-medium text-ink">
              <Avatar agentId={agentId} name={agent?.name ?? ""} size="xs" />
              <span className="min-w-0 truncate">{agent?.name ?? t("permissions.review.unknownAgent")}</span>
            </div>
            <ul className="flex flex-col gap-1">
              {shown.map((change) => {
                const { sign, tone, action, text } = line(change);
                const error = failed.get(changeKey(change));
                return (
                  <li key={changeKey(change)} className="flex flex-col gap-0.5 text-label">
                    <span className={cn("break-words", tone)}>
                      <span aria-hidden="true">{sign} </span>
                      <span className="sr-only">{action}: </span>
                      {text}
                    </span>
                    {error ? (
                      <span className="flex items-start gap-1.5 text-small text-danger">
                        <StatusDotMark status="denied" className="mt-1.5" />
                        <span className="min-w-0 break-words">{t("permissions.review.failed", { reason: error })}</span>
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            {!showAll ? (
              <button
                type="button"
                onClick={() => setOpened((set) => new Set(set).add(agentId))}
                className="flex min-h-8 cursor-pointer items-center self-start text-small text-muted underline underline-offset-2 touch:min-h-11"
              >
                {plural("permissions.review.more", list.length - LINES)}
              </button>
            ) : null}
            {over.has(agentId) ? <StatusPill status="waiting" className="self-start">{t("permissions.review.overLimit", { max: MAX_AGENT_SKILLS })}</StatusPill> : null}
          </div>
        );
      })}
      {changes.some((c) => c.kind === "grant" && c.group === SKILLS_GROUP && !c.grant) ? (
        <p className="text-small text-muted">{t("permissions.review.skillRemoval")}</p>
      ) : null}
      {raises.length > 0 ? (
        <label className="flex cursor-pointer items-start gap-2 rounded-field bg-warning-bg px-3 py-2.5 text-small text-warning-on touch:min-h-11">
          <input
            ref={confirmRef}
            type="checkbox"
            className="mt-0.5 size-4 shrink-0 cursor-pointer accent-(--accent)"
            checked={confirmed}
            onChange={(event) => onConfirm(event.target.checked)}
          />
          <span>{plural("permissions.review.confirm", raises.length, { apps: [...new Set(raises.map((c) => appName(c.app)))].join(", ") })}</span>
        </label>
      ) : null}
    </section>
  );
});
