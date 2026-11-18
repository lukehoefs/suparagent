"use client";

// Exact per-agent tool grants for one MCP server: choose an agent, tick the tools it may call, save.
// Every call still asks for approval on a card with the server, tool and arguments; nothing here
// changes that.
import { useEffect, useId, useState } from "react";
import { checkAll, exactGrants, problemOf, sameSet, toggleTool, type Problem } from "@/lib/apps-page";
import { newAgentHref } from "@/lib/agent-pages";
import { filterTools } from "@/lib/custom-mcp";
import { useT } from "@/lib/use-i18n";
import { useLeaveGuard } from "@/components/shell/AppShell";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Field, Input, Select } from "@/components/ui/Input";
import { LinkButton } from "@/components/ui/LinkButton";
import { SkeletonList } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { ProblemBanner, type AgentOption } from "./shared";

export type GrantTool = { name: string; description: string; schema_digest: string };

// More tools than this get a filter box and bulk buttons.
const FILTER_FROM = 12;

export function ToolGrants({
  tools,
  agents,
  load,
  save,
  searchLimit,
}: {
  tools: GrantTool[];
  agents: AgentOption[] | null;
  load: (agentId: number) => Promise<string[]>;
  save: (agentId: number, exact: { name: string; schema_digest: string }[]) => Promise<void>;
  // Custom servers: above this many checked tools the agent searches them instead (lib/custom-mcp.ts).
  searchLimit?: number;
}) {
  const t = useT();
  const toast = useToast();
  const listId = useId();
  const [agentId, setAgentId] = useState<number | null>(null);
  const [saved, setSaved] = useState<string[] | null>(null);
  const [checked, setChecked] = useState<string[]>([]);
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);

  useEffect(() => {
    if (agentId === null) return;
    let live = true;
    load(agentId)
      .then((names) => { if (live) { setSaved(names); setChecked(names); } })
      .catch((err: unknown) => { if (live) setProblem(problemOf(err, "apps.grants.loadFailed")); });
    return () => { live = false; };
  }, [agentId, load]);

  const dirty = saved !== null && !sameSet(saved, checked);
  useLeaveGuard(dirty);

  if (agents !== null && agents.length === 0) {
    return (
      <div className="flex flex-wrap items-center gap-3 text-body text-muted">
        <span>{t("apps.grants.noAgents")}</span>
        <LinkButton href={newAgentHref()} size="sm">{t("apps.grants.newAgent")}</LinkButton>
      </div>
    );
  }
  if (tools.length === 0) return <p className="text-body text-muted">{t("apps.grants.noTools")}</p>;

  const shown = filterTools(tools, filter);
  const submit = async () => {
    if (agentId === null) return;
    setBusy(true); setProblem(null);
    try {
      await save(agentId, exactGrants(tools, checked));
      setSaved(checked);
      toast(t("apps.grants.saved"));
    } catch (err) {
      setProblem(problemOf(err, "apps.error.generic"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <Field label={t("apps.grants.agent")}>
        {(props) => (
          <Select
            {...props}
            value={agentId === null ? "" : String(agentId)}
            placeholder={t("apps.grants.chooseAgent")}
            disabled={agents === null || busy}
            options={(agents ?? []).map((agent) => ({ value: String(agent.id), label: agent.name }))}
            onChange={(event) => {
              const next = Number(event.target.value);
              if (!next || next === agentId) return;
              setSaved(null); setChecked([]); setProblem(null); setAgentId(next);
            }}
          />
        )}
      </Field>
      {problem && <ProblemBanner problem={problem} onDismiss={() => setProblem(null)} />}
      {agentId !== null && saved === null && !problem && <SkeletonList rows={3} />}
      {agentId !== null && saved !== null && (
        <>
          {tools.length > FILTER_FROM && (
            <div className="flex flex-wrap items-center gap-2">
              <Input
                type="search"
                aria-label={t("apps.grants.filter")}
                aria-controls={listId}
                placeholder={t("apps.grants.filterPlaceholder")}
                value={filter}
                autoComplete="off"
                onChange={(event) => setFilter(event.target.value)}
                className="min-w-0 flex-1 basis-56"
              />
              <Button size="sm" disabled={busy} onClick={() => setChecked(checkAll(checked, shown.map((tool) => tool.name)))}>{t("apps.grants.checkShown")}</Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => setChecked([])}>{t("apps.grants.clearAll")}</Button>
            </div>
          )}
          <p className="text-small text-muted" aria-live="polite">{t("apps.grants.checked", { checked: checked.length, total: tools.length })}</p>
          {searchLimit !== undefined && checked.length > searchLimit && (
            <p className="text-small text-muted">{t("apps.grants.searchNote", { limit: searchLimit })}</p>
          )}
          <ul id={listId} className="flex max-h-[24rem] flex-col gap-1 overflow-y-auto rounded-field border border-line p-2">
            {shown.map((tool) => (
              <li key={tool.name} className="rounded-inner px-1.5 py-1 hover:bg-hover">
                <Checkbox
                  checked={checked.includes(tool.name)}
                  disabled={busy}
                  onChange={(event) => setChecked(toggleTool(checked, tool.name, event.target.checked))}
                  label={<span className="break-all font-mono text-[12px] text-ink">{tool.name}</span>}
                  description={tool.description ? <span className="line-clamp-3" title={tool.description}>{tool.description}</span> : undefined}
                />
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="primary" loading={busy} disabled={!dirty} onClick={() => void submit()}>{t("apps.grants.save")}</Button>
          </div>
        </>
      )}
    </div>
  );
}
