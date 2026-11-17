"use client";

// One agent's tools from the MCP servers the owner added (web search, Executor, Gmail via Activepieces...).
// Every server is listed with its state; a switched-on one shows its tools to tick, and saves on its own
// (each save refreshes the agent's SOUL.md tool list on the server). Used by the agent page's Tools tab
// and by the older agent editor.
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { CustomMcpConnection, CustomMcpTool } from "@/lib/custom-mcp";
import {
  countsTowardTotal, customServerState, customToolsSearched, offersSkills, sameNames, toolErrorKey, toolFilterShown,
  type CustomServerState, type OfferedTool,
} from "@/lib/agent-tools";
import { supportsToolGrants } from "@/lib/new-agent";
import { pluralForm } from "@/lib/blueprint-browse";
import { resolveLocale } from "@/lib/i18n";
import { useLanguageChoice, useT } from "@/lib/use-i18n";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
import { SkeletonList } from "@/components/ui/Skeleton";
import type { Status } from "@/components/ui/StatusPill";
import { ToolGrantCard } from "@/components/agents/settings/ToolGrantCard";
import { ServerSkills } from "@/components/agents/settings/ServerSkills";

// Where the owner adds, tests, signs in to and switches on MCP servers (components/CustomMcpSection.tsx).
export const MCP_SERVERS_PAGE = "/marketplace/";

type Server = {
  conn: CustomMcpConnection;
  state: CustomServerState;
  // Ready servers only: null while loading, and when loading failed (`error`).
  tools: CustomMcpTool[] | null;
  granted: Set<string> | null;
  picked: Set<string>;
  error: unknown;
};

const STATE_STATUS: Record<Exclude<CustomServerState, "ready">, Status> = {
  off: "idle",
  needs_sign_in: "waiting",
  not_tested: "waiting",
  unreachable: "denied",
  private: "idle",
};

async function readServer(conn: CustomMcpConnection, agentId: number): Promise<Server> {
  const state = customServerState(conn);
  const base: Server = { conn, state, tools: null, granted: null, picked: new Set(), error: null };
  if (state === "private") return base;
  if (state !== "ready") {
    // Grants on a server that is off or needs attention are kept; read them so the card can say so.
    const grants = await api.getCustomMcpGrants(conn.id, agentId).catch(() => null);
    const granted = grants ? new Set(grants.tool_names) : null;
    return { ...base, granted, picked: new Set(granted ?? []) };
  }
  const [tools, grants] = await Promise.allSettled([api.getCustomMcpTools(conn.id), api.getCustomMcpGrants(conn.id, agentId)]);
  // Saved grants are kept even when the tool list cannot be read, so the tab's total stays right;
  // ticking and saving need both.
  const granted = grants.status === "fulfilled" ? new Set(grants.value.tool_names) : null;
  const error = tools.status === "rejected" ? tools.reason ?? new Error("") : grants.status === "rejected" ? grants.reason ?? new Error("") : null;
  return {
    ...base,
    tools: tools.status === "fulfilled" && granted ? tools.value : null,
    granted,
    picked: new Set(granted ?? []),
    error,
  };
}

export function AgentToolsSection({
  agentId,
  agentName,
  provider,
  onDirtyChange,
  onGrantedChange,
  onOfferedChange,
  otherOffered = [],
  engineNote = true,
}: {
  agentId: number;
  agentName: string;
  provider: string;
  // Told whether any server has ticks that are not saved yet.
  onDirtyChange?: (dirty: boolean) => void;
  // Saved grants on switched-on servers (null until known), for the tab's total.
  onGrantedChange?: (count: number | null) => void;
  // The ticked tools as the engine is offered them, for the plugins section's search note.
  onOfferedChange?: (tools: OfferedTool[]) => void;
  // Ticked plugin tools: they count toward the 25 tools an agent is given one by one.
  otherOffered?: readonly OfferedTool[];
  // The page may say once, above all its sections, that the engine cannot use tools.
  engineNote?: boolean;
}) {
  const t = useT();
  const locale = resolveLocale(useLanguageChoice());
  const [servers, setServers] = useState<Server[] | null>(null);
  const [listError, setListError] = useState<unknown>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState("");
  const [grantedOnly, setGrantedOnly] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  // The last save's result, shown on the card it belongs to.
  const [result, setResult] = useState<{ id: string; ok: boolean; text: string } | null>(null);

  const errorText = useCallback((err: unknown) => {
    const key = toolErrorKey(err);
    return key ? t(key) : err instanceof Error && err.message ? err.message : t("agentTools.failed");
  }, [t]);

  const load = useCallback(async () => {
    setListError(null);
    try {
      const conns = await api.listCustomMcp();
      setServers(await Promise.all(conns.map((conn) => readServer(conn, agentId))));
    } catch (err) {
      setServers(null);
      setListError(err ?? new Error(""));
    }
  }, [agentId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Read one server again (after a save or a retry) without touching the others' unsaved ticks.
  const reloadOne = useCallback(async (id: string) => {
    setServers((list) => (list ?? []).map((s) => (s.conn.id === id ? { ...s, tools: null, granted: null, error: null } : s)));
    let next: Server;
    try {
      const conn = (await api.listCustomMcp()).find((c) => c.id === id);
      if (!conn) {
        setServers((list) => (list ?? []).filter((s) => s.conn.id !== id));
        return;
      }
      next = await readServer(conn, agentId);
    } catch (err) {
      setServers((list) => (list ?? []).map((s) => (s.conn.id === id ? { ...s, error: err ?? new Error("") } : s)));
      return;
    }
    setServers((list) => (list ?? []).map((s) => (s.conn.id === id ? next : s)));
  }, [agentId]);

  const ready = useMemo(() => (servers ?? []).filter((s) => s.state === "ready"), [servers]);
  const unsaved = ready.some((s) => s.granted !== null && !sameNames(s.picked, s.granted));
  useEffect(() => { onDirtyChange?.(unsaved); }, [unsaved, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  // The tab's total counts saved grants on switched-on servers, as the roster does; unknown (null) while
  // any of them is loading or could not be read, rather than a number that leaves some out.
  const granted = useMemo(() => {
    if (servers === null) return null;
    let sum = 0;
    for (const s of servers) {
      if (!countsTowardTotal(s.state)) continue;
      if (s.granted === null) return null;
      sum += s.granted.size;
    }
    return sum;
  }, [servers]);
  useEffect(() => { onGrantedChange?.(granted); }, [granted, onGrantedChange]);

  const offered = useMemo<OfferedTool[]>(() => ready.flatMap((s) => (s.tools ?? [])
    .filter((tool) => s.picked.has(tool.name))
    .map((tool) => ({ kind: "custom" as const, server: s.conn.name, description: tool.description, input_schema: tool.input_schema }))), [ready]);
  useEffect(() => { onOfferedChange?.(offered); }, [offered, onOfferedChange]);
  const searched = customToolsSearched([...offered, ...otherOffered]);

  const pick = (id: string, next: Set<string>) =>
    setServers((list) => (list ?? []).map((s) => (s.conn.id === id ? { ...s, picked: next } : s)));

  const save = async (s: Server) => {
    if (!s.tools) return;
    setBusy(s.conn.id);
    setResult(null);
    try {
      const tools = s.tools.filter((tool) => s.picked.has(tool.name)).map((tool) => ({ name: tool.name, schema_digest: tool.schema_digest }));
      const saved = await api.saveCustomMcpGrants(s.conn.id, agentId, s.conn.revision, tools);
      const n = saved.tool_names.length;
      setResult({ id: s.conn.id, ok: true, text: t(`agentTools.saved.${pluralForm(locale, n)}`, { server: s.conn.name, name: agentName, n }) });
      await reloadOne(s.conn.id);
    } catch (err) {
      setResult({ id: s.conn.id, ok: false, text: errorText(err) });
      // A changed server or tool list is read again so the next try uses the current one.
      const code = (err as { code?: unknown } | null)?.code;
      if (code === "connection_changed" || code === "tool_schema_changed" || code === "connection_not_enabled") await reloadOne(s.conn.id);
    } finally {
      setBusy(null);
    }
  };

  const q = filter.trim().toLowerCase();
  const toolTotal = ready.reduce((n, s) => n + (s.tools?.length ?? 0), 0);

  const help = (s: Server) => {
    const kept = s.granted && s.granted.size > 0 ? t(`agentTools.kept.${pluralForm(locale, s.granted.size)}`, { n: s.granted.size }) : null;
    switch (s.state) {
      case "off": return [t("agentTools.state.offHelp"), kept];
      case "needs_sign_in": return [t("agentTools.state.needsSignInHelp")];
      case "not_tested": return [t("agentTools.state.notTestedHelp")];
      case "unreachable": return [t("agentTools.state.unreachableHelp"), kept];
      case "private": return [t("agentTools.state.privateHelp", { person: s.conn.added_by ?? "" })];
      default: return [];
    }
  };
  const stateLabel: Record<Exclude<CustomServerState, "ready">, string> = {
    off: t("agentTools.state.off"),
    needs_sign_in: t("agentTools.state.needsSignIn"),
    not_tested: t("agentTools.state.notTested"),
    unreachable: t("agentTools.state.unreachable"),
    private: t("agentTools.state.private"),
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-small text-muted">{t("agentTools.servers.where", { name: agentName })}</p>
      {engineNote && !supportsToolGrants(provider) ? (
        <Banner tone="warning">{t("agentTools.engine", { name: agentName })}</Banner>
      ) : null}
      {listError !== null ? (
        <Banner tone="danger" title={t("agentTools.servers.loadFailed")} action={<Button size="sm" onClick={() => { setListError(null); void load(); }}>{t("agentTools.retry")}</Button>}>
          {errorText(listError)}
        </Banner>
      ) : servers === null ? (
        <SkeletonList rows={2} />
      ) : servers.length === 0 ? (
        <p className="text-small text-muted">
          {t("agentTools.servers.none")}{" "}
          <Link href={MCP_SERVERS_PAGE} className="text-accent-text underline underline-offset-2">{t("agentTools.servers.add")}</Link>
        </p>
      ) : (
        <>
          {toolFilterShown(toolTotal, filter, grantedOnly) ? (
            <div className="flex flex-wrap items-center gap-3">
              <Input
                type="search"
                className="min-w-0 flex-1"
                aria-label={t("agentTools.filter")}
                placeholder={t("agentTools.filter")}
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
              <Checkbox label={t("agentTools.grantedOnly")} checked={grantedOnly} onChange={(e) => setGrantedOnly(e.target.checked)} className="items-center" />
            </div>
          ) : null}
          <ul className="flex flex-col gap-2">
            {servers.map((s) => {
              const isReady = s.state === "ready";
              const loading = isReady && s.tools === null && s.error === null;
              const failed = isReady && s.error !== null;
              const dirty = isReady && s.granted !== null && !sameNames(s.picked, s.granted);
              const isOpen = open[s.conn.id] ?? (!isReady || (s.granted?.size ?? 0) > 0 || q !== "" || failed);
              const skills = offersSkills(s.tools);
              const status = isReady
                ? failed ? { status: "denied" as const, label: t("agentTools.state.loadFailed") } : null
                : { status: STATE_STATUS[s.state as Exclude<CustomServerState, "ready">], label: stateLabel[s.state as Exclude<CustomServerState, "ready">] };
              return (
                <ToolGrantCard
                  key={s.conn.id}
                  id={s.conn.id}
                  name={s.conn.name}
                  status={status}
                  tools={isReady && !loading && !failed ? s.tools : null}
                  picked={s.picked}
                  dirty={dirty}
                  open={isOpen}
                  onToggle={() => setOpen((o) => ({ ...o, [s.conn.id]: !isOpen }))}
                  filter={q}
                  grantedOnly={grantedOnly}
                  saving={busy === s.conn.id}
                  disabled={busy !== null}
                  onPick={(next) => pick(s.conn.id, next)}
                  onSave={() => void save(s)}
                  note={result?.id === s.conn.id ? (result.ok
                    ? <p role="status" className="text-small text-muted">{result.text}</p>
                    : <Banner tone="danger" title={t("agentTools.saveFailed", { server: s.conn.name })} onDismiss={() => setResult(null)}>{result.text}</Banner>) : null}
                >
                  {loading ? <SkeletonList rows={2} /> : null}
                  {failed ? (
                    <Banner tone="danger" title={t("agentTools.state.loadFailed")} action={<Button size="sm" onClick={() => void reloadOne(s.conn.id)}>{t("agentTools.retry")}</Button>}>
                      {errorText(s.error)}
                    </Banner>
                  ) : null}
                  {!isReady ? (
                    <>
                      {help(s).filter(Boolean).map((line) => <p key={line} className="text-small text-muted">{line}</p>)}
                      {s.state !== "private" ? (
                        <Link href={MCP_SERVERS_PAGE} className="self-start text-small text-accent-text underline underline-offset-2">{t("agentTools.servers.manage")}</Link>
                      ) : null}
                    </>
                  ) : null}
                  {isReady && skills ? <ServerSkills connectionId={s.conn.id} agentName={agentName} /> : null}
                </ToolGrantCard>
              );
            })}
          </ul>
          {searched ? <p className="text-small text-muted">{t("agentTools.searched", { name: agentName })}</p> : null}
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-small text-muted">
            <Link href={MCP_SERVERS_PAGE} className="text-accent-text underline underline-offset-2">{t("agentTools.servers.manage")}</Link>
            <Link href="/settings/permissions/" className="text-accent-text underline underline-offset-2">{t("agentTools.bulk")}</Link>
          </p>
        </>
      )}
    </div>
  );
}
