// How a row of the approvals rules list reads (components/approvals/ApprovalRules.tsx): one plain
// sentence saying what the rule lets through and where, with the full command shown on request.
// Pure, so node tests can load it. Keys are i18n message keys (lib/locales/approval-rules-extra.ts).
import type { ListedRule } from "./api";
import { isConversationAllow } from "./approval-card.ts";

// A command longer than this is cut in the sentence; the full text is under "Show command".
export const SUMMARY_COMMAND_MAX = 48;

// The command on one line, cut with an ellipsis when it is long.
export function shortCommand(command: string, max = SUMMARY_COMMAND_MAX): string {
  const line = command.replace(/\s+/g, " ").trim();
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
}

// The last part of a folder path ("suparagent" for C:\code\suparagent or /home/me/suparagent/).
export function folderName(path: string): string {
  const parts = path.replace(/[\\/]+$/, "").split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

export type RuleSummary = {
  key: string;
  // {command} and {tool} are left to the caller, which shows the command in monospace.
  params: { folder?: string; time?: string; tool?: string };
  // The command the sentence names, cut to fit; null for an allow that covers a whole tool.
  command: string | null;
};

// The sentence for a rule. A saved rule: always allow this command (or commands starting with
// it) in one folder or every folder. An allow given on a request: this command, or every call of
// a tool, in this chat, for an hour or from now on. `time` formats when an hour-long allow ends.
export function ruleSummary(rule: ListedRule, time: (iso: string) => string): RuleSummary {
  if (isConversationAllow(rule)) {
    const span = rule.expires_at ? "hour" : "thread";
    if (rule.command) {
      return { key: `approvalRules.summary.${span}Command`, params: rule.expires_at ? { time: time(rule.expires_at) } : {}, command: shortCommand(rule.command) };
    }
    return {
      key: `approvalRules.summary.${span}Tool`,
      params: { tool: rule.label ?? rule.tool, ...(rule.expires_at ? { time: time(rule.expires_at) } : {}) },
      command: null,
    };
  }
  const how = rule.match === "prefix" ? "prefix" : "exact";
  return rule.workspace
    ? { key: `approvalRules.summary.${how}Folder`, params: { folder: folderName(rule.workspace) }, command: shortCommand(rule.command) }
    : { key: `approvalRules.summary.${how}Everywhere`, params: {}, command: shortCommand(rule.command) };
}
