import assert from "node:assert/strict";
import { test } from "node:test";
import { EMPTY_DRAFT, changedInput, toDraft, toInput } from "./agent-draft.ts";

const agent = {
  id: 7, name: "Atlas", title: "Chief of staff", description: null, instructions: "Be brief.", provider: "claude",
  model: "opus", effort: "high", workspace_path: "/work", approval_mode: "ask", memory_enabled: true,
  fallback_provider: null, fallback_model: null, claude_account: null, connector_scopes: { gmail: "read" },
  connector_account_scopes: { gmail: ["acc1"] }, pinned: false, archived_at: null,
};

test("an untouched draft changes nothing", () => {
  const draft = toDraft(agent);
  assert.deepEqual(changedInput(draft, toDraft(agent)), {});
  assert.deepEqual(changedInput(draft, toDraft(agent), true), {});
});

test("only the edited fields are sent", () => {
  const original = toDraft(agent);
  const draft = { ...original, title: "  Head of staff ", effort: "low" };
  assert.deepEqual(changedInput(draft, original), { title: "Head of staff", effort: "low" });
});

test("admin-only and connector fields stay out unless changed", () => {
  const original = toDraft(agent);
  const out = changedInput({ ...original, name: "Atlas 2" }, original, false);
  assert.equal("workspace_path" in out, false);
  assert.equal("connector_scopes" in out, false);
  assert.equal("claude_account" in out, false);
});

test("key order in scopes does not count as a change", () => {
  const original = { ...toDraft(agent), connector_scopes: { gmail: "read", github: "write" } };
  const draft = { ...original, connector_scopes: { github: "write", gmail: "read" } };
  assert.deepEqual(changedInput(draft, original, true), {});
});

test("create input carries starter notes and no connector scopes", () => {
  const input = toInput({ ...EMPTY_DRAFT, name: " Scout ", starter_notes: "Hello" });
  assert.equal(input.name, "Scout");
  assert.equal(input.starter_notes, "Hello");
  assert.equal("connector_scopes" in input, false);
});

test("an engine change sends connector fields only from an admin device", () => {
  const original = toDraft(agent);
  const draft = { ...original, provider: "openai_compat" };
  const member = changedInput(draft, original, false);
  assert.equal(member.provider, "openai_compat");
  assert.equal("connector_scopes" in member, false);
  assert.equal("connector_account_scopes" in member, false);
  const admin = changedInput(draft, original, true);
  assert.equal(admin.connector_scopes, null);
  assert.deepEqual(admin.connector_account_scopes, {});
});

test("sampling is loaded, sent, and reset with null", () => {
  const original = toDraft({ ...agent, provider: "openai_compat", temperature: 0.4, top_p: null, max_output_tokens: 800 });
  assert.equal(original.temperature, 0.4);
  assert.equal(original.max_output_tokens, 800);
  assert.equal(toDraft(agent).temperature, null);
  assert.deepEqual(changedInput({ ...original, temperature: null, top_p: 0.9 }, original), { temperature: null, top_p: 0.9 });
  const created = toInput({ ...EMPTY_DRAFT, name: "New", temperature: 1 });
  assert.equal(created.temperature, 1);
  assert.equal(created.top_p, null);
});

test("an engine or model change carries effort and sampling, so the server keeps them", () => {
  const original = toDraft({ ...agent, provider: "openai_compat", model: "a", effort: "high", temperature: 0.4 });
  const modelOnly = changedInput({ ...original, model: "b" }, original);
  assert.deepEqual(modelOnly, { model: "b", effort: "high", temperature: 0.4, top_p: null, max_output_tokens: null });
  const engine = changedInput({ ...original, provider: "openrouter", model: null, temperature: null, effort: null }, original);
  assert.equal(engine.provider, "openrouter");
  assert.equal(engine.effort, null);
  assert.equal(engine.temperature, null);
  // Nothing about the engine changed: effort and sampling stay out.
  assert.deepEqual(changedInput({ ...original, name: "Atlas 2" }, original), { name: "Atlas 2" });
});
