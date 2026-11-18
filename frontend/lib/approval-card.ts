// The approval card docked above the composer (design: Chat.html), and how a decided one reads.
// Pure: no React, no network. Keys are i18n message keys (lib/locales/approval-card-extra.ts).
import type { ApprovalRule, ApprovalScope, ConversationAllow, ListedRule, ToolRisk } from "./api";

/** An allow given on a card for one conversation, as opposed to a saved command rule. */
export function isConversationAllow(rule: ListedRule): rule is ConversationAllow {
  return rule.scope === "hour" || rule.scope === "thread";
}

/** The saved command rules of a list, without the conversation allows. */
export function savedRules(rules: readonly ListedRule[]): ApprovalRule[] {
  return rules.filter((rule): rule is ApprovalRule => !isConversationAllow(rule));
}

const SCOPE_ORDER: readonly ApprovalScope[] = ["once", "hour", "thread"];

/** The answers the server says a card may offer, in order. "once" is always there; anything
 * unknown is dropped, so an older server (no list) offers "Allow once" only. */
export function parseScopes(value: unknown): ApprovalScope[] {
  const given = Array.isArray(value) ? value : [];
  return SCOPE_ORDER.filter((scope) => scope === "once" || given.includes(scope));
}

export function parseRisk(value: unknown): ToolRisk | null {
  return value === "read_only" || value === "changes" || value === "destructive" ? value : null;
}

/** How far a decided allow reached, as the server recorded it; null for once (or not said). */
export function parseReach(value: unknown): "hour" | "thread" | null {
  return value === "hour" || value === "thread" ? value : null;
}

/** The risk tag: the status it borrows (green read-only, amber changes, red can delete or send)
 * and its words. Null when the risk is not known: the card shows no tag rather than a guess. */
export function riskTag(risk: ToolRisk | null | undefined): { tone: "done" | "waiting" | "denied"; key: string } | null {
  switch (risk) {
    case "read_only":
      return { tone: "done", key: "approvalCard.risk.readOnly" };
    case "changes":
      return { tone: "waiting", key: "approvalCard.risk.changes" };
    case "destructive":
      return { tone: "denied", key: "approvalCard.risk.destructive" };
    default:
      return null;
  }
}

// The app's own sentence for its built-in tools, translated here. The server sends the same
// sentence in English (backend/app/services/tool_descriptions.py); keep the two in step.
const BUILT_IN: Record<string, string> = {
  Bash: "approvalCard.about.shell",
  Read: "approvalCard.about.read",
  NotebookRead: "approvalCard.about.read",
  Glob: "approvalCard.about.find",
  Grep: "approvalCard.about.find",
  LS: "approvalCard.about.find",
  Write: "approvalCard.about.write",
  Edit: "approvalCard.about.write",
  MultiEdit: "approvalCard.about.write",
  NotebookEdit: "approvalCard.about.write",
  apply_patch: "approvalCard.about.write",
  WebFetch: "approvalCard.about.web",
  WebSearch: "approvalCard.about.web",
  mcp__computer__exec: "approvalCard.about.computerShell",
  mcp__computer__read_file: "approvalCard.about.computerRead",
  mcp__computer__list_files: "approvalCard.about.computerRead",
  mcp__computer__write_file: "approvalCard.about.computerWrite",
  mcp__computer__screenshot: "approvalCard.about.screenRead",
  mcp__computer__wait: "approvalCard.about.screenRead",
  mcp__team__ask_agent: "approvalCard.about.delegate",
  mcp__team__delegate: "approvalCard.about.delegate",
  mcp__team__create_agent: "approvalCard.about.createAgent",
  mcp__team__say_in_room: "approvalCard.about.roomPost",
  // The kinds an ACP engine reports for a call that is not a plain shell command.
  "acp:read": "approvalCard.about.read",
  "acp:search": "approvalCard.about.find",
  "acp:fetch": "approvalCard.about.web",
  "acp:edit": "approvalCard.about.write",
  "acp:move": "approvalCard.about.write",
  "acp:delete": "approvalCard.about.acpDelete",
  "acp:execute": "approvalCard.about.shell",
};

const SCREEN_INPUT = /^mcp__computer__(click|double_click|move|drag|type|key|scroll)$/;
const BROWSER_READ = /^mcp__computer__browser_(snapshot|read|wait|screenshot)$/;
const BROWSER_INPUT = /^mcp__computer__browser_(open|click|fill|type|press|tabs|dialog|restart|close)$/;
const NATIVE_READ = /^mcp__computer__native_(get_desktop_state|get_window_state|list_apps|list_windows)$/;
const NATIVE_INPUT = /^mcp__computer__native_(click|type_text|press_key|scroll)$/;

// What the card said before the server described tools, by the kind the engine reported.
const BY_KIND: Record<string, string> = {
  file_read: "approval.effect.readDesc",
  screen_read: "approval.effect.screenReadDesc",
  command: "approval.effect.commandDesc",
  file_write: "approval.effect.writeDesc",
  screen_input: "approval.effect.screenInputDesc",
};

export function builtInSentenceKey(tool: string): string | null {
  if (BUILT_IN[tool]) return BUILT_IN[tool];
  if (SCREEN_INPUT.test(tool)) return "approvalCard.about.screenInput";
  if (BROWSER_READ.test(tool)) return "approvalCard.about.browserRead";
  if (BROWSER_INPUT.test(tool)) return "approvalCard.about.browserInput";
  if (NATIVE_READ.test(tool)) return "approvalCard.about.nativeRead";
  if (NATIVE_INPUT.test(tool)) return "approvalCard.about.nativeInput";
  return null;
}

/** The sentence after the tag: the app's own (translated) for a built-in tool, else what the
 * server said the tool does (an MCP server's description, as given), else what the kind of call
 * means; null when nothing is known. */
export function aboutSentence(
  tool: string,
  toolSummary: string | null | undefined,
  kind: string | null | undefined,
): { key: string } | { text: string } | null {
  const key = builtInSentenceKey(tool);
  if (key) return { key };
  const text = (toolSummary ?? "").trim();
  if (text) return { text };
  const byKind = kind ? BY_KIND[kind] : undefined;
  return byKind ? { key: byKind } : null;
}

/** A scoped allow of this call is tied to the exact command, never the tool (the server's rule:
 * a shell tool, or any call it reports as a command). The card says so on the buttons' hints. */
export function scopeIsExact(tool: string, kind: string | null | undefined): boolean {
  return tool === "Bash" || tool === "mcp__computer__exec" || kind === "command";
}

/** Which extra answers the card shows: only those the server offers, and none for a screen
 * tool, whose allow already covers the rest of the turn. */
export function extraAnswers(scopes: readonly ApprovalScope[], screenInput: boolean): { hour: boolean; thread: boolean } {
  if (screenInput) return { hour: false, thread: false };
  return { hour: scopes.includes("hour"), thread: scopes.includes("thread") };
}

/** The tool name the card shows. A tool from an MCP server reaches the agent under an opaque
 * alias (mcp__community__community_<hash>); its card summary names the server's own tool last
 * ("Custom MCP Desk (desk.example): computer_screenshot", community_mcp_bridge.approval_summary),
 * and that name is what the person knows. Anything else is shown as it is. */
export function toolDisplayName(tool: string, summary: string | null | undefined): string {
  if (!tool.startsWith("mcp__community__")) return tool;
  const at = (summary ?? "").lastIndexOf(": ");
  const name = at === -1 ? "" : (summary ?? "").slice(at + 2).trim();
  return name && !/\s/.test(name) ? name : tool;
}

/** "Allow all N" shows when more than one call waits. */
export function showAllowAll(total: number): boolean {
  return total > 1;
}

/** What the card says after "Allow all" left some calls for their own answer; null when it
 * left none (the card then goes away by itself). */
export function allowAllNote(result: { allowed: number; skipped: number } | null): { key: string; params?: Record<string, number> } | null {
  if (!result || result.skipped <= 0) return null;
  if (result.allowed <= 0) return { key: "approvalCard.allowAll.none" };
  return { key: "approvalCard.allowAll.partly", params: { count: result.allowed } };
}

/** What an "Allow all" left behind, kept with the calls that were waiting when it ran. */
export type AllowAllResult = { thread: number | null; ids: readonly string[]; answer: { allowed: number; skipped: number } };

/** The "Allow all" note for the card shown now: only in the same conversation, and only while that
 * card is one of the calls that were waiting when it ran. A later call (the earlier ones expired,
 * were stopped or answered elsewhere) never carries the old note. */
export function allowAllNoteFor(
  result: AllowAllResult | null,
  threadId: number | null,
  currentId: string | null,
): ReturnType<typeof allowAllNote> {
  if (!result || result.thread !== threadId || currentId === null || !result.ids.includes(currentId)) return null;
  return allowAllNote(result.answer);
}

/** The line on a decided card after a person allowed it for an hour or for this chat. */
export function reachNoteKey(scope: ApprovalScope | "always" | undefined): string | null {
  if (scope === "hour") return "approvalCard.hourHere";
  if (scope === "thread") return "approvalCard.chatHere";
  return null;
}

/** How a conversation allow reads in the rules list: whether it is tied to one exact call, and
 * how long it lasts. */
export function allowReach(rule: { command: string | null; expires_at: string | null }): {
  matchKey: string;
  reachKey: string;
} {
  return {
    matchKey: rule.command ? "approvals.exactly" : "approvalCard.rule.anyCall",
    reachKey: rule.expires_at ? "approvalCard.rule.until" : "approvalCard.rule.fromNow",
  };
}
