"use client";

// The matrix on a wider screen (design: Permissions.html): agents down the side, sources across the top.
// A collapsed source shows "n of m" per agent; the one open source shows each of its tools as a column,
// with a tick per agent and a tick for every agent at once. Changed cells are tinted. The table scrolls
// sideways inside its card when it is wider than the page; the agent column stays put.
import { ChevronDown, X } from "lucide-react";
import { useEffect, useRef } from "react";
import type { Agent } from "@/lib/api";
import {
  MAX_AGENT_SKILLS, cellChanged, cellFailed, columnKeys, grantKey, isEditable, itemChangeKey, itemChanged, keysState, pairKey,
  rowKeys, sourceCount, type MatrixItem, type MatrixSource,
} from "@/lib/permissions-matrix";
import { useT } from "@/lib/use-i18n";
import { cn } from "@/lib/cn";
import { Avatar } from "@/components/ui/Avatar";
import { IconButton } from "@/components/ui/IconButton";
import { StatusPill, StatusText } from "@/components/ui/StatusPill";
import { AppCell } from "./AppCell";
import { ReadOnlyNote, ReadOnlyPill, TriCheckbox, itemText, lockText, type MatrixView } from "./shared";

// Column widths from the design: the agent column, a collapsed source, one tool, one app.
const AGENT_W = "w-[210px] min-w-[210px]";
const SOURCE_W = "w-[150px] min-w-[150px]";
const TOOL_W = "w-[104px] min-w-[104px]";
const APP_W = "w-[188px] min-w-[188px]";

export function MatrixGrid({ view, onRetry }: { view: MatrixView; onRetry: () => void }) {
  const t = useT();
  const root = useRef<HTMLDivElement>(null);
  // Where focus goes once the open source has changed (the clicked control no longer exists).
  const pending = useRef<string | null>(null);
  const open = view.sources.find((source) => source.id === view.expanded) ?? null;

  const expand = (id: string | null, focus: string) => {
    pending.current = focus;
    view.onExpand(id);
  };
  useEffect(() => {
    const target = pending.current;
    if (!target) return;
    pending.current = null;
    const el = [...(root.current?.querySelectorAll<HTMLElement>("[data-focus]") ?? [])].find((node) => node.dataset.focus === target);
    el?.focus();
  }, [view.expanded]);

  const agentIds = view.agents.map((agent) => agent.id);

  return (
    <div ref={root} className="min-w-0 overflow-hidden rounded-card border border-line bg-raised">
      <div className="overflow-x-auto">
        <table aria-label={t("permissions.matrix.label")} className="min-w-full border-separate border-spacing-0 text-label">
          <thead>
            <tr>
              <th scope="col" rowSpan={open ? 2 : 1} className={cn("sticky left-0 z-10 bg-raised px-3.5 py-3 text-left align-bottom text-small font-medium text-muted", AGENT_W)}>
                {t("permissions.matrix.agent")}
              </th>
              {view.sources.map((source) => {
                const label = view.labelOf(source);
                if (source.id === open?.id) {
                  return (
                    <th key={source.id} scope="colgroup" colSpan={source.items.length} className="min-w-[200px] border-l border-line bg-inset p-0 text-left font-normal">
                      <div className="flex h-10 items-center gap-2 pl-3 pr-1">
                        <span className="min-w-0 truncate text-small font-semibold text-ink" title={label}>{label}</span>
                        <ReadOnlyPill source={source} />
                        <IconButton
                          label={t("permissions.matrix.close", { source: label })}
                          className="ml-auto"
                          data-focus={`close:${source.id}`}
                          onClick={() => expand(null, `open:${source.id}`)}
                        >
                          <X size={14} aria-hidden="true" />
                        </IconButton>
                      </div>
                    </th>
                  );
                }
                return (
                  <th key={source.id} scope="col" rowSpan={open ? 2 : 1} className={cn("border-l border-line p-0 align-top font-normal", SOURCE_W)}>
                    <button
                      type="button"
                      aria-expanded={false}
                      data-focus={`open:${source.id}`}
                      onClick={() => expand(source.id, `close:${source.id}`)}
                      className="flex size-full min-h-14 cursor-pointer flex-col items-start justify-center gap-1 px-3 py-2 text-left hover:bg-hover"
                    >
                      <span className="flex max-w-full items-center gap-1.5 text-small font-semibold text-ink">
                        <span className="line-clamp-2 break-words">{label}</span>
                        <ChevronDown size={13} aria-hidden="true" className="shrink-0 text-muted" />
                      </span>
                      <ReadOnlyPill source={source} />
                    </button>
                  </th>
                );
              })}
            </tr>
            {open ? (
              <tr>
                {open.items.map((item, index) => (
                  <ItemHeader key={item.id} source={open} item={item} first={index === 0} view={view} agentIds={agentIds} />
                ))}
              </tr>
            ) : null}
          </thead>
          <tbody>
            {view.agents.map((agent) => (
              <tr key={agent.id}>
                <AgentHeader agent={agent} view={view} />
                {view.sources.map((source) => (source.id === open?.id
                  ? source.items.map((item, index) => (
                    <ItemCell key={`${source.id}:${item.id}`} source={source} item={item} agent={agent} first={index === 0} view={view} focusId={index === 0 ? `cell:${source.id}:${agent.id}` : undefined} />
                  ))
                  : <CollapsedCell key={source.id} source={source} agent={agent} view={view} onOpen={() => expand(source.id, source.kind === "apps" || !isEditable(source, agent.id, view.locks) ? `close:${source.id}` : `cell:${source.id}:${agent.id}`)} />))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-col gap-1.5 border-t border-line px-3.5 py-2.5">
        <p className="text-small text-muted">{t("permissions.matrix.footnote")}</p>
        {open ? <ReadOnlyNote source={open} label={view.labelOf(open)} onRetry={onRetry} /> : null}
      </div>
    </div>
  );
}

function AgentHeader({ agent, view }: { agent: Agent; view: MatrixView }) {
  const t = useT();
  const keys = rowKeys(view.sources, agent.id, view.locks);
  const over = view.over.has(agent.id);
  return (
    <th scope="row" className={cn("sticky left-0 z-[1] border-t border-line bg-raised px-3.5 py-2.5 text-left align-middle font-normal", AGENT_W)}>
      <div className="flex items-center gap-2.5">
        <TriCheckbox
          state={keysState(view.desired.grants, keys)}
          label={t("permissions.matrix.grantRow", { name: agent.name })}
          disabled={view.disabled || keys.length === 0}
          onChange={() => view.onToggle(keys)}
        />
        <Avatar agentId={agent.id} name={agent.name} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium text-ink" title={agent.name}>{agent.name}</div>
          {view.noTools.has(agent.id) ? <div className="text-small text-muted">{t("permissions.agent.noTools")}</div> : null}
          {over ? (
            <StatusPill status="waiting" className="mt-1">{t("permissions.agent.skills", { n: view.skillCounts.get(agent.id) ?? 0, max: MAX_AGENT_SKILLS })}</StatusPill>
          ) : null}
        </div>
      </div>
    </th>
  );
}

function ItemHeader({ source, item, first, view, agentIds }: { source: MatrixSource; item: MatrixItem; first: boolean; view: MatrixView; agentIds: number[] }) {
  const t = useT();
  const text = itemText(source, item.label);
  const keys = columnKeys(source, item.id, agentIds, view.locks);
  return (
    <th scope="col" className={cn("px-1.5 py-2 align-top font-normal", source.kind === "apps" ? APP_W : TOOL_W, first && "border-l border-line")}>
      <div className="flex flex-col items-center gap-1.5">
        <span
          className={cn("max-w-full truncate text-[11px] text-ink", source.kind === "apps" ? "font-medium" : "font-mono")}
          title={item.hint ? `${text}\n${item.hint}` : text}
        >
          {text}
        </span>
        {source.kind !== "apps" ? (
          <TriCheckbox
            state={keysState(view.desired.grants, keys)}
            label={t("permissions.matrix.grantColumn", { item: text })}
            disabled={view.disabled || keys.length === 0}
            onChange={() => view.onToggle(keys)}
          />
        ) : null}
      </div>
    </th>
  );
}

function ItemCell({ source, item, agent, first, view, focusId }: { source: MatrixSource; item: MatrixItem; agent: Agent; first: boolean; view: MatrixView; focusId?: string }) {
  const t = useT();
  const editable = isEditable(source, agent.id, view.locks);
  const lock = view.locks.get(pairKey(source.group, agent.id));
  const changed = itemChanged(source, item.id, agent.id, view.saved, view.desired);
  const failed = view.failed.has(itemChangeKey(source, item.id, agent.id));
  const text = itemText(source, item.label);
  const base = cn("border-t border-line p-0", first && "border-l", changed && "bg-accent-bg");

  if (source.kind === "apps") {
    return (
      <td className={cn(base, "px-2 py-2 align-top", APP_W)}>
        {lock ? (
          <span className="text-small text-muted" title={lock === "engine" ? t("permissions.lock.engineHelp") : undefined}>{lockText(lock, t)}</span>
        ) : (
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
        )}
        {failed ? <StatusText status="denied" className="mt-1">{t("permissions.cell.failed")}</StatusText> : null}
      </td>
    );
  }

  const key = grantKey(source.group, item.id, agent.id);
  return (
    <td className={cn(base, TOOL_W)}>
      <label
        className="flex min-h-[46px] cursor-pointer flex-col items-center justify-center gap-0.5 px-1 py-1.5 has-[:disabled]:cursor-not-allowed"
        title={lock ? lockText(lock, t) : undefined}
      >
        <input
          type="checkbox"
          aria-label={t("permissions.matrix.cell", { name: agent.name, item: text })}
          className="size-4 shrink-0 cursor-pointer accent-(--accent) disabled:cursor-not-allowed disabled:opacity-50"
          checked={view.desired.grants.has(key)}
          disabled={view.disabled || !editable}
          data-focus={focusId}
          onChange={() => view.onToggle([key])}
        />
        {lock === "load_failed" ? <span className="text-[11px] text-muted">{lockText(lock, t)}</span> : null}
        {failed ? <StatusText status="denied" className="text-[11px]">{t("permissions.cell.failedShort")}</StatusText> : null}
      </label>
    </td>
  );
}

function CollapsedCell({ source, agent, view, onOpen }: { source: MatrixSource; agent: Agent; view: MatrixView; onOpen: () => void }) {
  const t = useT();
  const label = view.labelOf(source);
  const lock = view.locks.get(pairKey(source.group, agent.id));
  const { on, total } = sourceCount(source, agent.id, view.desired);
  const changed = cellChanged(source, agent.id, view.saved, view.desired);
  const failed = cellFailed(source, agent.id, view.failed);
  const name = lock ? lockText(lock, t) : t("permissions.matrix.count", { n: on, total });
  const aria = [
    lock
      ? t("permissions.matrix.cellLocked", { name: agent.name, source: label, state: name })
      : t("permissions.matrix.cellSummary", { name: agent.name, source: label, n: on, total }),
    changed ? t("permissions.matrix.changed") : null,
    failed ? t("permissions.cell.failed") : null,
  ].filter(Boolean).join(". ");
  return (
    <td className={cn("border-l border-t border-line p-0", SOURCE_W, changed && "bg-accent-bg")}>
      <button
        type="button"
        aria-label={aria}
        onClick={onOpen}
        className="flex size-full min-h-[46px] cursor-pointer flex-wrap items-center gap-x-2 gap-y-0.5 px-3 py-1.5 text-left hover:bg-hover"
      >
        {lock === "load_failed" ? (
          <StatusText status="denied">{name}</StatusText>
        ) : (
          <span className={cn("font-medium", lock ? "text-small text-muted" : "text-ink")}>{name}</span>
        )}
        {failed ? (
          <StatusText status="denied">{t("permissions.cell.failed")}</StatusText>
        ) : changed ? (
          <span className="text-small text-accent-text">{t("permissions.matrix.changed")}</span>
        ) : null}
      </button>
    </td>
  );
}
