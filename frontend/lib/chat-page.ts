// Rules for the chat page (design: Chat.html): the header's engine pill and status note, the
// tool-call rows (main argument, result count, duration), where a turn's usage line goes, and
// whether the live computer panel is open for an agent. Pure: no React, no network, so node
// tests can load it. Keys are i18n message keys (lib/locales/chat-page-extra.ts).

type EngineLike = {
  label: string;
  version?: string | null;
  available?: boolean;
  default_model?: string | null;
  models?: readonly { id: string; label: string; default?: boolean }[];
  capabilities?: { tools?: boolean };
};

/** The model's name as the engine lists it: the chosen model, else the engine's default; null
 * when neither is known (the pill then names the engine alone). */
export function modelName(engine: EngineLike | undefined, model: string | null): string | null {
  const models = engine?.models ?? [];
  if (model) return models.find((item) => item.id === model)?.label ?? model;
  const fallback = models.find((item) => item.default) ?? models.find((item) => item.id === engine?.default_model);
  return fallback?.label ?? engine?.default_model ?? null;
}

/** The header's quiet engine pill: "OpenRouter · Claude Opus 4", or the engine alone. */
export function enginePillText(engineLabel: string, model: string | null): string {
  return model ? `${engineLabel} · ${model}` : engineLabel;
}

type Translate = (key: string, vars?: Record<string, string | number>) => string;

/** What used to sit beside the header as "Ready · chat only": the engine's version (or whether
 * it is ready), "chat only" when it cannot use tools, and how the agent asks before acting.
 * Now the status pill's hint. Null when nothing is known. */
export function engineNote(t: Translate, engine: EngineLike | undefined, approvalMode: string | null): string | null {
  const parts: string[] = [];
  if (engine) {
    parts.push(engine.available === false ? t("header.unavailable") : engine.version || t("header.ready"));
    if (engine.capabilities && engine.capabilities.tools === false) parts.push(t("header.chatOnly"));
  }
  if (approvalMode) parts.push(approvalMode);
  return parts.length ? parts.join(" · ") : null;
}

// The input keys that name what a call is about, most telling first.
const MAIN_KEYS = ["query", "q", "search", "search_query", "url", "uri", "command", "cmd", "file_path", "path", "pattern", "prompt", "text", "message", "name", "title"];
const MAX_ARGUMENT = 160;

function oneLine(value: string): string {
  const line = value.replace(/\s+/g, " ").trim();
  return line.length > MAX_ARGUMENT ? `${line.slice(0, MAX_ARGUMENT - 1)}…` : line;
}

/** The main argument of a tool call, as the row shows it: the value of its most telling input
 * field ("freight capacity November", a URL, a command). For a built-in tool without one, the
 * engine's own summary. Null when there is nothing short to show. An MCP tool's summary names
 * the server, not the call, so it is never used. */
export function toolArgument(tool: string, input: unknown, summary: string | null | undefined): string | null {
  if (input && typeof input === "object" && !Array.isArray(input)) {
    const fields = input as Record<string, unknown>;
    for (const key of MAIN_KEYS) {
      const value = fields[key];
      if (typeof value === "string" && value.trim()) return oneLine(value);
    }
    for (const value of Object.values(fields)) {
      if (typeof value === "string" && value.trim()) return oneLine(value);
    }
  } else if (typeof input === "string" && input.trim()) {
    return oneLine(input);
  }
  if (!tool.startsWith("mcp__") && summary && summary.trim()) return oneLine(summary);
  return null;
}

/** Web addresses read better without quotes around them. */
export function isAddress(text: string): boolean {
  return /^https?:\/\/\S+$/i.test(text);
}

const LIST_KEYS = ["results", "items", "data", "entries", "hits", "files", "matches", "rows"];

function listLength(value: unknown): number | null {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === "object") {
    for (const key of LIST_KEYS) {
      const list = (value as Record<string, unknown>)[key];
      if (Array.isArray(list)) return list.length;
    }
  }
  return null;
}

/** How many results a call returned, when its output says so plainly: a JSON list, or an object
 * with one ("results", "items", ...), also inside an MCP text reply. Null otherwise: the row then
 * shows no count rather than a guess. */
export function toolResultCount(output: string | null | undefined): number | null {
  const text = (output ?? "").trim();
  if (!text || (text[0] !== "[" && text[0] !== "{")) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  const direct = listLength(parsed);
  if (direct !== null) return direct;
  // An MCP reply: {"content": [{"type": "text", "text": "<JSON>"}]}.
  const content = parsed && typeof parsed === "object" ? (parsed as { content?: unknown }).content : null;
  if (Array.isArray(content) && content.length === 1) {
    const part = content[0] as { type?: unknown; text?: unknown };
    if (part && part.type === "text" && typeof part.text === "string") return toolResultCount(part.text);
  }
  return null;
}

/** How long a finished call ran, in milliseconds: from when it started (or, when it waited for
 * an answer, from when that answer came) to when it finished. Null while it runs, when a time is
 * missing, or when the times disagree. */
export function toolDurationMs(
  tool: { state: string; startedAt?: string; endedAt?: string },
  approval?: { resolvedAt?: string } | null,
): number | null {
  if ((tool.state !== "done" && tool.state !== "error") || !tool.startedAt || !tool.endedAt) return null;
  const started = Date.parse(tool.startedAt);
  const ended = Date.parse(tool.endedAt);
  const answered = approval?.resolvedAt ? Date.parse(approval.resolvedAt) : Number.NaN;
  if (!Number.isFinite(started) || !Number.isFinite(ended)) return null;
  const from = Number.isFinite(answered) && answered > started && answered <= ended ? answered : started;
  const ms = ended - from;
  return ms >= 0 ? ms : null;
}

/** "0.4s", "12s", "1m 5s" in the reader's language (Intl unit names, no words of our own). */
export function formatToolDuration(ms: number, locale: string): string {
  const unit = (value: number, name: "second" | "minute", digits = 0) =>
    new Intl.NumberFormat(locale, { style: "unit", unit: name, unitDisplay: "narrow", maximumFractionDigits: digits }).format(value);
  const seconds = ms / 1000;
  if (seconds < 10) return unit(Math.max(0.1, Math.round(seconds * 10) / 10), "second", 1);
  if (seconds < 60) return unit(Math.round(seconds), "second");
  const whole = Math.round(seconds);
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  return rest ? `${unit(minutes, "minute")} ${unit(rest, "second")}` : unit(minutes, "minute");
}

type TurnItem = { kind: string; key: string; turnId?: number | null; text?: string };

/** Where each turn's usage line goes: under the turn's last written answer, so it shows with that
 * answer's copy and like buttons. A turn with no answer keeps it on its own line. Returns the
 * answer's key by turn id. */
export function usageHomes(items: readonly TurnItem[]): Map<number, string> {
  const homes = new Map<number, string>();
  for (const item of items) {
    if (item.kind === "assistant" && typeof item.turnId === "number" && item.text) homes.set(item.turnId, item.key);
  }
  return homes;
}

// The live computer panel beside the chat, remembered per agent on this device. Open unless it
// was closed for that agent.
export const COMPUTER_PANEL_PREFIX = "lukethomas.chat.computerPanel.";

type StorageLike = Pick<Storage, "getItem" | "setItem">;

export function computerPanelOpen(storage: () => StorageLike, agentId: number): boolean {
  try {
    return storage().getItem(`${COMPUTER_PANEL_PREFIX}${agentId}`) !== "closed";
  } catch {
    return true;
  }
}

export function saveComputerPanel(storage: () => StorageLike, agentId: number, open: boolean): boolean {
  try {
    storage().setItem(`${COMPUTER_PANEL_PREFIX}${agentId}`, open ? "open" : "closed");
    return true;
  } catch {
    return false;
  }
}

/** An audio link as its chip shows it: the host and path, shortened ("example.com/ep/12.mp3"). */
export function linkLabel(url: string, max = 48): string {
  const text = url.trim();
  let shown = text;
  try {
    const parsed = new URL(text);
    shown = `${parsed.host}${parsed.pathname === "/" ? "" : parsed.pathname}`;
  } catch {
    // Not a full address yet: show what was typed.
  }
  return shown.length > max ? `${shown.slice(0, max - 1)}…` : shown;
}

type CallItem = { kind: string; key: string; name?: string; state?: string; tool?: string; status?: string };

/** The calls that wait for the person's answer: for each approval still pending, the latest
 * running call of the same tool before it. Their rows read "Waiting for you", like the header,
 * rather than "Running". */
export function awaitingCalls(items: readonly CallItem[]): Set<string> {
  const waiting = new Set<string>();
  items.forEach((item, index) => {
    if (item.kind !== "approval" || item.status !== "pending") return;
    for (let i = index - 1; i >= 0; i--) {
      const call = items[i];
      if (call.kind === "tool" && call.name === item.tool && call.state === "running" && !waiting.has(call.key)) {
        waiting.add(call.key);
        return;
      }
    }
  });
  return waiting;
}
