import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { api } from "./api.ts";
import {
  aboutSentence,
  allowAllNote,
  allowAllNoteFor,
  allowReach,
  answeredElsewhere,
  builtInSentenceKey,
  elsewhereNote,
  extraAnswers,
  isConversationAllow,
  parseReach,
  parseRisk,
  parseScopes,
  reachNoteKey,
  riskTag,
  savedRules,
  scopeIsExact,
  showAllowAll,
  toolDisplayName,
} from "./approval-card.ts";
import { decidedPill } from "./chat-state.ts";
import { translate } from "./i18n.ts";
import { applyEvent, emptyTranscript, pendingApprovals } from "./transcript.ts";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

function respond(status, body) {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  };
  return calls;
}

test("the answers a card offers always start with once and keep only what the server names", () => {
  assert.deepEqual(parseScopes(["once", "hour", "thread"]), ["once", "hour", "thread"]);
  assert.deepEqual(parseScopes(["thread", "hour"]), ["once", "hour", "thread"]);
  assert.deepEqual(parseScopes(["forever", "hour"]), ["once", "hour"]);
  assert.deepEqual(parseScopes(undefined), ["once"]);
  assert.deepEqual(parseScopes("hour"), ["once"]);
});

test("risk and reach are read strictly", () => {
  assert.equal(parseRisk("read_only"), "read_only");
  assert.equal(parseRisk("destructive"), "destructive");
  assert.equal(parseRisk("dangerous"), null);
  assert.equal(parseRisk(null), null);
  assert.equal(parseReach("hour"), "hour");
  assert.equal(parseReach("thread"), "thread");
  assert.equal(parseReach("once"), null);
  assert.equal(parseReach(undefined), null);
});

test("the risk tag borrows the status colours, and an unknown risk has no tag", () => {
  assert.deepEqual(riskTag("read_only"), { tone: "done", key: "approvalCard.risk.readOnly" });
  assert.deepEqual(riskTag("changes"), { tone: "waiting", key: "approvalCard.risk.changes" });
  assert.deepEqual(riskTag("destructive"), { tone: "denied", key: "approvalCard.risk.destructive" });
  assert.equal(riskTag(null), null);
  assert.equal(riskTag(undefined), null);
});

test("built-in tools get the app's own translated sentence", () => {
  assert.equal(builtInSentenceKey("Bash"), "approvalCard.about.shell");
  assert.equal(builtInSentenceKey("Edit"), "approvalCard.about.write");
  assert.equal(builtInSentenceKey("mcp__computer__exec"), "approvalCard.about.computerShell");
  assert.equal(builtInSentenceKey("mcp__computer__click"), "approvalCard.about.screenInput");
  assert.equal(builtInSentenceKey("mcp__computer__browser_fill"), "approvalCard.about.browserInput");
  assert.equal(builtInSentenceKey("mcp__computer__native_type_text"), "approvalCard.about.nativeInput");
  assert.equal(builtInSentenceKey("mcp__community__community_abc"), null);
  // Every tool the server describes in its own words is translated here too.
  assert.equal(builtInSentenceKey("mcp__computer__screenshot"), "approvalCard.about.screenRead");
  assert.equal(builtInSentenceKey("mcp__computer__wait"), "approvalCard.about.screenRead");
  assert.equal(builtInSentenceKey("mcp__computer__browser_snapshot"), "approvalCard.about.browserRead");
  assert.equal(builtInSentenceKey("mcp__computer__browser_read"), "approvalCard.about.browserRead");
  assert.equal(builtInSentenceKey("mcp__computer__native_list_windows"), "approvalCard.about.nativeRead");
  assert.equal(builtInSentenceKey("acp:delete"), "approvalCard.about.acpDelete");
  assert.equal(builtInSentenceKey("acp:execute"), "approvalCard.about.shell");
  assert.equal(builtInSentenceKey("acp:fetch"), "approvalCard.about.web");
  assert.equal(builtInSentenceKey("acp:other"), null);
  assert.equal(translate("de", "approvalCard.about.acpDelete"), "Löscht Dateien im Ordner des Agenten.");
  assert.equal(translate("de", "approvalCard.about.shell").startsWith("Führt"), true);
});

test("the sentence: the app's own, else the server's, else the kind's, else nothing", () => {
  assert.deepEqual(aboutSentence("Write", "Creates or changes files in the agent's folder.", "file_write"), { key: "approvalCard.about.write" });
  assert.deepEqual(aboutSentence("mcp__community__community_x", "Take a screenshot of the desktop.", "other"), { text: "Take a screenshot of the desktop." });
  assert.deepEqual(aboutSentence("mcp__community__community_x", "  ", "command"), { key: "approval.effect.commandDesc" });
  assert.deepEqual(aboutSentence("acp:read", null, "file_read"), { key: "approvalCard.about.read" });
  assert.deepEqual(aboutSentence("acp:other", null, "file_read"), { key: "approval.effect.readDesc" });
  assert.equal(aboutSentence("mcp__community__community_x", null, "other"), null);
});

test("a scoped allow of a shell command is tied to that exact command", () => {
  assert.equal(scopeIsExact("Bash", "command"), true);
  assert.equal(scopeIsExact("mcp__computer__exec", "command"), true);
  assert.equal(scopeIsExact("mcp__community__community_x", "command"), true);
  assert.equal(scopeIsExact("Write", "file_write"), false);
});

test("the extra answers follow the server, and a screen tool never gets them", () => {
  assert.deepEqual(extraAnswers(["once", "hour", "thread"], false), { hour: true, thread: true });
  assert.deepEqual(extraAnswers(["once"], false), { hour: false, thread: false });
  assert.deepEqual(extraAnswers(["once", "hour", "thread"], true), { hour: false, thread: false });
});

test("a tool from an MCP server is named by the server's own name, never its alias", () => {
  const alias = "mcp__community__community_0123456789abcdef";
  assert.equal(toolDisplayName(alias, "Custom MCP Desk (desk.example): computer_screenshot"), "computer_screenshot");
  assert.equal(toolDisplayName(alias, "CRM: find_company"), "find_company");
  assert.equal(toolDisplayName(alias, "Custom MCP tool call (not a granted tool)"), alias);
  assert.equal(toolDisplayName(alias, "Odd: two words"), alias);
  assert.equal(toolDisplayName(alias, null), alias);
  assert.equal(toolDisplayName("Bash", "Something: else"), "Bash");
});

test("Allow all shows with two or more waiting, and says what it left for its own answer", () => {
  assert.equal(showAllowAll(1), false);
  assert.equal(showAllowAll(2), true);
  assert.equal(allowAllNote(null), null);
  assert.equal(allowAllNote({ allowed: 3, skipped: 0 }), null);
  assert.deepEqual(allowAllNote({ allowed: 2, skipped: 1 }), { key: "approvalCard.allowAll.partly", params: { count: 2 } });
  assert.deepEqual(allowAllNote({ allowed: 0, skipped: 2 }), { key: "approvalCard.allowAll.none" });
  assert.equal(translate("en", "approvalCard.allowAll", { count: 2 }), "Allow all 2");
});

test("the Allow all note stays on the cards it left, never on a later one", () => {
  const result = { thread: 4, ids: ["a1", "a2", "a3"], answer: { allowed: 2, skipped: 1 } };
  assert.deepEqual(allowAllNoteFor(result, 4, "a3"), { key: "approvalCard.allowAll.partly", params: { count: 2 } });
  assert.equal(allowAllNoteFor(result, 4, "b9"), null); // arrived later: the earlier ones were stopped
  assert.equal(allowAllNoteFor(result, 5, "a3"), null); // another conversation
  assert.equal(allowAllNoteFor(result, 4, null), null);
  assert.equal(allowAllNoteFor(null, 4, "a3"), null);
});

test("a decided card says how far a person's allow reached", () => {
  assert.equal(reachNoteKey("hour"), "approvalCard.hourHere");
  assert.equal(reachNoteKey("thread"), "approvalCard.chatHere");
  assert.equal(reachNoteKey("always"), null);
  assert.equal(reachNoteKey(undefined), null);
  assert.deepEqual(decidedPill("allowed", "", "hour"), { tone: "done", key: "approvalCard.pill.allowedHour" });
  assert.deepEqual(decidedPill("allowed", "", "thread"), { tone: "done", key: "approvalCard.pill.allowedChat" });
  assert.deepEqual(decidedPill("allowed", "scoped_rule", "thread"), { tone: "done", key: "approvalCard.pill.byChatAllow" });
  assert.deepEqual(decidedPill("allowed", "", null), { tone: "done", key: "approval.pill.allowedOnce" });
  assert.deepEqual(decidedPill("denied", "", "hour"), { tone: "denied", key: "approval.denied" });
});

const savedRule = { id: 1, match: "exact", command: "ls -la", workspace: "/work", created_at: "x" };
const hourAllow = { id: 2, scope: "hour", match: null, command: null, workspace: null, created_at: "x", tool: "Write", label: "notes.txt", thread_id: 4, expires_at: "2026-01-01T10:00:00Z" };
const chatAllow = { id: 3, scope: "thread", match: "exact", command: "ls", workspace: null, created_at: "x", tool: "Bash", label: "ls", thread_id: 4, expires_at: null };

test("conversation allows are told apart from saved rules and read in the rules list", () => {
  assert.equal(isConversationAllow(savedRule), false);
  assert.equal(isConversationAllow({ ...savedRule, scope: "always" }), false);
  assert.equal(isConversationAllow(hourAllow), true);
  assert.deepEqual(savedRules([savedRule, hourAllow, chatAllow]), [savedRule]);
  assert.deepEqual(allowReach(hourAllow), { matchKey: "approvalCard.rule.anyCall", reachKey: "approvalCard.rule.until" });
  assert.deepEqual(allowReach(chatAllow), { matchKey: "approvals.exactly", reachKey: "approvalCard.rule.fromNow" });
});

test("the transcript keeps what the card says about the tool and how far an allow reached", () => {
  let t = emptyTranscript();
  const at = (seq, type, data) => ({ id: seq, seq, thread_id: 1, turn_id: 9, type, data, created_at: "2026-01-01T00:00:00Z" });
  t = applyEvent(t, at(1, "turn.started", { prompt_text: "go" }));
  t = applyEvent(t, at(2, "approval.requested", {
    approval_id: "a1", tool: "mcp__community__community_x", kind: "other", summary: "Custom MCP Desk (desk.example): screenshot",
    input: {}, tool_summary: "Take a screenshot of the desktop.", risk: "read_only", scopes: ["once", "hour", "thread"],
  }));
  t = applyEvent(t, at(3, "approval.requested", { approval_id: "a2", tool: "Bash", kind: "command", summary: "ls", input: { command: "ls" } }));
  const [first, second] = pendingApprovals(t);
  assert.deepEqual([first.toolSummary, first.risk, first.scopes], ["Take a screenshot of the desktop.", "read_only", ["once", "hour", "thread"]]);
  assert.deepEqual([second.toolSummary, second.risk, second.scopes], [null, null, ["once"]]);  // an older server
  t = applyEvent(t, at(4, "approval.resolved", { approval_id: "a1", status: "allowed", scope: "hour" }));
  t = applyEvent(t, at(5, "approval.resolved", { approval_id: "a2", status: "allowed", by: "scoped_rule", rule_id: 5, scope: "thread" }));
  const decided = t.items.filter((i) => i.kind === "approval");
  assert.deepEqual(decided.map((i) => [i.status, i.resolvedBy, i.reach, i.ruleId]), [
    ["allowed", "", "hour", null],
    ["allowed", "scoped_rule", "thread", 5],
  ]);
});

test("an answer sends scope only when it reaches further than once", async () => {
  let calls = respond(200, { status: "recorded", decision: "allow", scope_rule_id: 4, scope_expires_at: "2026-01-01T10:00:00Z" });
  const answer = await api.answerThreadApproval(3, "a1", "allow", false, "hour");
  assert.equal(answer.scope_rule_id, 4);
  assert.deepEqual(JSON.parse(calls[0].options.body), { decision: "allow", scope: "hour" });
  calls = respond(200, { status: "recorded", decision: "allow" });
  await api.answerThreadApproval(3, "a1", "allow", false, "once");
  assert.deepEqual(JSON.parse(calls[0].options.body), { decision: "allow" });
});

test("allow all posts to the conversation's own route, naming the calls the card counted", async () => {
  const calls = respond(200, { allowed: 2, skipped: 1 });
  assert.deepEqual(await api.allowAllThreadApprovals(7, ["a1", "a2"]), { allowed: 2, skipped: 1 });
  assert.match(calls[0].url, /\/threads\/7\/approvals\/allow-all$/);
  assert.equal(calls[0].options.method, "POST");
  assert.deepEqual(JSON.parse(calls[0].options.body), { approval_ids: ["a1", "a2"] });
});

test("the rules list can be asked for one conversation", async () => {
  let calls = respond(200, []);
  await api.listApprovalRules("/work/my repo", 4);
  assert.match(calls[0].url, /\/approval-rules\?workspace=%2Fwork%2Fmy%20repo&thread_id=4$/);
  calls = respond(200, []);
  await api.listApprovalRules(null, 4);
  assert.match(calls[0].url, /\/approval-rules\?thread_id=4$/);
});

test("every approval card string exists in every language", () => {
  for (const locale of ["de", "es", "fr", "it", "ja", "ko", "nl", "pl", "pt", "ru", "tr", "zh"]) {
    for (const key of ["approvalCard.allowHour", "approvalCard.allowChat", "approvalCard.risk.destructive", "approvalCard.rulesExplanation"]) {
      assert.notEqual(translate(locale, key), translate("en", key), `${locale} ${key}`);
    }
  }
  for (const locale of ["en", "de", "ja"]) {
    assert.equal(translate(locale, "approvalCard.allowAll", { count: 3 }).includes("3"), true);
  }
});

test("a call answered on another device while the page watched is named, once", () => {
  const since = Date.parse("2026-11-17T10:00:00Z");
  const item = (approvalId, overrides = {}) => ({ approvalId, status: "allowed", resolvedBy: "", resolvedAt: "2026-11-17T10:05:00Z", resolvedPerson: "Luke", ...overrides });
  // Answered before the page opened the conversation: history, not news.
  assert.equal(answeredElsewhere([item("a", { resolvedAt: "2026-11-17T09:00:00Z" })], since, new Set()), null);
  // Answered from this page.
  assert.equal(answeredElsewhere([item("a")], since, new Set(["a"])), null);
  // Not a person: a saved rule, an allow for this chat, the app.
  assert.equal(answeredElsewhere([item("a", { resolvedBy: "saved_rule" })], since, new Set()), null);
  assert.equal(answeredElsewhere([item("a", { resolvedBy: "scoped_rule" })], since, new Set()), null);
  // Still waiting, expired or cancelled: nobody answered it.
  assert.equal(answeredElsewhere([item("a", { status: "pending" }), item("b", { status: "expired" }), item("c", { status: "cancelled" })], since, new Set()), null);
  // No time: unknown, so nothing is said.
  assert.equal(answeredElsewhere([item("a", { resolvedAt: undefined })], since, new Set()), null);
  // The last decided call is the one that counts: a later one answered here ends the note.
  assert.equal(answeredElsewhere([item("a"), item("b", { status: "denied" })], since, new Set())?.approvalId, "b");
  assert.equal(answeredElsewhere([item("a"), item("b")], since, new Set(["b"])), null);
  // One still waiting after it does not hide it (the card shows the waiting one first).
  assert.equal(answeredElsewhere([item("a"), item("b", { status: "pending" })], since, new Set())?.approvalId, "a");
});

test("the note names who answered and how, or only where", () => {
  assert.deepEqual(elsewhereNote({ status: "allowed", resolvedPerson: "Luke" }), { key: "chatPage.elsewhere.allowedBy", params: { name: "Luke" } });
  assert.deepEqual(elsewhereNote({ status: "denied", resolvedPerson: "Luke" }), { key: "chatPage.elsewhere.deniedBy", params: { name: "Luke" } });
  assert.deepEqual(elsewhereNote({ status: "allowed" }), { key: "chatPage.elsewhere.allowed" });
  assert.deepEqual(elsewhereNote({ status: "denied", resolvedPerson: " " }), { key: "chatPage.elsewhere.denied" });
});
