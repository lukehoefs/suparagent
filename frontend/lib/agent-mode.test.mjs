import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  AGENT_MODES,
  mayManageAgents,
  modeChange,
  modeHint,
  modeLabel,
  modeLine,
  modeOf,
  modeSubtitle,
  STYLE_MAX_CHARS,
  styleLength,
  styleToSend,
  styleTooLong,
  withMode,
} from "./agent-mode.ts";
import { EMPTY_DRAFT, changedInput, toDraft, toInput } from "./agent-draft.ts";
import { shownValue } from "./agent-profile-extras.ts";
import { agentModeMessages } from "./locales/agent-mode-extra.ts";
import { translate, LOCALES } from "./i18n.ts";

const t = (key, vars) => translate("en", key, vars);
const agent = (over = {}) => ({
  id: 3, name: "Atlas", instructions: "", provider: "claude", model: null, workspace_path: null,
  approval_mode: "ask", archived_at: null, ...over,
});

test("an agent without the field, or with it off, works in Task mode", () => {
  assert.equal(modeOf(agent()), "task");
  assert.equal(modeOf(agent({ conversational_mode: false })), "task");
  assert.equal(modeOf(agent({ conversational_mode: true })), "conversational");
  assert.equal(modeOf(null), "task");
  assert.deepEqual([...AGENT_MODES], ["task", "conversational"]);
});

test("a switch sends only the mode", () => {
  assert.deepEqual(modeChange("conversational"), { conversational_mode: true });
  assert.deepEqual(modeChange("task"), { conversational_mode: false });
  const before = agent({ conversational_style: "Brief." });
  const after = withMode(before, "conversational");
  assert.equal(after.conversational_mode, true);
  assert.equal(after.conversational_style, "Brief.");
  assert.equal(before.conversational_mode, undefined, "the agent passed in is not changed");
});

test("the labels, hints, header subtitle and line use the design's words", () => {
  assert.equal(modeLabel(t, "task"), "Task");
  assert.equal(modeLabel(t, "conversational"), "Conversational");
  assert.equal(modeHint(t, "task"), "Works quietly and returns results");
  assert.equal(modeHint(t, "conversational"), "Talks through the plan and asks before major tool calls");
  assert.equal(modeSubtitle(t, agent({ conversational_mode: true })), "Conversational partner");
  assert.equal(modeSubtitle(t, agent()), "Works quietly");
  assert.equal(
    modeLine(t, agent({ conversational_mode: true })),
    "Conversational: Atlas talks through the plan and asks a question or two before major tool calls.",
  );
  assert.equal(modeLine(t, agent()), "Task: Atlas works quietly and reports back when done.");
});

test("every locale has every mode string, with the same placeholders, and none in square brackets", () => {
  assert.deepEqual(Object.keys(agentModeMessages).sort(), [...LOCALES].sort());
  const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
  for (const locale of LOCALES) {
    const table = agentModeMessages[locale];
    assert.deepEqual(Object.keys(table).sort(), Object.keys(agentModeMessages.en).sort(), locale);
    for (const [key, text] of Object.entries(table)) {
      assert.ok(text.trim().length > 0, `${locale} ${key}`);
      assert.doesNotMatch(text, /\[[^\]]*\]/, `${locale} ${key}`);
      assert.deepEqual(placeholders(text), placeholders(agentModeMessages.en[key]), `${locale} ${key}`);
    }
    if (locale !== "en") {
      assert.notEqual(table["agentMode.taskLine"], agentModeMessages.en["agentMode.taskLine"], `${locale} is translated`);
    }
  }
  assert.equal(translate("de", "agentMode.task"), "Aufgabe");
});

test("who may switch: admin, or a manage session with the agents permission", () => {
  assert.equal(mayManageAgents(null), true);
  assert.equal(mayManageAgents({ scopes: ["admin"], permissions: null }), true);
  assert.equal(mayManageAgents({ scopes: ["chat", "manage"], permissions: null }), true);
  assert.equal(mayManageAgents({ scopes: ["chat", "manage"], permissions: ["chat", "agents"] }), true);
  assert.equal(mayManageAgents({ scopes: ["chat", "manage"], permissions: ["chat"] }), false);
  assert.equal(mayManageAgents({ scopes: ["chat"], permissions: null }), false);
  assert.equal(mayManageAgents({ scopes: ["chat", "files"], permissions: ["agents"] }), false);
});

test("the style is counted like the backend counts it and sent trimmed", () => {
  assert.equal(STYLE_MAX_CHARS, 500);
  assert.equal(styleLength("  hi  "), 2);
  assert.equal(styleLength("👋👋"), 2);
  assert.equal(styleTooLong("x".repeat(500)), false);
  assert.equal(styleTooLong(` ${"x".repeat(500)} `), false);
  assert.equal(styleTooLong("x".repeat(501)), true);
  assert.equal(styleToSend("  Brief.  "), "Brief.");
  assert.equal(styleToSend("   "), null);
});

test("the backend's limit is the same", () => {
  const source = readFileSync(new URL("../../backend/app/schemas/agent.py", import.meta.url), "utf8");
  assert.match(source, new RegExp(`^CONVERSATIONAL_STYLE_MAX_CHARS = ${STYLE_MAX_CHARS}$`, "m"));
});

test("the profile form loads, compares and sends the mode and the style", () => {
  assert.equal(EMPTY_DRAFT.conversational_mode, false);
  assert.equal(EMPTY_DRAFT.conversational_style, "");
  const original = toDraft(agent({ conversational_mode: true, conversational_style: "Warm." }));
  assert.equal(original.conversational_mode, true);
  assert.equal(original.conversational_style, "Warm.");
  assert.deepEqual(changedInput(original, original), {});
  assert.deepEqual(changedInput({ ...original, conversational_mode: false }, original), { conversational_mode: false });
  assert.deepEqual(changedInput({ ...original, conversational_style: "  " }, original), { conversational_style: null });
  assert.deepEqual(changedInput({ ...original, conversational_style: " Warm. " }, original), {});
  // An older backend without the fields reads as Task with no style, and a create sends them.
  const old = toDraft(agent());
  assert.equal(old.conversational_mode, false);
  assert.equal(old.conversational_style, "");
  const created = toInput({ ...EMPTY_DRAFT, name: "New", conversational_mode: true, conversational_style: "Brief." });
  assert.equal(created.conversational_mode, true);
  assert.equal(created.conversational_style, "Brief.");
});

test("a stored version shows the mode by name and the style as text", () => {
  assert.deepEqual(shownValue("conversational_mode", true), { kind: "mode", mode: "conversational" });
  assert.deepEqual(shownValue("conversational_mode", false), { kind: "mode", mode: "task" });
  assert.deepEqual(shownValue("conversational_mode", null), { kind: "empty" });
  assert.deepEqual(shownValue("conversational_style", null), { kind: "empty" });
  assert.deepEqual(shownValue("conversational_style", "Brief."), { kind: "long", text: "Brief." });
});
