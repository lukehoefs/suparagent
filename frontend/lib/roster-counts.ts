// The "N skills · N tools" line on the roster cards. There is no count endpoint, so the page asks
// per agent: its skills list, and its tool grants on every connection. These helpers keep that
// bounded and say what to count. No runtime imports, so node tests can load it.

/** A count that could not be read is null, and the card leaves it out rather than guess. */
export type AgentCounts = { skills: number | null; tools: number | null };

/** Runs tasks with at most `max` in flight; the rest wait their turn in order. */
export function createLimiter(max: number): <T>(task: () => Promise<T>) => Promise<T> {
  const size = Math.max(1, Math.floor(max));
  let active = 0;
  const queue: (() => void)[] = [];
  const next = () => {
    if (active >= size) return;
    const start = queue.shift();
    if (start) start();
  };
  return <T>(task: () => Promise<T>) =>
    new Promise<T>((resolve, reject) => {
      queue.push(() => {
        active += 1;
        let running: Promise<T>;
        try {
          running = Promise.resolve(task());
        } catch (err) {
          running = Promise.reject(err);
        }
        running.then(resolve, reject).finally(() => {
          active -= 1;
          next();
        });
      });
      next();
    });
}

/** Skills that load into the agent's turns: the list also carries switched-off ones. */
export function enabledSkillCount(skills: readonly { enabled: boolean }[]): number {
  return skills.filter((skill) => skill.enabled).length;
}

/** Tools an agent may call, the same set its SOUL.md lists: grants on enabled custom servers plus
 * grants on community (marketplace) servers. Composio apps are apps, not tools, and are not counted. */
export function grantedToolCount(grants: readonly { tool_names: readonly string[] }[]): number {
  return grants.reduce((sum, grant) => sum + grant.tool_names.length, 0);
}

/** The custom servers whose grants count: enabled ones only. */
export function countedCustomServers<T extends { id: string; enabled: boolean }>(connections: readonly T[]): string[] {
  return connections.filter((connection) => connection.enabled).map((connection) => connection.id);
}
