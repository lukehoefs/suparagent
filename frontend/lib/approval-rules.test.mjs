import assert from "node:assert/strict";
import { test } from "node:test";
import { folderName, ruleSummary, shortCommand, SUMMARY_COMMAND_MAX } from "./approval-rules.ts";
import { en } from "./i18n.ts";

const time = () => "14:30";
const saved = (patch = {}) => ({ id: 1, match: "exact", command: "git status", workspace: null, created_at: "2026-11-19T10:00:00Z", ...patch });
const allow = (patch = {}) => ({
  id: 2, scope: "hour", match: "exact", command: "npm test", workspace: null, created_at: "2026-11-19T10:00:00Z",
  tool: "Bash", label: null, thread_id: 9, expires_at: "2026-11-19T11:00:00Z", ...patch,
});

test("a saved rule reads as always allowing its command, here or everywhere", () => {
  assert.deepEqual(ruleSummary(saved(), time), { key: "approvalRules.summary.exactEverywhere", params: {}, command: "git status" });
  assert.deepEqual(ruleSummary(saved({ workspace: "C:\\code\\suparagent\\" }), time), {
    key: "approvalRules.summary.exactFolder", params: { folder: "suparagent" }, command: "git status",
  });
  assert.equal(ruleSummary(saved({ match: "prefix", workspace: "/home/me/site" }), time).key, "approvalRules.summary.prefixFolder");
  assert.equal(ruleSummary(saved({ match: "prefix" }), time).key, "approvalRules.summary.prefixEverywhere");
});

test("an allow given on a request reads as this chat, for an hour or from now on", () => {
  assert.deepEqual(ruleSummary(allow(), time), { key: "approvalRules.summary.hourCommand", params: { time: "14:30" }, command: "npm test" });
  assert.deepEqual(ruleSummary(allow({ scope: "thread", expires_at: null }), time), { key: "approvalRules.summary.threadCommand", params: {}, command: "npm test" });
  assert.deepEqual(ruleSummary(allow({ command: null, match: null, label: "Edit files" }), time), {
    key: "approvalRules.summary.hourTool", params: { tool: "Edit files", time: "14:30" }, command: null,
  });
  assert.deepEqual(ruleSummary(allow({ command: null, match: null, scope: "thread", expires_at: null }), time), {
    key: "approvalRules.summary.threadTool", params: { tool: "Bash" }, command: null,
  });
});

test("a long command is cut to one short line, and a folder to its last part", () => {
  assert.equal(shortCommand("git   status\n--short"), "git status --short");
  const long = shortCommand("x".repeat(200));
  assert.equal(long.length, SUMMARY_COMMAND_MAX);
  assert.ok(long.endsWith("…"));
  assert.equal(folderName("/"), "/");
  assert.equal(folderName("/srv/app"), "app");
});

test("every summary key exists in English", () => {
  for (const key of ["exactFolder", "exactEverywhere", "prefixFolder", "prefixEverywhere", "hourCommand", "hourTool", "threadCommand", "threadTool"]) {
    assert.ok(`approvalRules.summary.${key}` in en, key);
  }
});
