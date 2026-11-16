"use client";

// One agent's tools from switched-on custom MCP servers (web search, Gmail via Activepieces, computers...).
// Grants save per server; each save refreshes the agent's SOUL.md tool list on the server.
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { CustomMcpConnection, CustomMcpTool } from "@/lib/custom-mcp";
import { appOf, groupByApp } from "@/lib/tool-groups";

const TOOL_ENGINES = new Set(["claude", "codex"]);
type Server = { conn: CustomMcpConnection; tools: CustomMcpTool[]; granted: Set<string>; picked: Set<string> };

const same = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((x) => b.has(x));

export function AgentToolsSection({ agentId, agentName, provider }: { agentId: number; agentName: string; provider: string }) {
  const [servers, setServers] = useState<Server[] | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState("");
  const [grantedOnly, setGrantedOnly] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const conns = (await api.listCustomMcp()).filter((c) => c.enabled);
      const list: Server[] = [];
      for (const conn of conns) {
        const [tools, grants] = await Promise.all([
          api.getCustomMcpTools(conn.id).catch(() => [] as CustomMcpTool[]),
          api.getCustomMcpGrants(conn.id, agentId).catch(() => ({ tool_names: [] as string[] })),
        ]);
        const granted = new Set(grants.tool_names);
        list.push({ conn, tools, granted, picked: new Set(granted) });
      }
      setServers(list);
    } catch (err) {
      setServers([]);
      setError(err instanceof Error ? err.message : "Could not load tool servers.");
    }
  }, [agentId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const q = filter.trim().toLowerCase();
  const total = useMemo(() => (servers ?? []).reduce((n, s) => n + s.granted.size, 0), [servers]);

  const update = (id: string, fn: (picked: Set<string>, tools: CustomMcpTool[]) => Set<string>) =>
    setServers((list) => (list ?? []).map((s) => (s.conn.id === id ? { ...s, picked: fn(new Set(s.picked), s.tools) } : s)));

  const save = async (s: Server) => {
    setBusy(s.conn.id);
    setError(null);
    setNotice(null);
    try {
      const tools = s.tools.filter((t) => s.picked.has(t.name)).map((t) => ({ name: t.name, schema_digest: t.schema_digest }));
      await api.saveCustomMcpGrants(s.conn.id, agentId, s.conn.revision, tools);
      setNotice(`Saved ${s.conn.name}. ${agentName}'s SOUL.md now lists ${tools.length} tool${tools.length === 1 ? "" : "s"} from it.`);
      await load();
    } catch (err) {
      setError(`${s.conn.name}: ${err instanceof Error ? err.message : "could not save"}. Refresh and try again.`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted">
          Tools from your MCP servers. Granting makes a tool available to {agentName}; every use still asks for approval.
        </p>
        <span className="rounded-full border border-line px-2 py-0.5 text-xs text-muted">{total} granted</span>
      </div>
      {!TOOL_ENGINES.has(provider) && (
        <p className="rounded-md border border-line bg-inset/60 px-3 py-2 text-xs text-warning">
          {agentName} isn&apos;t on Claude Code or Codex, so granted tools won&apos;t reach it. Switch its engine under Model and approvals.
        </p>
      )}
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
      {notice && <p role="status" className="text-xs text-success">{notice}</p>}
      {servers === null ? (
        <p className="text-xs text-muted">Loading tool servers…</p>
      ) : servers.length === 0 ? (
        <p className="text-xs text-muted">
          No switched-on MCP servers yet. Add one under <Link href="/apps/" className="underline">Apps → Custom MCP servers</Link>.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <input
              className="min-w-0 flex-1 rounded-md border border-line bg-transparent px-3 py-1.5 text-sm placeholder:text-muted"
              placeholder="Filter tools or apps (e.g. gmail, sheets, drive)"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              aria-label="Filter tools"
            />
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted">
              <input type="checkbox" className="size-3.5 accent-(--accent)" checked={grantedOnly} onChange={(e) => setGrantedOnly(e.target.checked)} />
              Granted only
            </label>
          </div>
          <ul className="space-y-2">
            {servers.map((s) => {
              const shown = s.tools.filter((t) =>
                (!q || t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q) || appOf(t.name).toLowerCase().includes(q))
                && (!grantedOnly || s.picked.has(t.name)));
              const dirty = !same(s.picked, s.granted);
              const isOpen = open[s.conn.id] ?? (s.granted.size > 0 || Boolean(q));
              const allOn = s.tools.length > 0 && s.tools.every((t) => s.picked.has(t.name));
              return (
                <li key={s.conn.id} className="rounded-lg border border-line">
                  <div className="flex items-center justify-between gap-2 px-3 py-2">
                    <button
                      className="flex min-w-0 cursor-pointer items-center gap-2 text-left"
                      onClick={() => setOpen((o) => ({ ...o, [s.conn.id]: !isOpen }))}
                      aria-expanded={isOpen}
                    >
                      <span className="text-xs text-muted">{isOpen ? "▾" : "▸"}</span>
                      <span className="truncate text-sm font-medium">{s.conn.name}</span>
                      <span className="text-xs text-muted">{s.picked.size}/{s.tools.length}</span>
                    </button>
                    <div className="flex items-center gap-2">
                      <button
                        className="cursor-pointer text-xs text-muted underline disabled:opacity-50"
                        disabled={busy !== null || s.tools.length === 0}
                        onClick={() => update(s.conn.id, (p, tools) => (allOn ? new Set() : new Set(tools.map((t) => t.name))))}
                      >
                        {allOn ? "Clear all" : "Grant all"}
                      </button>
                      <button
                        className="cursor-pointer rounded-md bg-accent px-3 py-1 text-xs font-medium text-accent-fg hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                        disabled={!dirty || busy !== null}
                        onClick={() => void save(s)}
                      >
                        {busy === s.conn.id ? "Saving…" : "Save"}
                      </button>
                    </div>
                  </div>
                  {isOpen && (
                    <div className="max-h-80 overflow-y-auto border-t border-line">
                      {groupByApp(shown).map((group) => {
                        const names = group.tools.map((t) => t.name);
                        const on = names.filter((n) => s.picked.has(n)).length;
                        return (
                          <div key={group.app}>
                            <label className="sticky top-0 z-[1] flex cursor-pointer items-center gap-2.5 border-b border-line/60 bg-inset/90 px-3 py-1.5 backdrop-blur">
                              <input
                                type="checkbox"
                                aria-label={`All ${group.app} tools`}
                                className="size-4 shrink-0 cursor-pointer accent-(--accent)"
                                checked={on === names.length && names.length > 0}
                                ref={(el) => { if (el) el.indeterminate = on > 0 && on < names.length; }}
                                onChange={() => update(s.conn.id, (p) => {
                                  const all = names.every((n) => p.has(n));
                                  for (const n of names) { if (all) p.delete(n); else p.add(n); }
                                  return p;
                                })}
                              />
                              <span className="text-xs font-semibold">{group.app}</span>
                              <span className="text-xs text-muted">{on}/{names.length}</span>
                            </label>
                            <ul className="divide-y divide-line/60">
                              {group.tools.map((t) => (
                                <li key={t.name}>
                                  <label className="flex cursor-pointer items-start gap-2.5 py-2 pl-8 pr-3 hover:bg-hover/40">
                                    <input
                                      type="checkbox"
                                      className="mt-0.5 size-4 shrink-0 cursor-pointer accent-(--accent)"
                                      checked={s.picked.has(t.name)}
                                      onChange={() => update(s.conn.id, (p) => { if (p.has(t.name)) p.delete(t.name); else p.add(t.name); return p; })}
                                    />
                                    <span className="min-w-0">
                                      <span className="block font-mono text-[12px]">{t.name}</span>
                                      <span className="block truncate text-xs text-muted" title={t.description}>{t.description}</span>
                                    </span>
                                  </label>
                                </li>
                              ))}
                            </ul>
                          </div>
                        );
                      })}
                      {shown.length === 0 && <p className="px-3 py-2 text-xs text-muted">No tools match.</p>}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-muted">
            Need to grant to several agents at once? Use <Link href="/settings/permissions/" className="underline">Settings → Agent permissions</Link>.
          </p>
        </>
      )}
    </div>
  );
}
