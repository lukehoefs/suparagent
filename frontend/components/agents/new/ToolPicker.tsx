"use client";

// Tools from switched-on custom MCP servers, picked before the agent exists. Nothing is granted here:
// grants need an agent id, so the picks are held by the wizard and saved (PUT .../grants) after create.
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
import { SkeletonList } from "@/components/ui/Skeleton";
import { cn } from "@/lib/cn";
import { appOf, groupByApp } from "@/lib/tool-groups";
import { useT } from "@/lib/use-i18n";
import type { ToolServer } from "./useNewAgentData";

// A filter box once there are more tools than fit on a screen; a server opens by itself when it is small.
const FILTER_FROM = 12;
const OPEN_UP_TO = 12;

export function ToolPicker({
  servers,
  error,
  onRetry,
  picks,
  onPicks,
  disabled = false,
}: {
  servers: ToolServer[] | null;
  error: string | null;
  onRetry: () => void;
  picks: Record<string, string[]>;
  onPicks: (next: Record<string, string[]>) => void;
  disabled?: boolean;
}) {
  const t = useT();
  const [filter, setFilter] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});

  if (error !== null) {
    return (
      <Banner tone="danger" title={t("newAgent.toolsLoadFailed")} action={<Button size="sm" onClick={onRetry}>{t("newAgent.retry")}</Button>}>
        {error || null}
      </Banner>
    );
  }
  if (servers === null) return <SkeletonList rows={2} />;
  if (servers.length === 0) {
    return (
      <p className="text-small text-muted">
        {t("newAgent.toolsNone")}{" "}
        <Link href="/apps/" className="text-accent-text underline underline-offset-2">{t("newAgent.toolsAddServer")}</Link>
      </p>
    );
  }

  const q = filter.trim().toLowerCase();
  const total = servers.reduce((sum, server) => sum + (server.tools?.length ?? 0), 0);
  const setServer = (id: string, names: Iterable<string>) => onPicks({ ...picks, [id]: [...new Set(names)].sort() });

  return (
    <div className="flex flex-col gap-3">
      {total > FILTER_FROM ? (
        <Input type="search" aria-label={t("newAgent.toolsFilter")} placeholder={t("newAgent.toolsFilter")} value={filter} onChange={(event) => setFilter(event.target.value)} />
      ) : null}
      <ul className="flex flex-col gap-2">
        {servers.map((server) => {
          const id = server.conn.id;
          const tools = server.tools ?? [];
          const chosen = new Set(picks[id] ?? []);
          const shown = tools.filter((tool) => !q || tool.name.toLowerCase().includes(q) || tool.description.toLowerCase().includes(q) || appOf(tool.name).toLowerCase().includes(q));
          const allOn = tools.length > 0 && tools.every((tool) => chosen.has(tool.name));
          const isOpen = open[id] ?? (tools.length <= OPEN_UP_TO || chosen.size > 0 || q !== "");
          const bodyId = `tools-${id}`;
          return (
            <li key={id} className="rounded-field border border-line">
              <div className="flex flex-wrap items-center gap-2 px-3 py-1.5">
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={bodyId}
                  onClick={() => setOpen((all) => ({ ...all, [id]: !isOpen }))}
                  className="flex min-h-8 min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-inner text-left touch:min-h-11"
                >
                  <ChevronRight size={14} aria-hidden="true" className={cn("shrink-0 text-muted transition-transform duration-(--dur-fast)", isOpen && "rotate-90")} />
                  <span className="truncate text-body font-medium text-ink">{server.conn.name}</span>
                  <span className="shrink-0 text-small text-muted">
                    {server.error !== null ? t("newAgent.toolsServerFailed") : t("newAgent.toolsChosen", { n: chosen.size, total: tools.length })}
                  </span>
                </button>
                {tools.length > 0 ? (
                  <Button size="sm" variant="ghost" disabled={disabled} onClick={() => setServer(id, allOn ? [] : tools.map((tool) => tool.name))}>
                    {allOn ? t("newAgent.toolsClear") : t("newAgent.toolsChooseAll")}
                  </Button>
                ) : null}
              </div>
              {isOpen ? (
                <div id={bodyId} className="max-h-80 overflow-y-auto border-t border-line">
                  {server.error !== null ? (
                    <p className="px-3 py-2 text-small text-danger">{server.error || t("newAgent.toolsServerFailed")}</p>
                  ) : shown.length === 0 ? (
                    <p className="px-3 py-2 text-small text-muted">{t("newAgent.toolsNoMatch")}</p>
                  ) : (
                    groupByApp(shown).map((group) => {
                      const names = group.tools.map((tool) => tool.name);
                      const on = names.filter((name) => chosen.has(name)).length;
                      return (
                        <div key={group.app} role="group" aria-label={group.app}>
                          <label className="sticky top-0 z-[1] flex cursor-pointer items-center gap-2.5 border-b border-line bg-inset px-3 py-1.5 touch:min-h-11">
                            <input
                              type="checkbox"
                              disabled={disabled}
                              aria-label={t("newAgent.toolsGroupAll", { app: group.app })}
                              className="size-4 shrink-0 cursor-pointer accent-(--accent)"
                              checked={on === names.length}
                              ref={(el) => { if (el) el.indeterminate = on > 0 && on < names.length; }}
                              onChange={() => {
                                const next = new Set(chosen);
                                for (const name of names) {
                                  if (on === names.length) next.delete(name);
                                  else next.add(name);
                                }
                                setServer(id, next);
                              }}
                            />
                            <span className="text-small font-semibold text-ink">{group.app}</span>
                            <span className="text-small text-muted">{on}/{names.length}</span>
                          </label>
                          <ul className="divide-y divide-line">
                            {group.tools.map((tool) => (
                              <li key={tool.name} className="py-2 pl-9 pr-3">
                                <Checkbox
                                  disabled={disabled}
                                  checked={chosen.has(tool.name)}
                                  onChange={() => {
                                    const next = new Set(chosen);
                                    if (next.has(tool.name)) next.delete(tool.name);
                                    else next.add(tool.name);
                                    setServer(id, next);
                                  }}
                                  label={<span className="break-all font-mono text-[12px]">{tool.name}</span>}
                                  description={tool.description ? <span className="line-clamp-2" title={tool.description}>{tool.description}</span> : undefined}
                                />
                              </li>
                            ))}
                          </ul>
                        </div>
                      );
                    })
                  )}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
