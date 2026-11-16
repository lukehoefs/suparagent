"use client";

import { Archive, ArchiveRestore, Crown, MessageSquare, MoreHorizontal, Pin, PinOff, Trash2 } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import type { Agent } from "@/lib/api";
import { cn } from "@/lib/cn";
import type { RosterStatus } from "@/lib/roster";
import { useT } from "@/lib/use-i18n";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Menu, MenuItem, MenuSeparator } from "@/components/ui/Menu";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatusPill } from "@/components/ui/StatusPill";
import { Card } from "@/components/ui/Surface";
import { LinkButton } from "./LinkButton";
import type { CountState } from "./useAgentCounts";

const STATUS_LABEL: Record<RosterStatus, string> = { running: "status.working", waiting: "status.waiting", idle: "chat.idle" };

export type EngineLine = { engine: string; model: string | null; available: boolean | null; reason: string | null };

// What the person may do from the card's More menu. A missing handler hides the item.
export type CardActions = {
  onPin?: () => void;
  onLead?: () => void;
  onArchive?: () => void;
  onRestore?: () => void;
  onDelete?: () => void;
};

// One agent on the roster (design: Agents.html). Everything on it is read from the backend: a
// line the backend cannot fill is left out, never filled with a guess.
export function AgentCard({
  agent,
  archived,
  engine,
  status,
  isLead,
  computer,
  chatHref,
  settingsHref,
  counts,
  requestCounts,
  actions,
  busy,
}: {
  agent: Agent;
  archived: boolean;
  // null while the engine list loads.
  engine: EngineLine | null;
  status: RosterStatus | null;
  isLead: boolean;
  computer: "on" | "off" | null;
  chatHref: string | null;
  settingsHref: string | null;
  // undefined: counts are not shown to this person; null: not asked yet.
  counts: CountState | null | undefined;
  // Asks for this agent's counts; called once the card is on screen.
  requestCounts?: (agentId: number) => void;
  actions: CardActions;
  busy: boolean;
}) {
  const t = useT();
  const nameId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const role = agent.title?.trim() || agent.description?.trim() || "";

  // Counts are read only for cards that reach the screen.
  const agentId = agent.id;
  const wantCounts = counts === null && requestCounts !== undefined && !archived;
  useEffect(() => {
    const node = ref.current;
    if (!wantCounts || !node || !requestCounts) return;
    if (typeof IntersectionObserver === "undefined") {
      const timer = window.setTimeout(() => requestCounts(agentId), 0);
      return () => window.clearTimeout(timer);
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        observer.disconnect();
        requestCounts(agentId);
      }
    }, { rootMargin: "200px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [wantCounts, requestCounts, agentId]);

  const menuItems: ReactNode[] = [];
  if (actions.onPin) {
    menuItems.push(
      <MenuItem key="pin" onSelect={actions.onPin} icon={agent.pinned ? <PinOff size={14} /> : <Pin size={14} />}>
        {agent.pinned ? t("roster.unpin") : t("roster.pin")}
      </MenuItem>,
    );
  }
  if (actions.onLead) {
    menuItems.push(
      <MenuItem key="lead" onSelect={actions.onLead} icon={<Crown size={14} />}>
        {isLead ? t("roster.removeLead") : t("roster.makeLead")}
      </MenuItem>,
    );
  }
  if (actions.onArchive) {
    menuItems.push(<MenuItem key="archive" onSelect={actions.onArchive} icon={<Archive size={14} />}>{t("roster.archive")}</MenuItem>);
  }
  // Restore is not in the menu: on an archived card it is the visible button.
  if (actions.onDelete) {
    if (menuItems.length > 0) menuItems.push(<MenuSeparator key="sep" />);
    menuItems.push(<MenuItem key="delete" onSelect={actions.onDelete} icon={<Trash2 size={14} />} danger>{t("common.delete")}</MenuItem>);
  }

  return (
    <Card ref={ref} aria-labelledby={nameId} role="group" className={cn("flex h-full flex-col gap-3.5", archived && "bg-inset")}>
      <div className="flex items-start gap-3">
        <Avatar agentId={agent.id} name={agent.name} size="lg" className={cn("size-10", archived && "opacity-60")} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 id={nameId} className={cn("truncate text-[15px] font-semibold leading-5", archived ? "text-muted" : "text-ink")}>{agent.name}</h3>
            {agent.pinned && !archived ? (
              <span role="img" aria-label={t("roster.pinned")} title={t("roster.pinned")} className="inline-flex text-faint">
                <Pin size={12} aria-hidden="true" />
              </span>
            ) : null}
            {isLead ? <Badge tone="accent">{t("roster.teamLead")}</Badge> : null}
            {archived ? <Badge>{t("roster.archivedBadge")}</Badge> : null}
          </div>
          {role ? <p className="truncate text-small text-muted">{role}</p> : null}
        </div>
        {status ? <StatusPill status={status}>{t(STATUS_LABEL[status])}</StatusPill> : null}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {engine === null ? (
          <Skeleton className="h-6 w-28 rounded-full" />
        ) : (
          <Badge className="h-6 px-2.5">{engine.model ? `${engine.engine} · ${engine.model}` : engine.engine}</Badge>
        )}
        {engine?.available === false ? (
          <span title={engine.reason ?? undefined}>
            <StatusPill status="denied">{t("roster.engineUnavailable")}</StatusPill>
          </span>
        ) : null}
        {computer === "on" ? <StatusPill status="done">{t("roster.computerOn")}</StatusPill> : null}
        {computer === "off" ? <StatusPill status="idle">{t("roster.computerOff")}</StatusPill> : null}
      </div>

      {counts !== undefined && !archived ? <CountsLine counts={counts} /> : null}

      <div className="mt-auto flex flex-wrap items-center gap-2">
        {chatHref ? (
          <LinkButton href={chatHref} icon={<MessageSquare size={15} />}>{t("roster.chat")}</LinkButton>
        ) : null}
        {archived && actions.onRestore ? (
          <Button onClick={actions.onRestore} disabled={busy} icon={<ArchiveRestore size={15} aria-hidden="true" />}>{t("roster.restore")}</Button>
        ) : null}
        {settingsHref ? <LinkButton href={settingsHref} variant="ghost">{t("sidebar.settings")}</LinkButton> : null}
        {menuItems.length > 0 ? (
          <span className="ml-auto">
            <Menu trigger={<IconButton label={t("roster.moreActions", { name: agent.name })} disabled={busy}><MoreHorizontal size={16} /></IconButton>}>
              {menuItems}
            </Menu>
          </span>
        ) : null}
      </div>
    </Card>
  );
}

// "4 skills   2 tools", with the number set bold wherever the language puts it.
function CountsLine({ counts }: { counts: CountState | null }) {
  const t = useT();
  if (counts === null || counts.loading) {
    return (
      <div role="status" className="flex h-[18px] items-center gap-4">
        <span className="sr-only">{t("roster.countsLoading")}</span>
        <Skeleton className="h-3.5 w-16" />
        <Skeleton className="h-3.5 w-14" />
      </div>
    );
  }
  if (counts.skills === null && counts.tools === null) return null;
  return (
    <p className="flex gap-4 text-small text-muted">
      {counts.skills !== null ? <Count template={t(counts.skills === 1 ? "roster.skillsOne" : "roster.skillsMany")} n={counts.skills} /> : null}
      {counts.tools !== null ? <Count template={t(counts.tools === 1 ? "roster.toolsOne" : "roster.toolsMany")} n={counts.tools} /> : null}
    </p>
  );
}

function Count({ template, n }: { template: string; n: number }) {
  const at = template.indexOf("{n}");
  if (at < 0) return <span>{template}</span>;
  return (
    <span>
      {template.slice(0, at)}
      <strong className="font-semibold text-ink">{n}</strong>
      {template.slice(at + 3)}
    </span>
  );
}
