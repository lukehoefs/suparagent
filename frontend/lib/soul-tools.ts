// The tools block of an agent's SOUL.md, read for display. The server writes it for the agent
// (backend services/agent_soul.py render_tools): a "## Tools you can use" heading, two sentences
// addressed to the agent, then one "### {source}" heading per server with "- `{name}`: {description}"
// rows. Only the headings and rows are data; the sentences are instructions for the agent and are
// left out, as is the empty-state sentence written when nothing is granted. No runtime imports, so
// node tests can load it.

export type SoulTool = { name: string; description: string };
export type SoulToolGroup = { label: string; tools: SoulTool[] };

const GROUP_HEADING = /^###\s+(.+?)\s*$/;
const TOOL_ROW = /^-\s+`([^`]+)`\s*:\s*(.*)$/;

/** The granted tools by source, in the order the block lists them. Groups with no tools are dropped. */
export function parseManagedTools(managed: string | null | undefined): SoulToolGroup[] {
  const groups: SoulToolGroup[] = [];
  let current: SoulToolGroup | null = null;
  for (const raw of (managed ?? "").split(/\r?\n/)) {
    const line = raw.trim();
    const heading = GROUP_HEADING.exec(line);
    if (heading) {
      current = { label: heading[1], tools: [] };
      groups.push(current);
      continue;
    }
    const row = TOOL_ROW.exec(line);
    if (!row) continue;
    if (current === null) {
      // A row before any heading (an older or hand-edited block): keep it in an unnamed group.
      current = { label: "", tools: [] };
      groups.push(current);
    }
    current.tools.push({ name: row[1].trim(), description: row[2].trim() });
  }
  return groups.filter((group) => group.tools.length > 0);
}

/** How many tools the block lists. */
export function soulToolCount(groups: readonly SoulToolGroup[]): number {
  return groups.reduce((total, group) => total + group.tools.length, 0);
}
