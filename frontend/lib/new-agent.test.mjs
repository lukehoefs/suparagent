import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PURPOSE_MAX,
  approvalChoices,
  blueprintSeed,
  engineModelText,
  fitApprovalMode,
  followUpPlan,
  formKey,
  grantsFor,
  isNameTaken,
  normalizePicks,
  pickCount,
  runOutcome,
  soulFromPurpose,
  supportsToolGrants,
  utf8Bytes,
  withAgentInClient,
} from "./new-agent.ts";

const engines = [
  { id: "claude", label: "Claude", default_model: "opus", models: [{ id: "opus", label: "Opus" }, { id: "sonnet", label: "Sonnet" }] },
  { id: "local", label: "Local", default_model: null, models: [] },
];

test("a blueprint fills a unique name, its category as the role and its job", () => {
  const seed = blueprintSeed({ name: "Deep Researcher", category: "Research", job: "Researches a question." }, ["deep researcher", "Atlas"]);
  assert.deepEqual(seed, { name: "Deep Researcher 2", title: "Research", purpose: "Researches a question." });
  assert.deepEqual(blueprintSeed(null, []), { name: "", title: "", purpose: "" });
});

test("the soul draft is empty for empty text and keeps the starter's headings", () => {
  assert.equal(soulFromPurpose("Atlas", "   "), null);
  assert.equal(soulFromPurpose(" Atlas ", " Finds leads. "), "# Soul of Atlas\n\n## Role\nFinds leads.\n");
});

test("the longest purpose still fits the 24 KiB soul limit", () => {
  const soul = soulFromPurpose("界".repeat(80), "界".repeat(PURPOSE_MAX));
  assert.ok(utf8Bytes(soul) <= 24 * 1024);
});

test("the engine line names the chosen model, else the engine default", () => {
  assert.equal(engineModelText(engines, "claude", "sonnet"), "Claude · Sonnet");
  assert.equal(engineModelText(engines, "claude", null), "Claude · Opus");
  assert.equal(engineModelText(engines, "claude", "custom-1"), "Claude · custom-1");
  assert.equal(engineModelText(engines, "local", null), "Local");
  assert.equal(engineModelText(null, "codex", null), "codex");
});

test("a device without admin rights is never offered accept edits or full access", () => {
  assert.deepEqual(approvalChoices("claude", true), ["ask", "accept_edits", "approve_for_me", "plan", "full_access"]);
  assert.deepEqual(approvalChoices("claude", false), ["ask", "approve_for_me", "plan"]);
  assert.deepEqual(approvalChoices("openrouter", true), ["ask", "accept_edits", "plan", "full_access"]);
  assert.equal(fitApprovalMode("approve_for_me", "openrouter", true), "ask");
  assert.equal(fitApprovalMode("plan", "openrouter", false), "plan");
  // Full access is offered on every engine to the owner, and never kept for a device.
  assert.equal(fitApprovalMode("full_access", "gemini", true), "full_access");
  assert.equal(fitApprovalMode("full_access", "claude", false), "ask");
});

test("only the tool engines take MCP grants", () => {
  assert.equal(supportsToolGrants("openai_compat"), true);
  assert.equal(supportsToolGrants("gemini"), false);
});

test("the agent joins one client and every other client is kept", () => {
  const clients = [{ id: "a", name: "A", agent_ids: [1] }, { id: "b", name: "B", agent_ids: [] }];
  assert.deepEqual(withAgentInClient(clients, "b", 7), [clients[0], { id: "b", name: "B", agent_ids: [7] }]);
  assert.deepEqual(withAgentInClient(clients, "a", 1), clients);
  assert.equal(withAgentInClient(clients, "gone", 7), null);
});

test("grants use the current digests and report picks that are gone", () => {
  const out = grantsFor(["b", "a", "a", "x"], [{ name: "a", schema_digest: "1" }, { name: "b", schema_digest: "2" }]);
  assert.deepEqual(out, { grants: [{ name: "a", schema_digest: "1" }, { name: "b", schema_digest: "2" }], missing: ["x"] });
});

test("grants the agent already has are sent again, and gone ones are dropped quietly", () => {
  const out = grantsFor(["a"], [{ name: "a", schema_digest: "1" }, { name: "k", schema_digest: "9" }], ["k", "old"]);
  assert.deepEqual(out, { grants: [{ name: "a", schema_digest: "1" }, { name: "k", schema_digest: "9" }], missing: [] });
});

test("picks are normalized and counted", () => {
  assert.deepEqual(normalizePicks({ s2: ["b", "a"], s1: [], s3: ["c", "c"] }), { s2: ["a", "b"], s3: ["c"] });
  assert.equal(pickCount({ s2: ["b", "a"], s1: [] }), 2);
});

const base = {
  admin: true, provider: "claude", name: "Atlas", purpose: "", scopes: {}, accountScopes: {}, picks: {}, servers: [],
  clientId: "", clients: [], template: null, skillChoices: [],
};

test("nothing follows a bare create", () => {
  assert.deepEqual(followUpPlan(base), []);
});

test("the follow-ups run in order: apps, tools, soul, client, skills", () => {
  const skill = { name: "csv-check", description: "Checks", body: "..." };
  const plan = followUpPlan({
    ...base,
    purpose: "Finds leads.",
    scopes: { gmail: "read" },
    accountScopes: { gmail: ["acc"] },
    picks: { s1: ["web_search"], s2: [] },
    servers: [{ id: "s1", name: "Search" }, { id: "s2", name: "Empty" }],
    clientId: "c1",
    clients: [{ id: "c1", name: "PFNZ" }],
    template: { id: "work-numbers", skills: [skill, { ...skill, name: "other" }] },
    skillChoices: ["csv-check"],
  });
  assert.deepEqual(plan.map((item) => item.key), ["apps", "tools:s1", "soul", "client", "skills"]);
  assert.deepEqual(plan[0], { kind: "apps", key: "apps", scopes: { gmail: "read" }, accountScopes: { gmail: ["acc"] } });
  assert.deepEqual(plan[1].tools, ["web_search"]);
  assert.equal(plan[4].skills.length, 1);
});

test("owner-only follow-ups are never planned for a member device", () => {
  const plan = followUpPlan({
    ...base, admin: false, purpose: "x", scopes: { gmail: "read" }, picks: { s1: ["t"] }, servers: [{ id: "s1", name: "S" }],
    clientId: "c1", clients: [{ id: "c1", name: "C" }],
    template: { id: "work-numbers", skills: [{ name: "csv-check", description: "Checks", body: "..." }] }, skillChoices: ["csv-check"],
  });
  assert.deepEqual(plan, []);
});

test("apps and tools are dropped for an engine that cannot use them", () => {
  const plan = followUpPlan({ ...base, provider: "gemini", scopes: { gmail: "read" }, picks: { s1: ["t"] }, servers: [{ id: "s1", name: "S" }] });
  assert.deepEqual(plan, []);
});

test("the run outcome waits for every step", () => {
  const plan = [{ key: "a" }, { key: "b" }];
  assert.equal(runOutcome(plan, { a: { status: "done", error: null } }), "running");
  assert.equal(runOutcome(plan, { a: { status: "done", error: null }, b: { status: "failed", error: "x" } }), "partial");
  assert.equal(runOutcome(plan, { a: { status: "done", error: null }, b: { status: "done", error: null } }), "done");
  assert.equal(runOutcome([], {}), "done");
});

test("a taken name is recognised from the error code", () => {
  assert.equal(isNameTaken({ status: 409, code: "agent_name_taken" }), true);
  assert.equal(isNameTaken(new Error("x")), false);
  assert.equal(isNameTaken(null), false);
});

test("the form key ignores object key order", () => {
  assert.equal(formKey({ a: 1, b: { d: 2, c: 3 } }), formKey({ b: { c: 3, d: 2 }, a: 1 }));
  assert.notEqual(formKey({ a: 1 }), formKey({ a: 2 }));
});
