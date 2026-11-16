// Presentation rules for the transcript, with no runtime imports so node tests can load them.

type Keyed = { kind: string; key: string };

export type ToolRun<T> = { kind: "tool_run"; key: string; tools: T[] };

// Runs of three or more tool calls in a row are shown as one collapsible group so a busy turn
// does not bury the answer. One or two calls stay as single rows. Anything else in between
// (an approval, a message) ends a run.
export const MIN_RUN = 3;

export function groupToolRuns<T extends Keyed>(items: readonly T[]): (T | ToolRun<T>)[] {
  const out: (T | ToolRun<T>)[] = [];
  let run: T[] = [];
  const flush = () => {
    if (run.length >= MIN_RUN) out.push({ kind: "tool_run", key: `run-${run[0].key}`, tools: run });
    else out.push(...run);
    run = [];
  };
  for (const item of items) {
    if (item.kind === "tool") run.push(item);
    else {
      flush();
      out.push(item);
    }
  }
  flush();
  return out;
}

export function toolRunSummary(tools: readonly { state: string }[]): { total: number; running: number; failed: number } {
  return {
    total: tools.length,
    running: tools.filter((tool) => tool.state === "running").length,
    failed: tools.filter((tool) => tool.state === "error").length,
  };
}

// Message text as it should be spoken: code fences and Markdown marks are dropped, links keep
// their words.
export function spokenText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " code block ")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[`*_>#|~]/g, "")
    .replace(/^\s*[-+]\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

type AnnounceItem = { kind: string; key: string; text?: string; incomplete?: boolean; status?: string };

// What a screen reader should be told, once, about the newest thing that needs attention: an
// approval waiting, a finished answer, a failed run. The transcript itself is not a live
// region (it would re-read every tool tick); this picks the few events worth speaking.
export function announcement(items: readonly AnnounceItem[]): { key: string; text: string } | null {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (item.kind === "approval" && item.status === "pending") return { key: item.key, text: "Your agent is waiting for your approval." };
    if (item.kind === "turn_end" && item.status === "failed") return { key: item.key, text: "The run failed." };
    if (item.kind === "assistant" && !item.incomplete && item.text) {
      const text = spokenText(item.text);
      return { key: item.key, text: `Agent replied: ${text.length > 240 ? `${text.slice(0, 240)}…` : text}` };
    }
  }
  return null;
}

// The design's tool-call group: every run of tool calls (one or more in a row) is one card, and a
// decided approval for one of its calls shows on that call's row ("Allowed once") instead of as a
// card of its own. An approval matches the nearest call of the same tool that has none yet, before
// or after it. Anything else ends the run; an approval that matches no call stays a standalone item.
export type ToolGroup<T> = { kind: "tool_group"; key: string; tools: T[]; approvals: Record<string, T> };

type Step = Keyed & { name?: string; tool?: string; status?: string };

export function groupToolCalls<T extends Step>(items: readonly T[]): (T | ToolGroup<T>)[] {
  const out: (T | ToolGroup<T>)[] = [];
  let group: ToolGroup<T> | null = null;
  let waiting: T[] = []; // decided approvals seen before their call
  const flush = () => {
    if (group) out.push(group);
    out.push(...waiting);
    group = null;
    waiting = [];
  };
  for (const item of items) {
    if (item.kind === "tool") {
      if (!group) group = { kind: "tool_group", key: `group-${item.key}`, tools: [], approvals: {} };
      group.tools.push(item);
      const early = waiting.findIndex((approval) => approval.tool === item.name);
      if (early >= 0) {
        group.approvals[item.key] = waiting[early];
        waiting.splice(early, 1);
      }
      continue;
    }
    if (item.kind === "approval" && item.status !== "pending") {
      const open = group?.tools.slice().reverse().find((tool) => tool.name === item.tool && !group!.approvals[tool.key]);
      if (group && open) group.approvals[open.key] = item;
      else waiting.push(item);
      continue;
    }
    flush();
    out.push(item);
  }
  flush();
  return out;
}
