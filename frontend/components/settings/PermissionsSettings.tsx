"use client";

// Agent permissions: one matrix to grant many tools and skills to many agents, reviewed and saved at once.
// Tools come from switched-on custom MCP servers; skills from the built-in skill library. Every tool call
// still asks for approval; a grant only makes the tool available to the agent.
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type Agent } from "@/lib/api";
import type { CustomMcpConnection, CustomMcpTool } from "@/lib/custom-mcp";
import { LIBRARY_CATEGORIES, LIBRARY_SOURCE, SKILL_LIBRARY } from "@/lib/skill-library";
import {
  MAX_AGENT_SKILLS, cellKey, diff, overSkillLimit, summary, toggleAll, toolGrantsByPair, type Change,
} from "@/lib/agent-permissions";
import { appOf, groupByApp } from "@/lib/tool-groups";
import { SettingsCard } from "./SettingsCard";

type Mode = "tools" | "skills";
type Server = { conn: CustomMcpConnection; tools: CustomMcpTool[] };

const TOOL_ENGINES = new Set(["claude", "codex"]);
const LIB = "library";
const SEG = (on: boolean) =>
  `cursor-pointer rounded-md px-3 py-1.5 text-sm font-medium ${on ? "bg-raised shadow-card text-ink" : "text-muted hover:text-ink"}`;

function Box({ checked, onChange, label, mixed }: { checked: boolean; onChange: () => void; label: string; mixed?: boolean }) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      className="size-4 cursor-pointer accent-(--accent)"
      checked={checked}
      ref={(el) => { if (el) el.indeterminate = Boolean(mixed); }}
      onChange={onChange}
    />
  );
}

export function PermissionsSettings() {
  const [mode, setMode] = useState<Mode>("tools");
  const [agents, setAgents] = useState<Agent[]>([]);
  const [servers, setServers] = useState<Server[]>([]);
  const [otherSkills, setOtherSkills] = useState<Map<number, number>>(new Map());
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [desired, setDesired] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [grantedOnly, setGrantedOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = (await api.listAgents()).filter((a) => !a.archived_at);
      const conns = (await api.listCustomMcp()).filter((c) => c.enabled);
      const srv: Server[] = [];
      const keys = new Set<string>();
      for (const conn of conns) {
        const tools = await api.getCustomMcpTools(conn.id).catch(() => [] as CustomMcpTool[]);
        srv.push({ conn, tools });
        for (const agent of list) {
          const grants = await api.getCustomMcpGrants(conn.id, agent.id).catch(() => ({ tool_names: [] as string[] }));
          for (const name of grants.tool_names) keys.add(cellKey({ kind: "tool", group: conn.id, item: name, agentId: agent.id }));
        }
      }
      const libraryNames = new Set(SKILL_LIBRARY.map((s) => s.name));
      const other = new Map<number, number>();
      for (const agent of list) {
        const skills = await api.listSkills(agent.id).catch(() => []);
        let n = 0;
        for (const s of skills) {
          if (libraryNames.has(s.name)) keys.add(cellKey({ kind: "skill", group: LIB, item: s.name, agentId: agent.id }));
          else n += 1;
        }
        other.set(agent.id, n);
      }
      setAgents(list);
      setServers(srv);
      setOtherSkills(other);
      setSaved(keys);
      setDesired(new Set(keys));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load agents and tools.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const changes = useMemo(() => diff(saved, desired), [saved, desired]);
  const over = useMemo(() => overSkillLimit(desired, otherSkills), [desired, otherSkills]);
  const nameOf = (id: number) => agents.find((a) => a.id === id)?.name ?? `Agent ${id}`;
  const toolName = (group: string) => servers.find((s) => s.conn.id === group)?.conn.name ?? group;
  const q = query.trim().toLowerCase();

  // Rows: [group label, group id, items[]] for the current mode.
  const allGroups = useMemo(() => {
    if (mode === "tools") {
      // One section per server and app (e.g. "Activepieces › Gmail"), so big servers stay readable.
      return servers.flatMap((s) => {
        const shown = s.tools.filter((t) =>
          !q || t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q) || appOf(t.name).toLowerCase().includes(q));
        const apps = groupByApp(shown);
        return apps.map((a) => ({
          label: apps.length > 1 || a.app !== "Other" ? `${s.conn.name} › ${a.app}` : s.conn.name,
          id: s.conn.id,
          items: a.tools.map((t) => ({ name: t.name, hint: t.description })),
        }));
      }).filter((g) => g.items.length);
    }
    return LIBRARY_CATEGORIES.map((cat) => ({
      label: cat,
      id: LIB,
      items: SKILL_LIBRARY
        .filter((s) => s.category === cat && (!q || s.name.includes(q) || s.description.toLowerCase().includes(q)))
        .map((s) => ({ name: s.name, hint: s.description })),
    })).filter((g) => g.items.length);
  }, [mode, servers, q]);

  const kind = mode === "tools" ? "tool" : "skill";
  const key = (group: string, item: string, agentId: number) => cellKey({ kind, group, item, agentId });
  // "Granted only" filters on what is saved, so rows don't vanish while you edit them.
  const groups = grantedOnly
    ? allGroups
      .map((g) => ({ ...g, items: g.items.filter((it) => agents.some((a) => saved.has(key(g.id, it.name, a.id)))) }))
      .filter((g) => g.items.length)
    : allGroups;
  const flip = (k: string) => setDesired((d) => { const n = new Set(d); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  const save = async () => {
    setBusy(true);
    setError(null);
    const failures: string[] = [];
    try {
      // Tools: one full grant list per (server, agent) that changed.
      const touched = new Set(changes.filter((c) => c.kind === "tool").map((c) => `${c.group}|${c.agentId}`));
      const pairs = [...touched].map((p) => { const [g, a] = p.split("|"); return [g, Number(a)] as [string, number]; });
      const lists = toolGrantsByPair(desired, pairs);
      for (const [pair, names] of lists) {
        if (!touched.has(pair)) continue;
        const [group, agent] = pair.split("|");
        const server = servers.find((s) => s.conn.id === group);
        if (!server) continue;
        const tools = names
          .map((n) => server.tools.find((t) => t.name === n))
          .filter((t): t is CustomMcpTool => Boolean(t))
          .map((t) => ({ name: t.name, schema_digest: t.schema_digest }));
        try {
          await api.saveCustomMcpGrants(group, Number(agent), server.conn.revision, tools);
        } catch (err) {
          failures.push(`${server.conn.name} → ${nameOf(Number(agent))}: ${err instanceof Error ? err.message : "failed"}`);
        }
      }
      // Skills: add from the library (switched on) or remove.
      for (const c of changes.filter((ch) => ch.kind === "skill")) {
        const lib = SKILL_LIBRARY.find((s) => s.name === c.item);
        try {
          if (c.grant && lib) {
            await api.saveSkill(c.agentId, lib.name, { description: lib.description, body: lib.body, enabled: true, source: LIBRARY_SOURCE });
          } else if (!c.grant) {
            await api.deleteSkill(c.agentId, c.item);
          }
        } catch (err) {
          failures.push(`/${c.item} → ${nameOf(c.agentId)}: ${err instanceof Error ? err.message : "failed"}`);
        }
      }
      setReviewing(false);
      setNotice(failures.length ? null : `Saved ${summary(changes)}. Each agent's SOUL.md now lists its tools.`);
      if (failures.length) setError(`Some changes did not save:\n${failures.join("\n")}`);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const nonToolAgents = agents.filter((a) => !TOOL_ENGINES.has(a.provider));
  return (
    <div className="space-y-6 pb-24" data-setting-root data-setting-container tabIndex={-1}>
      <SettingsCard
        title="Agent permissions"
        description="Grant tools and skills to many agents at once. Granting makes a tool available; every use still asks for your approval."
      >
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-lg bg-inset p-1" role="tablist" aria-label="What to grant">
            <button role="tab" aria-selected={mode === "tools"} className={SEG(mode === "tools")} onClick={() => setMode("tools")}>Tools</button>
            <button role="tab" aria-selected={mode === "skills"} className={SEG(mode === "skills")} onClick={() => setMode("skills")}>Skills</button>
          </div>
          <input
            className="w-full max-w-xs rounded-md border border-line bg-transparent px-3 py-1.5 text-sm placeholder:text-muted"
            placeholder={mode === "tools" ? "Filter tools or apps (gmail, sheets…)" : `Filter ${SKILL_LIBRARY.length} skills`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Filter"
          />
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted">
            <input type="checkbox" className="size-3.5 accent-(--accent)" checked={grantedOnly} onChange={(e) => setGrantedOnly(e.target.checked)} />
            Granted only
          </label>
          <button className="cursor-pointer text-xs text-muted underline" onClick={() => void load()} disabled={busy || loading}>Refresh</button>
        </div>

        {mode === "tools" && nonToolAgents.length > 0 && (
          <p className="mt-3 rounded-md border border-line bg-inset/60 px-3 py-2 text-xs text-muted">
            Connected tools only work for agents on Claude Code or Codex. Not on those engines: {nonToolAgents.map((a) => a.name).join(", ")}.
          </p>
        )}
        {notice && <p role="status" className="mt-3 text-xs text-success">{notice}</p>}
        {error && <p role="alert" className="mt-3 whitespace-pre-line text-xs text-danger">{error}</p>}

        {loading ? (
          <p className="mt-4 text-sm text-muted">Loading agents, tools and skills…</p>
        ) : agents.length === 0 ? (
          <p className="mt-4 text-sm text-muted">Create an agent first, then come back to grant tools and skills.</p>
        ) : groups.length === 0 ? (
          <p className="mt-4 text-sm text-muted">
            {mode === "tools" ? "No switched-on tool servers yet. Add one under Apps → MCP Marketplace → Custom MCP servers." : "No skills match."}
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-lg border border-line">
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 z-10 bg-raised">
                <tr>
                  <th className="min-w-56 px-3 py-2 text-left text-xs font-medium text-muted">{mode === "tools" ? "Tool" : "Skill"}</th>
                  {agents.map((a) => (
                    <th key={a.id} className="px-2 py-2 text-center text-xs font-medium">
                      <div className="flex flex-col items-center gap-1">
                        <span className="max-w-24 truncate" title={a.name}>{a.name}</span>
                        {mode === "skills" && over.includes(a.id) && <span className="text-[10px] text-danger">over {MAX_AGENT_SKILLS}</span>}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => {
                  const groupKeys = (agentId: number) => g.items.map((it) => key(g.id, it.name, agentId));
                  return [
                    <tr key={`g-${g.label}`} className="bg-inset/60">
                      <td className="px-3 py-1.5 text-xs font-semibold">{g.label}</td>
                      {agents.map((a) => {
                        const ks = groupKeys(a.id);
                        const on = ks.filter((k) => desired.has(k)).length;
                        return (
                          <td key={a.id} className="px-2 py-1.5 text-center">
                            <Box
                              label={`All ${g.label} for ${a.name}`}
                              checked={on === ks.length && ks.length > 0}
                              mixed={on > 0 && on < ks.length}
                              onChange={() => setDesired((d) => toggleAll(d, ks))}
                            />
                          </td>
                        );
                      })}
                    </tr>,
                    ...g.items.map((it) => {
                      const rowKeys = agents.map((a) => key(g.id, it.name, a.id));
                      const onRow = rowKeys.filter((k) => desired.has(k)).length;
                      return (
                        <tr key={`${g.label}-${it.name}`} className="border-t border-line/60 hover:bg-hover/40">
                          <td className="px-3 py-1.5">
                            <div className="flex items-center gap-2">
                              <Box
                                label={`${it.name} for every agent`}
                                checked={onRow === rowKeys.length}
                                mixed={onRow > 0 && onRow < rowKeys.length}
                                onChange={() => setDesired((d) => toggleAll(d, rowKeys))}
                              />
                              <div className="min-w-0">
                                <div className="font-mono text-[12px]">{mode === "skills" ? `/${it.name}` : it.name}</div>
                                <div className="max-w-md truncate text-xs text-muted" title={it.hint}>{it.hint}</div>
                              </div>
                            </div>
                          </td>
                          {agents.map((a) => {
                            const k = key(g.id, it.name, a.id);
                            const changed = desired.has(k) !== saved.has(k);
                            return (
                              <td key={a.id} className={`px-2 py-1.5 text-center ${changed ? "bg-accent/10" : ""}`}>
                                <Box label={`${it.name} for ${a.name}`} checked={desired.has(k)} onChange={() => flip(k)} />
                              </td>
                            );
                          })}
                        </tr>
                      );
                    }),
                  ];
                })}
              </tbody>
            </table>
          </div>
        )}
      </SettingsCard>

      {changes.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-raised/95 px-4 py-3 shadow-card backdrop-blur">
          <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3">
            <span className="text-sm font-medium">{summary(changes)}</span>
            <div className="flex gap-2">
              <button className="cursor-pointer rounded-md border border-line px-3 py-1.5 text-sm hover:bg-hover" onClick={() => setDesired(new Set(saved))} disabled={busy}>Discard</button>
              <button className="cursor-pointer rounded-md border border-line px-3 py-1.5 text-sm hover:bg-hover" onClick={() => setReviewing((v) => !v)} disabled={busy}>{reviewing ? "Hide review" : "Review"}</button>
              <button
                className="cursor-pointer rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-accent-fg hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => void save()}
                disabled={busy || over.length > 0}
                title={over.length ? `Some agents would have more than ${MAX_AGENT_SKILLS} skills` : undefined}
              >
                {busy ? "Saving…" : "Save all"}
              </button>
            </div>
          </div>
          {reviewing && <Review changes={changes} nameOf={nameOf} toolName={toolName} />}
        </div>
      )}
    </div>
  );
}

function Review({ changes, nameOf, toolName }: { changes: Change[]; nameOf: (id: number) => string; toolName: (g: string) => string }) {
  const byAgent = new Map<number, Change[]>();
  for (const c of changes) byAgent.set(c.agentId, [...(byAgent.get(c.agentId) ?? []), c]);
  return (
    <div className="mx-auto mt-3 max-h-64 max-w-4xl overflow-y-auto rounded-md border border-line p-3 text-xs">
      {[...byAgent].map(([agentId, list]) => (
        <div key={agentId} className="mb-2">
          <div className="font-semibold">{nameOf(agentId)}</div>
          <ul className="mt-1 space-y-0.5">
            {list.map((c) => (
              <li key={`${c.kind}${c.group}${c.item}`} className={c.grant ? "text-success" : "text-danger"}>
                {c.grant ? "+ " : "− "}
                {c.kind === "skill" ? `skill /${c.item}${c.grant ? "" : " (removed from the agent)"}` : `${c.item} · ${toolName(c.group)}`}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
