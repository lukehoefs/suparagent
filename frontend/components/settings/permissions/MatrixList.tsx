"use client";

// The matrix on a phone: one column, no sideways scrolling. Each source is a card that says how many
// agents have something from it; the one open source lists every agent with its tools to tick (44 px
// rows), so the same "one source at a time" rule holds as on a wider screen.
import { ChevronDown } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import type { Agent } from "@/lib/api";
import {
  MAX_AGENT_SKILLS, agentsWithAny, cellChanged, cellFailed, grantKey, isEditable, itemChangeKey, itemChanged, keysState, pairKey,
  sourceCount, sourceKeys, type MatrixSource,
} from "@/lib/permissions-matrix";
import { useT } from "@/lib/use-i18n";
import { cn } from "@/lib/cn";
import { Avatar } from "@/components/ui/Avatar";
import { StatusPill, StatusText } from "@/components/ui/StatusPill";
import { AppCell } from "./AppCell";
import { ReadOnlyNote, ReadOnlyPill, TriCheckbox, itemText, lockText, usePlural, type MatrixView } from "./shared";

export function MatrixList({ view, onRetry }: { view: MatrixView; onRetry: () => void }) {
  const t = useT();
  const plural = usePlural();
  const agentIds = view.agents.map((agent) => agent.id);
  const openRef = useRef<HTMLButtonElement>(null);
  const listId = useId();
  // Keep the opened card's header in view: the card above it may just have closed.
  useEffect(() => {
    if (view.expanded) openRef.current?.scrollIntoView({ block: "nearest" });
  }, [view.expanded]);

  return (
    <div className="flex flex-col gap-3">
      <ul aria-label={t("permissions.matrix.label")} className="flex flex-col gap-3">
        {view.sources.map((source, index) => {
          const label = view.labelOf(source);
          const isOpen = source.id === view.expanded;
          const changed = view.agents.some((agent) => cellChanged(source, agent.id, view.saved, view.desired));
          const failed = view.agents.some((agent) => cellFailed(source, agent.id, view.failed));
          // By position: a source id can hold spaces, which an id reference cannot.
          const panelId = `${listId}-${index}`;
          return (
            <li key={source.id} className={cn("rounded-card border border-line bg-raised", changed && !isOpen && "bg-accent-bg")}>
              <button
                ref={isOpen ? openRef : undefined}
                type="button"
                aria-expanded={isOpen}
                aria-controls={isOpen ? panelId : undefined}
                onClick={() => view.onExpand(isOpen ? null : source.id)}
                className="flex min-h-touch w-full cursor-pointer items-center gap-3 rounded-card px-4 py-3 text-left"
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-ink">{label}</span>
                  <span className="block text-small text-muted">
                    {plural("permissions.list.summary", agentsWithAny(source, agentIds, view.desired), { total: view.agents.length })}
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-2">
                    <ReadOnlyPill source={source} />
                    {failed ? <StatusText status="denied">{t("permissions.cell.failed")}</StatusText>
                      : changed ? <span className="text-small text-accent-text">{t("permissions.matrix.changed")}</span> : null}
                  </span>
                </span>
                <ChevronDown size={16} aria-hidden="true" className={cn("shrink-0 text-muted transition-transform", isOpen && "rotate-180")} />
              </button>
              {isOpen ? (
                <div id={panelId} className="flex flex-col gap-5 border-t border-line px-4 py-4">
                  <ReadOnlyNote source={source} label={label} onRetry={onRetry} disabled={view.disabled} />
                  {view.agents.map((agent) => <AgentGroup key={agent.id} source={source} agent={agent} view={view} />)}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      <p className="text-small text-muted">{t("permissions.matrix.footnote")}</p>
    </div>
  );
}

function AgentGroup({ source, agent, view }: { source: MatrixSource; agent: Agent; view: MatrixView }) {
  const t = useT();
  const lock = view.locks.get(pairKey(source.group, agent.id));
  const editable = isEditable(source, agent.id, view.locks);
  const { on, total } = sourceCount(source, agent.id, view.desired);
  const keys = sourceKeys(source, agent.id, view.locks);
  const label = view.labelOf(source);
  const groupId = useId();
  return (
    <fieldset className="flex min-w-0 flex-col gap-1">
      <legend className="flex w-full flex-wrap items-center gap-2 pb-1">
        <Avatar agentId={agent.id} name={agent.name} size="sm" />
        <span className="font-medium text-ink">{agent.name}</span>
        {lock === "load_failed" ? (
          <StatusText status="denied">{lockText(lock, t)}</StatusText>
        ) : (
          <span className="text-small text-muted">{lock ? lockText(lock, t) : t("permissions.matrix.count", { n: on, total })}</span>
        )}
        {source.kind === "skills" && view.over.has(agent.id) ? (
          <StatusPill status="waiting">{t("permissions.agent.skills", { n: view.skillCounts.get(agent.id) ?? 0, max: MAX_AGENT_SKILLS })}</StatusPill>
        ) : null}
      </legend>
      {source.kind !== "apps" && view.noTools.has(agent.id) ? <p className="text-small text-muted">{t("permissions.agent.noTools")}</p> : null}
      {lock ? null : source.kind === "apps" ? (
        <div className="flex flex-col gap-3">
          {source.items.map((item) => {
            const changed = itemChanged(source, item.id, agent.id, view.saved, view.desired);
            const failed = view.failed.has(itemChangeKey(source, item.id, agent.id));
            return (
              <div key={item.id} className={cn("flex flex-col gap-1.5 rounded-field px-2 py-2", changed && "bg-accent-bg")}>
                <span className="text-label font-medium text-ink">{item.label}</span>
                <AppCell
                  item={item}
                  agent={agent}
                  desired={view.desired}
                  accounts={view.accounts}
                  editable={editable}
                  disabled={view.disabled}
                  onLevel={(level) => view.onLevel(agent.id, item.id, level)}
                  onAccount={(accountId, allowed) => view.onAccount(agent.id, item.id, accountId, allowed)}
                />
                {failed ? <StatusText status="denied">{t("permissions.cell.failed")}</StatusText> : null}
              </div>
            );
          })}
        </div>
      ) : (
        <>
          {source.items.length > 1 && editable ? (
            <label className="flex min-h-touch cursor-pointer items-center gap-3 rounded-field px-2 text-label text-muted">
              <TriCheckbox
                state={keysState(view.desired.grants, keys)}
                label={t("permissions.list.all", { source: label, name: agent.name })}
                disabled={view.disabled}
                onChange={() => view.onToggle(keys)}
              />
              <span aria-hidden="true">{t("permissions.list.allShort")}</span>
            </label>
          ) : null}
          {source.items.map((item, index) => {
            const key = grantKey(source.group, item.id, agent.id);
            const changed = itemChanged(source, item.id, agent.id, view.saved, view.desired);
            const failed = view.failed.has(itemChangeKey(source, item.id, agent.id));
            const text = itemText(source, item.label);
            // aria-label hides the label's own words, so the name carries the changed and failed states
            // (the tint and "Not saved") and the description points at the tool's hint.
            const aria = [
              t("permissions.matrix.cell", { name: agent.name, item: text }),
              changed ? t("permissions.matrix.changed") : null,
              failed ? t("permissions.cell.failed") : null,
            ].filter(Boolean).join(". ");
            // By position: an item id can hold spaces, which an id reference cannot.
            const hintId = `${groupId}-${index}`;
            return (
              <label
                key={item.id}
                className={cn("flex min-h-touch cursor-pointer items-center gap-3 rounded-field px-2 py-1.5 has-[:disabled]:cursor-not-allowed", changed && "bg-accent-bg")}
              >
                <input
                  type="checkbox"
                  aria-label={aria}
                  aria-describedby={item.hint ? hintId : undefined}
                  className="size-5 shrink-0 cursor-pointer accent-(--accent) disabled:cursor-not-allowed disabled:opacity-50"
                  checked={view.desired.grants.has(key)}
                  disabled={view.disabled || !editable}
                  onChange={() => view.onToggle([key])}
                />
                <span className="min-w-0 flex-1">
                  <span className="block break-all font-mono text-[12px] text-ink">{text}</span>
                  {item.hint ? <span id={hintId} className="line-clamp-2 text-small text-muted">{item.hint}</span> : null}
                </span>
                {failed ? <StatusText status="denied" className="shrink-0">{t("permissions.cell.failedShort")}</StatusText> : null}
              </label>
            );
          })}
        </>
      )}
    </fieldset>
  );
}
