"use client";

// One server's tools for one agent, as a card that opens: a header with the server's name, how many of
// its tools are ticked (or the state that keeps it from being granted), "Choose all" and its own Save,
// then the tools grouped by app. Shared by the MCP servers and the plugins on the Tools tab.
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { StatusText, type Status } from "@/components/ui/StatusPill";
import { cn } from "@/lib/cn";
import { appOf, groupByApp } from "@/lib/tool-groups";
import { useT } from "@/lib/use-i18n";

export type GrantTool = { name: string; description: string };

export function matchesFilter(tool: GrantTool, q: string): boolean {
  return !q || tool.name.toLowerCase().includes(q) || tool.description.toLowerCase().includes(q) || appOf(tool.name).toLowerCase().includes(q);
}

export function ToolGrantCard({
  id,
  name,
  meta,
  status,
  tools,
  picked,
  dirty,
  open,
  onToggle,
  filter,
  grantedOnly,
  saving,
  disabled,
  onPick,
  onSave,
  note,
  children,
}: {
  id: string;
  name: string;
  // Small facts after the name, such as the plugin's version.
  meta?: ReactNode;
  // Shown instead of the tick count when the server cannot be granted right now.
  status?: { status: Status; label: string } | null;
  // The server's tools; null when they are not available (see `children`).
  tools: GrantTool[] | null;
  picked: ReadonlySet<string>;
  dirty: boolean;
  open: boolean;
  onToggle: () => void;
  filter: string;
  grantedOnly: boolean;
  saving: boolean;
  disabled: boolean;
  onPick: (next: Set<string>) => void;
  onSave: () => void;
  // The result of this card's last save, shown under its header whether or not the card is open.
  note?: ReactNode;
  // What the card says below the header: why it has no tools, a failure with a retry, or extras after the tools.
  children?: ReactNode;
}) {
  const t = useT();
  const bodyId = `grant-${id}`;
  const list = tools ?? [];
  const shown = list.filter((tool) => matchesFilter(tool, filter) && (!grantedOnly || picked.has(tool.name)));
  const allOn = list.length > 0 && list.every((tool) => picked.has(tool.name));
  const toggle = (names: string[], on: boolean) => {
    const next = new Set(picked);
    for (const toolName of names) {
      if (on) next.add(toolName);
      else next.delete(toolName);
    }
    onPick(next);
  };

  return (
    <li className="rounded-field border border-line bg-raised">
      <div className="flex flex-wrap items-center gap-2 px-3 py-1.5">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={onToggle}
          className="flex min-h-8 min-w-0 flex-1 cursor-pointer flex-wrap items-center gap-x-2 gap-y-1 rounded-inner py-1 text-left touch:min-h-11"
        >
          <ChevronRight size={14} aria-hidden="true" className={cn("shrink-0 text-muted transition-transform duration-(--dur-fast)", open && "rotate-90")} />
          <span className="min-w-0 max-w-full truncate text-body font-medium text-ink">{name}</span>
          {meta}
          {status ? (
            <StatusText status={status.status} className="shrink-0">{status.label}</StatusText>
          ) : tools ? (
            <span className="shrink-0 text-small text-muted">{t("agentTools.count", { n: list.filter((tool) => picked.has(tool.name)).length, total: list.length })}</span>
          ) : null}
        </button>
        {tools && list.length > 0 ? (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" disabled={disabled} onClick={() => toggle(list.map((tool) => tool.name), !allOn)}>
              {allOn ? t("agentTools.clear") : t("agentTools.chooseAll")}
            </Button>
            {/* Secondary: the tab lists several servers, and a view has at most one primary button. */}
            <Button size="sm" variant="secondary" disabled={!dirty || disabled} loading={saving} onClick={onSave}>
              {t("agentTools.save")}
            </Button>
          </div>
        ) : null}
      </div>
      {note ? <div className="border-t border-line px-3 py-2">{note}</div> : null}
      {open ? (
        <div id={bodyId} className="border-t border-line">
          {tools && list.length > 0 ? (
            <div className="max-h-80 overflow-y-auto">
              {shown.length === 0 ? (
                <p className="px-3 py-2 text-small text-muted">{t("agentTools.noMatch")}</p>
              ) : (
                groupByApp(shown).map((group) => {
                  const names = group.tools.map((tool) => tool.name);
                  const on = names.filter((toolName) => picked.has(toolName)).length;
                  return (
                    <div key={group.app} role="group" aria-label={group.app}>
                      <label className="sticky top-0 z-[1] flex cursor-pointer items-center gap-2.5 border-b border-line bg-inset px-3 py-1.5 touch:min-h-11">
                        <input
                          type="checkbox"
                          disabled={disabled}
                          aria-label={t("agentTools.groupAll", { app: group.app })}
                          className="size-4 shrink-0 cursor-pointer accent-(--accent)"
                          checked={on === names.length}
                          ref={(el) => { if (el) el.indeterminate = on > 0 && on < names.length; }}
                          onChange={() => toggle(names, on !== names.length)}
                        />
                        <span className="text-small font-semibold text-ink">{group.app}</span>
                        <span className="text-small text-muted">{t("agentTools.count", { n: on, total: names.length })}</span>
                      </label>
                      <ul className="divide-y divide-line">
                        {group.tools.map((tool) => (
                          <li key={tool.name} className="py-2 pl-9 pr-3">
                            <Checkbox
                              disabled={disabled}
                              checked={picked.has(tool.name)}
                              onChange={() => toggle([tool.name], !picked.has(tool.name))}
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
          ) : tools ? (
            <p className="px-3 py-2 text-small text-muted">{t("agentTools.noTools")}</p>
          ) : null}
          {children ? <div className="flex flex-col gap-2 px-3 py-2.5">{children}</div> : null}
        </div>
      ) : null}
    </li>
  );
}
