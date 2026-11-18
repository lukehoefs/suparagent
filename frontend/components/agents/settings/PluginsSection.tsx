"use client";

// The Tools tab's "Plugins": services installed from the marketplace. For each one the tab asks the
// service for its current tools (GET .../tools, a live call) and this agent's grants, and saves the
// ticked tools per plugin (PUT .../grants). Installing, updating, tokens and removal stay on the
// marketplace page.
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { MarketplaceCatalog, MarketplaceConnection, MarketplaceTool } from "@/lib/marketplace";
import { pluginNeedsToken, pluginUpdate, sameNames, toolErrorKey, type OfferedTool } from "@/lib/agent-tools";
import { pluralForm } from "@/lib/blueprint-browse";
import { resolveLocale } from "@/lib/i18n";
import { useLanguageChoice, useT } from "@/lib/use-i18n";
import { Badge } from "@/components/ui/Badge";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { SkeletonList } from "@/components/ui/Skeleton";
import { ToolGrantCard } from "./ToolGrantCard";

export const PLUGINS_PAGE = "/apps/";

type Plugin = {
  conn: MarketplaceConnection;
  // Null while loading, when the plugin needs its token, and when discovery failed (`error`).
  tools: MarketplaceTool[] | null;
  granted: Set<string> | null;
  picked: Set<string>;
  error: unknown;
};

async function readPlugin(conn: MarketplaceConnection, agentId: number): Promise<Plugin> {
  const base: Plugin = { conn, tools: null, granted: null, picked: new Set(), error: null };
  if (pluginNeedsToken(conn)) {
    const grants = await api.getMarketplaceAgentGrants(conn.id, agentId).catch(() => null);
    const granted = grants ? new Set(grants.tool_names) : null;
    return { ...base, granted, picked: new Set(granted ?? []) };
  }
  // Discovery first: it drops grants whose tool changed, so the grants read after it are current. When
  // discovery fails the saved grants are still read, so the tab's total stays right.
  let tools: MarketplaceTool[] | null = null;
  let error: unknown = null;
  try {
    tools = await api.discoverMarketplaceTools(conn.id);
  } catch (err) {
    error = err ?? new Error("");
  }
  try {
    const granted = new Set((await api.getMarketplaceAgentGrants(conn.id, agentId)).tool_names);
    return { ...base, tools, granted, picked: new Set(granted), error };
  } catch (err) {
    return { ...base, error: error ?? err ?? new Error("") };
  }
}

export function PluginsSection({
  agentId,
  agentName,
  onDirtyChange,
  onGrantedChange,
  onOfferedChange,
}: {
  agentId: number;
  agentName: string;
  onDirtyChange?: (dirty: boolean) => void;
  // Saved plugin grants (null until known), for the tab's total.
  onGrantedChange?: (count: number | null) => void;
  // Ticked plugin tools as the engine is offered them; they count toward the 25 tools given one by one.
  onOfferedChange?: (tools: OfferedTool[]) => void;
}) {
  const t = useT();
  const locale = resolveLocale(useLanguageChoice());
  const [plugins, setPlugins] = useState<Plugin[] | null>(null);
  // Null when the catalog could not be read: update states are then simply not shown.
  const [catalog, setCatalog] = useState<MarketplaceCatalog | null>(null);
  const [listError, setListError] = useState<unknown>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
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
      const conns = await api.listMarketplaceConnections();
      setPlugins(conns.map((conn) => ({ conn, tools: null, granted: null, picked: new Set(), error: null })));
      // Each plugin fills in as its service answers; one slow service does not hold up the others.
      await Promise.all(conns.map(async (conn) => {
        const next = await readPlugin(conn, agentId);
        setPlugins((list) => (list ?? []).map((p) => (p.conn.id === conn.id ? next : p)));
      }));
    } catch (err) {
      setPlugins(null);
      setListError(err ?? new Error(""));
    }
  }, [agentId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  useEffect(() => {
    let live = true;
    api.getMarketplaceCatalog().then((found) => { if (live) setCatalog(found); }).catch(() => {});
    return () => { live = false; };
  }, []);

  // Read one plugin again (after a save or a retry) without touching the others' unsaved ticks. The
  // connection is read afresh, so a token added or removed on the marketplace page since the tab
  // opened shows, and a plugin removed there leaves the list.
  const reloadOne = useCallback(async (id: string) => {
    setPlugins((list) => (list ?? []).map((p) => (p.conn.id === id ? { ...p, tools: null, granted: null, error: null } : p)));
    let next: Plugin;
    try {
      const conn = (await api.listMarketplaceConnections()).find((c) => c.id === id);
      if (!conn) {
        setPlugins((list) => (list ?? []).filter((p) => p.conn.id !== id));
        return;
      }
      next = await readPlugin(conn, agentId);
    } catch (err) {
      setPlugins((list) => (list ?? []).map((p) => (p.conn.id === id ? { ...p, error: err ?? new Error("") } : p)));
      return;
    }
    setPlugins((list) => (list ?? []).map((p) => (p.conn.id === id ? next : p)));
  }, [agentId]);

  const unsaved = (plugins ?? []).some((p) => p.tools !== null && p.granted !== null && !sameNames(p.picked, p.granted));
  useEffect(() => { onDirtyChange?.(unsaved); }, [unsaved, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  // Every plugin's saved grants count, as on the roster; unknown while any of them is unknown.
  const granted = useMemo(() => {
    if (plugins === null) return null;
    let sum = 0;
    for (const p of plugins) {
      if (p.granted === null) return null;
      sum += p.granted.size;
    }
    return sum;
  }, [plugins]);
  useEffect(() => { onGrantedChange?.(granted); }, [granted, onGrantedChange]);

  const offered = useMemo<OfferedTool[]>(() => (plugins ?? []).flatMap((p) => (p.tools ?? [])
    .filter((tool) => p.picked.has(tool.name))
    .map((tool) => ({ kind: "plugin" as const, server: p.conn.name, description: tool.description, input_schema: tool.input_schema }))), [plugins]);
  useEffect(() => { onOfferedChange?.(offered); }, [offered, onOfferedChange]);

  const save = async (p: Plugin) => {
    if (!p.tools) return;
    setBusy(p.conn.id);
    setResult(null);
    try {
      const tools = p.tools.filter((tool) => p.picked.has(tool.name)).map((tool) => ({ name: tool.name, schema_digest: tool.schema_digest }));
      const saved = await api.saveMarketplaceAgentGrants(p.conn.id, agentId, tools);
      const names = new Set(saved.tool_names);
      setPlugins((list) => (list ?? []).map((item) => (item.conn.id === p.conn.id ? { ...item, granted: names, picked: new Set(names) } : item)));
      const n = names.size;
      setResult({ id: p.conn.id, ok: true, text: t(`agentTools.saved.${pluralForm(locale, n)}`, { server: p.conn.name, name: agentName, n }) });
    } catch (err) {
      setResult({ id: p.conn.id, ok: false, text: errorText(err) });
      const code = (err as { code?: unknown } | null)?.code;
      if (code === "connection_changed" || code === "tool_schema_changed" || code === "credential_required") await reloadOne(p.conn.id);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-small text-muted">{t("agentTools.plugins.where", { name: agentName })}</p>
      {listError !== null ? (
        <Banner tone="danger" title={t("agentTools.plugins.loadFailed")} action={<Button size="sm" onClick={() => { setListError(null); void load(); }}>{t("agentTools.retry")}</Button>}>
          {errorText(listError)}
        </Banner>
      ) : plugins === null ? (
        <SkeletonList rows={2} />
      ) : plugins.length === 0 ? (
        <p className="text-small text-muted">
          {t("agentTools.plugins.none")}{" "}
          <Link href={PLUGINS_PAGE} className="text-accent-text underline underline-offset-2">{t("agentTools.plugins.browse")}</Link>
        </p>
      ) : (
        <>
          <ul className="flex flex-col gap-2">
            {plugins.map((p) => {
              const needsToken = pluginNeedsToken(p.conn);
              const loading = !needsToken && p.tools === null && p.error === null;
              const failed = !needsToken && p.error !== null;
              const dirty = p.tools !== null && p.granted !== null && !sameNames(p.picked, p.granted);
              const update = pluginUpdate(p.conn, catalog);
              const isOpen = open[p.conn.id] ?? (needsToken || failed || update.state === "update" || (p.granted?.size ?? 0) > 0);
              const status = needsToken
                ? { status: "waiting" as const, label: t("agentTools.plugins.needsToken") }
                : failed
                  ? { status: "denied" as const, label: t("agentTools.state.loadFailed") }
                  : update.state === "update"
                    ? { status: "waiting" as const, label: t("agentTools.plugins.update") }
                    : null;
              return (
                <ToolGrantCard
                  key={p.conn.id}
                  id={`plugin-${p.conn.id}`}
                  name={p.conn.name}
                  meta={
                    <span className="flex shrink-0 items-center gap-1.5">
                      <span className="text-small text-muted">{t("agentTools.plugins.version", { version: p.conn.manifest.version })}</span>
                      <Badge>{p.conn.section === "tested" ? t("agentTools.plugins.tested") : t("agentTools.plugins.community")}</Badge>
                    </span>
                  }
                  status={status}
                  tools={loading || failed || needsToken ? null : p.tools}
                  picked={p.picked}
                  dirty={dirty}
                  open={isOpen}
                  onToggle={() => setOpen((o) => ({ ...o, [p.conn.id]: !isOpen }))}
                  filter=""
                  grantedOnly={false}
                  saving={busy === p.conn.id}
                  disabled={busy !== null}
                  onPick={(next) => setPlugins((list) => (list ?? []).map((item) => (item.conn.id === p.conn.id ? { ...item, picked: next } : item)))}
                  onSave={() => void save(p)}
                  note={result?.id === p.conn.id ? (result.ok
                    ? <p role="status" className="text-small text-muted">{result.text}</p>
                    : <Banner tone="danger" title={t("agentTools.saveFailed", { server: p.conn.name })} onDismiss={() => setResult(null)}>{result.text}</Banner>) : null}
                >
                  {loading ? <SkeletonList rows={2} /> : null}
                  {failed ? (
                    <Banner tone="danger" title={t("agentTools.state.loadFailed")} action={<Button size="sm" onClick={() => void reloadOne(p.conn.id)}>{t("agentTools.retry")}</Button>}>
                      {errorText(p.error)}
                    </Banner>
                  ) : null}
                  {needsToken ? (
                    <p className="text-small text-muted">{t("agentTools.plugins.needsTokenHelp")}</p>
                  ) : null}
                  {update.state === "update" ? (
                    <p className="text-small text-muted">{t("agentTools.plugins.updateHelp", { version: update.version })}</p>
                  ) : update.state === "withdrawn" ? (
                    <p className="text-small text-muted">{t("agentTools.plugins.withdrawnHelp")}</p>
                  ) : null}
                  {needsToken || failed || update.state === "update" ? (
                    <Link href={PLUGINS_PAGE} className="self-start text-small text-accent-text underline underline-offset-2">{t("agentTools.plugins.manage")}</Link>
                  ) : null}
                </ToolGrantCard>
              );
            })}
          </ul>
          <p className="text-small text-muted">
            <Link href={PLUGINS_PAGE} className="text-accent-text underline underline-offset-2">{t("agentTools.plugins.manage")}</Link>
          </p>
        </>
      )}
    </div>
  );
}
