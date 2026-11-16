"use client";

import { Users } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import type { TeamAgent, TeamState } from "@/lib/collaboration";
import { chunk, fitColumns } from "@/lib/roster";
import { useT } from "@/lib/use-i18n";
import { Avatar } from "@/components/ui/Avatar";
import { Banner } from "@/components/ui/Banner";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { Card } from "@/components/ui/Surface";

// A member node is at least this wide before the chart starts a new row, and at most this wide.
const NODE_MIN = 168;
const NODE_MAX = 232;
const GAP = 12;

// The Team section under the roster (design: Agents.html): the lead on top and its members below,
// read from GET /team, which the page polls. The states the design does not draw (no team, no lead,
// teams switched off, team not loaded) each say so in words.
export function TeamSection({ team, unavailable, isAdmin }: { team: TeamState | null; unavailable: boolean; isAdmin: boolean }) {
  const t = useT();
  const headingId = useId();

  let body;
  if (team === null) {
    body = unavailable ? (
      <EmptyState compact icon={<Users size={20} />} title={t("roster.teamUnavailable")} description={t("roster.teamUnavailableBody")} />
    ) : (
      <div role="status" className="flex flex-col items-center gap-5 py-2">
        <span className="sr-only">{t("roster.loadingTeam")}</span>
        <Skeleton className="h-11 w-40" />
        <div className="flex gap-3">
          <Skeleton className="h-11 w-36" />
          <Skeleton className="h-11 w-36" />
          <Skeleton className="h-11 w-36" />
        </div>
      </div>
    );
  } else if (team.team === null) {
    body = <EmptyState compact icon={<Users size={20} />} title={t("team.noTeam")} description={isAdmin ? t("roster.noTeamAdmin") : t("roster.noTeamMember")} />;
  } else {
    const leadId = team.team.lead_agent_id;
    const lead = leadId === null ? null : team.agents.find((agent) => agent.is_lead || agent.id === leadId) ?? null;
    const members = team.agents
      .filter((agent) => agent !== lead)
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
    body = (
      <div className="flex flex-col gap-3">
        {lead && team.enabled !== false && team.lead_ready && !team.lead_ready.ok && team.lead_ready.reason ? (
          <Banner tone="warning" title={t("roster.leadNotReady")}>{team.lead_ready.reason}</Banner>
        ) : null}
        <OrgChart lead={lead} members={members} />
        {lead === null && isAdmin ? <p className="text-center text-small text-muted">{t("roster.noLeadAdmin")}</p> : null}
        {lead !== null && members.length === 0 ? <p className="text-center text-small text-muted">{t("roster.noMembers")}</p> : null}
      </div>
    );
  }

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h2 id={headingId} className="text-h3 font-semibold text-ink">{t("roster.team")}</h2>
      {team?.enabled === false ? <Banner tone="info">{t("agentTeam.teamsDisabled")}</Banner> : null}
      <Card className="p-5">{body}</Card>
    </section>
  );
}

function OrgChart({ lead, members }: { lead: TeamAgent | null; members: TeamAgent[] }) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const hasMembers = members.length > 0;

  useEffect(() => {
    const node = ref.current;
    if (!hasMembers || !node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => setWidth(entries[0]?.contentRect.width ?? 0));
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMembers]);

  const cols = fitColumns(width, members.length, NODE_MIN, GAP);
  const rows = chunk(members, cols);
  const columns = `repeat(${cols}, minmax(0, ${NODE_MAX}px))`;

  return (
    <div className="flex flex-col items-center py-2">
      {lead ? (
        <Node agent={lead} subtitle={t("agentTeam.leadBadge")} lead />
      ) : (
        <div className="flex items-center gap-2 rounded-field border border-dashed border-line-strong px-3 py-2 text-label font-medium text-muted">
          {t("roster.noLead")}
        </div>
      )}
      {hasMembers ? (
        <>
          <span aria-hidden="true" className="h-5 w-px bg-line-strong" />
          <div ref={ref} role="list" aria-label={t("roster.teamMembers")} className="flex w-full flex-col gap-4">
            {rows.map((row, index) => {
              const multi = rows.length > 1;
              // One row: a bar from the first node's centre to the last's. Several rows: each bar
              // starts at a spine on the left edge, which runs down to the next row's bar.
              const bar = multi
                ? { left: "0%", width: `${((row.length - 0.5) / cols) * 100}%` }
                : { left: `${50 / cols}%`, width: `${((cols - 1) / cols) * 100}%` };
              return (
                <div key={row[0].id} role="none" className="relative mx-auto grid w-fit max-w-full" style={{ gridTemplateColumns: columns, columnGap: GAP }}>
                  {multi || cols > 1 ? <span aria-hidden="true" className="absolute top-0 h-px bg-line-strong" style={bar} /> : null}
                  {multi && index < rows.length - 1 ? <span aria-hidden="true" className="absolute -bottom-4 left-0 top-0 w-px bg-line-strong" /> : null}
                  {row.map((agent) => (
                    <div key={agent.id} role="listitem" className="relative flex min-w-0 justify-center px-2 pt-5">
                      <span aria-hidden="true" className="absolute left-1/2 top-0 h-5 w-px bg-line-strong" />
                      <Node agent={agent} subtitle={agent.title?.trim() || null} />
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </>
      ) : null}
    </div>
  );
}

function Node({ agent, subtitle, lead = false }: { agent: TeamAgent; subtitle: string | null; lead?: boolean }) {
  return (
    <div className={cn("flex min-w-0 max-w-full items-center gap-2 rounded-field border bg-raised px-3 py-2", lead ? "border-accent" : "border-line")}>
      <Avatar agentId={agent.id} name={agent.name} size="sm" />
      <div className="min-w-0">
        <div className="truncate text-label font-medium text-ink">{agent.name}</div>
        {subtitle ? <div className="truncate text-small text-muted">{subtitle}</div> : null}
      </div>
    </div>
  );
}
