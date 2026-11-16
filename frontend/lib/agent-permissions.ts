// Agent permissions matrix: bulk tool and skill grants across many agents.
// Pure helpers (keys, diffs, limits) so the page stays thin and the logic is testable.

export const MAX_AGENT_SKILLS = 30;

export type Cell = { kind: "tool" | "skill"; group: string; item: string; agentId: number };

export const cellKey = (c: Cell) => `${c.kind}|${c.group}|${c.item}|${c.agentId}`;

export function parseKey(key: string): Cell {
  const [kind, group, item, agentId] = key.split("|");
  return { kind: kind as Cell["kind"], group, item, agentId: Number(agentId) };
}

export type Change = Cell & { grant: boolean };

/** What differs between the saved state and the edited state, sorted for stable display. */
export function diff(saved: ReadonlySet<string>, desired: ReadonlySet<string>): Change[] {
  const changes: Change[] = [];
  for (const key of desired) if (!saved.has(key)) changes.push({ ...parseKey(key), grant: true });
  for (const key of saved) if (!desired.has(key)) changes.push({ ...parseKey(key), grant: false });
  return changes.sort((a, b) =>
    a.agentId - b.agentId || a.kind.localeCompare(b.kind) || a.group.localeCompare(b.group) || a.item.localeCompare(b.item));
}

/** The full list of tool names per (connection, agent) after the edit: what a grant save sends. */
export function toolGrantsByPair(desired: ReadonlySet<string>, pairs: Iterable<[string, number]>): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const [group, agentId] of pairs) out.set(`${group}|${agentId}`, []);
  for (const key of desired) {
    const c = parseKey(key);
    if (c.kind !== "tool") continue;
    const pair = `${c.group}|${c.agentId}`;
    if (!out.has(pair)) out.set(pair, []);
    out.get(pair)!.push(c.item);
  }
  for (const list of out.values()) list.sort();
  return out;
}

/** Agents whose skill count would exceed the limit after the edit. `existing` = skills not in the library. */
export function overSkillLimit(
  desired: ReadonlySet<string>,
  existingOther: ReadonlyMap<number, number>,
  limit = MAX_AGENT_SKILLS,
): number[] {
  const counts = new Map<number, number>();
  for (const key of desired) {
    const c = parseKey(key);
    if (c.kind === "skill") counts.set(c.agentId, (counts.get(c.agentId) ?? 0) + 1);
  }
  const over: number[] = [];
  const agents = new Set([...counts.keys(), ...existingOther.keys()]);
  for (const id of agents) if ((counts.get(id) ?? 0) + (existingOther.get(id) ?? 0) > limit) over.push(id);
  return over.sort((a, b) => a - b);
}

/** Toggle every cell in a set of keys on (when any is off) or off (when all are on). */
export function toggleAll(desired: ReadonlySet<string>, keys: string[]): Set<string> {
  const next = new Set(desired);
  const allOn = keys.length > 0 && keys.every((k) => next.has(k));
  for (const k of keys) {
    if (allOn) next.delete(k);
    else next.add(k);
  }
  return next;
}

export function summary(changes: Change[]): string {
  const agents = new Set(changes.map((c) => c.agentId)).size;
  const n = changes.length;
  return `${n} change${n === 1 ? "" : "s"} · ${agents} agent${agents === 1 ? "" : "s"}`;
}
