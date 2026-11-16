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
  assert.deepEqual(changedInput(draft, original), {});
});

test("create input carries starter notes and no connector scopes", () => {
  const input = toInput({ ...EMPTY_DRAFT, name: " Scout ", starter_notes: "Hello" });
  assert.equal(input.name, "Scout");
  assert.equal(input.starter_notes, "Hello");
  assert.equal("connector_scopes" in input, false);
});
