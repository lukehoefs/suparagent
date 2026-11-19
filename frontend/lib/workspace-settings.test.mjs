import assert from "node:assert/strict";
import { test } from "node:test";
import { en } from "./i18n.ts";
import { SETTINGS_PAGES } from "./settings-nav.ts";
import {
  accessForChoice,
  auditKey,
  canManageMember,
  defaultEngineOptions,
  defaultEngineValue,
  effortLabelKey,
  engineActionKey,
  engineKey,
  engineStatus,
  engineSubline,
  memberDetail,
  memberInitial,
  parseDefaultEngineValue,
  roleChoiceOf,
  roleChoices,
  roleMenuStep,
  roleMenuValue,
  sortMembers,
  startingPermissions,
  workspaceNameSavable,
} from "./workspace-settings.ts";

const person = (over = {}) => ({
  id: 1, display_name: "Sam", role: "member", permissions: ["chat", "files", "approve", "agents"],
  email: null, joined_at: "2026-11-01T10:00:00Z", last_login_at: null, is_you: false, ...over,
});

test("a workspace name is saved only when it is new, not blank and within 80 characters", () => {
  assert.equal(workspaceNameSavable("LH Tech", "My team"), true);
  assert.equal(workspaceNameSavable("  My team ", "My team"), false);
  assert.equal(workspaceNameSavable("   ", "My team"), false);
  assert.equal(workspaceNameSavable("x".repeat(80), null), true);
  assert.equal(workspaceNameSavable("x".repeat(81), null), false);
});

test("members are listed owner first, then admins, members and viewers, by name", () => {
  const sorted = sortMembers([
    person({ id: 1, display_name: "Zoe", role: "viewer" }),
    person({ id: 2, display_name: "Bob", role: "member" }),
    person({ id: 3, display_name: "Luke", role: "owner" }),
    person({ id: 4, display_name: "Ann", role: "member" }),
    person({ id: 5, display_name: "Max", role: "admin" }),
  ]);
  assert.deepEqual(sorted.map((p) => p.display_name), ["Luke", "Max", "Ann", "Bob", "Zoe"]);
});

test("the avatar letter is the first letter or digit, upper case", () => {
  assert.equal(memberInitial("luke"), "L");
  assert.equal(memberInitial("  émile"), "É");
  assert.equal(memberInitial("(42) ops"), "4");
  assert.equal(memberInitial("…"), "");
});

test("an admin manages members and viewers, only the owner manages admins, nobody the owner or themselves", () => {
  const admin = { admin: true, owner: false };
  const owner = { admin: true, owner: true };
  const member = { admin: false, owner: false };
  assert.equal(canManageMember(admin, person({ role: "member" })), true);
  assert.equal(canManageMember(admin, person({ role: "viewer" })), true);
  assert.equal(canManageMember(admin, person({ role: "admin" })), false);
  assert.equal(canManageMember(owner, person({ role: "admin" })), true);
  assert.equal(canManageMember(owner, person({ role: "owner" })), false);
  assert.equal(canManageMember(owner, person({ role: "member", is_you: true })), false);
  assert.equal(canManageMember(member, person({ role: "viewer" })), false);
});

test("the role menu maps the design's roles onto the four real ones; admin is the owner's to give", () => {
  assert.deepEqual(roleChoices({ admin: true, owner: true }), ["admin", "member", "reply", "viewer", "custom"]);
  assert.deepEqual(roleChoices({ admin: true, owner: false }), ["member", "reply", "viewer", "custom"]);
  // An admin's own row keeps its value in the menu (the owner is the one who may change it).
  assert.deepEqual(roleChoices({ admin: true, owner: false }, { role: "admin", permissions: [] }), ["admin", "member", "reply", "viewer", "custom"]);
  assert.equal(roleChoiceOf("owner", []), "admin");
  assert.equal(roleChoiceOf("viewer", []), "viewer");
  assert.equal(roleChoiceOf("member", ["chat", "files", "approve", "agents"]), "member");
  assert.equal(roleChoiceOf("member", ["chat"]), "reply");
  assert.equal(roleChoiceOf("member", ["chat", "files"]), "custom");
});

test("the role menu shows Custom while the custom list is open, and picking the same entry saves nothing", () => {
  assert.equal(roleMenuValue("member", false), "member");
  assert.equal(roleMenuValue("member", true), "custom");
  assert.equal(roleMenuValue("custom", false), "custom");
  // Custom opens the list, and picking it again keeps what was ticked.
  assert.equal(roleMenuStep("member", "custom", false), "edit");
  assert.equal(roleMenuStep("member", "custom", true), "keep");
  // The saved preset again: nothing to save, and an open list closes (back to the real role).
  assert.equal(roleMenuStep("member", "member", false), "none");
  assert.equal(roleMenuStep("member", "member", true), "close");
  assert.equal(roleMenuStep("member", "viewer", true), "change");
  assert.equal(roleMenuStep("custom", "reply", false), "change");
});

test("a preset becomes the PATCH /people body; custom needs the list", () => {
  assert.deepEqual(accessForChoice("admin"), { role: "admin" });
  assert.deepEqual(accessForChoice("viewer"), { role: "viewer" });
  assert.deepEqual(accessForChoice("member"), { role: "member", permissions: ["chat", "files", "approve", "agents"] });
  assert.deepEqual(accessForChoice("reply"), { role: "member", permissions: ["chat"] });
  assert.equal(accessForChoice("custom"), null);
  assert.deepEqual(startingPermissions("member", ["chat"]), ["chat"]);
  assert.deepEqual(startingPermissions("viewer", []), ["chat", "files", "approve", "agents"]);
});

test("a member's second line shows the address and sign-in time only when the server sent them", () => {
  const date = (iso) => iso.slice(0, 10);
  assert.deepEqual(memberDetail(person(), date), [{ key: "members.joined", params: { date: "2026-11-01" } }]);
  assert.deepEqual(memberDetail(person({ email: "sam@example.com", last_login_at: "2026-11-15T08:00:00Z" }), date).map((part) => part.key),
    ["members.detailEmail", "members.joined", "members.lastSignIn"]);
});

test("your own row says you are signed in now, without the address or dates", () => {
  const date = (iso) => iso.slice(0, 10);
  const mine = memberDetail(person({ is_you: true, email: "sam@example.com", last_login_at: "2026-11-15T08:00:00Z" }), date);
  assert.deepEqual(mine, [{ key: "members.signedInNow" }]);
  assert.ok("members.signedInNow" in en);
});

test("every history action the backend records has words; an unknown one has none", () => {
  for (const action of ["invite.created", "invite.revoked", "member.joined", "member.role_changed", "member.permissions_changed", "member.removed", "member.password_changed", "owner.credentials_set", "ownership.transferred"]) {
    const key = auditKey(action);
    assert.ok(key && key in en, action);
  }
  assert.equal(auditKey("something.new"), null);
});

const engine = (over = {}) => ({
  id: "openrouter", label: "OpenRouter", available: false, version: null, reason: "Add an API key.", signed_in: null,
  configurable: true, config: null, config_fields: [{ name: "api_key", kind: "secret" }, { name: "model" }],
  models: [{ id: "a/b", label: "Model B" }], default_model: null, limit: null, ...over,
});

test("an engine that takes a key says whether one is saved, never what it is", () => {
  assert.deepEqual(engineKey(engine()), { takesKey: true, saved: false });
  assert.deepEqual(engineKey(engine({ config: { has_api_key: true, model: "a/b" } })), { takesKey: true, saved: true });
  assert.deepEqual(engineKey(engine({ id: "claude", configurable: false, config_fields: [] })), { takesKey: false, saved: false });
});

test("each engine row has a status word and colour, and one next step", () => {
  assert.deepEqual(engineStatus(engine()), { status: "waiting", key: "enginesPage.status.needsSetup" });
  assert.deepEqual(engineStatus(engine({ available: true })), { status: "done", key: "enginesPage.status.ready" });
  assert.deepEqual(engineStatus(engine({ available: true, limit: { message: "Resets at 5pm" } })), { status: "denied", key: "enginesPage.status.limited" });
  // Every engine that needs setup says Set up, whether it takes a key or a sign-in.
  assert.equal(engineActionKey(engine()), "enginesPage.setUp");
  assert.equal(engineActionKey(engine({ config: { has_api_key: true } })), "enginesPage.setUp");
  assert.equal(engineActionKey(engine({ available: true, config: { has_api_key: true } })), "enginesPage.replaceKey");
  assert.equal(engineActionKey(engine({ available: true })), "enginesPage.addKey");
  assert.equal(engineActionKey(engine({ id: "claude", configurable: false, config_fields: [], available: true })), "enginesPage.manage");
  assert.equal(engineActionKey(engine({ id: "claude", configurable: false, config_fields: [] })), "enginesPage.setUp");
  for (const value of [engine(), engine({ available: true }), engine({ limit: { message: "x" } })]) {
    assert.ok(engineStatus(value).key in en);
    assert.ok(engineActionKey(value) in en);
  }
});

test("an engine's second line says what is wrong, else what is known", () => {
  assert.deepEqual(engineSubline(engine()), { key: "enginesPage.raw", params: { text: "Add an API key." } });
  assert.deepEqual(engineSubline(engine({ available: true, config: { has_api_key: true } })), { key: "enginesPage.keySaved" });
  assert.deepEqual(engineSubline(engine({ id: "claude", available: true, configurable: false, config_fields: [], signed_in: true, version: "2.1.3" })), { key: "enginesPage.signedInVersion", params: { version: "2.1.3" } });
  assert.equal(engineSubline(engine({ available: true, configurable: false, config_fields: [] })), null);
});

test("the default engine list holds every ready engine and model, and keeps a saved one that is not ready", () => {
  const engines = [
    engine({ id: "claude", label: "Claude", available: true, models: [{ id: "opus", label: "Opus" }, { id: "sonnet", label: "Sonnet" }] }),
    engine({ id: "openrouter", label: "OpenRouter", available: false }),
  ];
  const label = (name) => `${name} · default`;
  const options = defaultEngineOptions(engines, null, label);
  assert.deepEqual(options.map((option) => option.label), ["Claude · default", "Claude · Opus", "Claude · Sonnet"]);
  assert.ok(options.every((option) => option.ready));
  const saved = { provider: "openrouter", model: "a/b" };
  const withSaved = defaultEngineOptions(engines, saved, label);
  const last = withSaved.at(-1);
  assert.equal(last.value, defaultEngineValue(saved));
  assert.equal(last.label, "OpenRouter · Model B");
  assert.equal(last.ready, false);
  assert.deepEqual(parseDefaultEngineValue(defaultEngineValue({ provider: "claude", model: "opus" })), { provider: "claude", model: "opus" });
  assert.deepEqual(parseDefaultEngineValue(defaultEngineValue({ provider: "claude", model: null })), { provider: "claude", model: null });
  assert.deepEqual(parseDefaultEngineValue(""), { provider: null, model: null });
  assert.equal(defaultEngineValue({ provider: null, model: null }), "");
});

test("reasoning-effort levels use the shared translated words; an unknown level has none", () => {
  for (const level of ["low", "medium", "high", "xhigh", "max", "minimal", "none"]) {
    const key = effortLabelKey(level);
    assert.equal(key, `agentsModel.effort.${level}`);
    assert.ok(key in en, level);
  }
  assert.equal(effortLabelKey("High"), "agentsModel.effort.high");
  assert.equal(effortLabelKey("turbo"), null);
});

test("every role, permission and Settings page the screens build a key for has words in English", () => {
  for (const page of SETTINGS_PAGES) {
    assert.ok(`settingsNav.${page.id}` in en, page.id);
    assert.ok(`settingsPage.summary.${page.id}` in en, page.id);
  }
  for (const choice of ["owner", "admin", "member", "reply", "viewer", "custom"]) assert.ok(`members.role.${choice}` in en, choice);
  for (const choice of ["admin", "member", "reply", "viewer", "custom"]) assert.ok(`members.roleHelp.${choice}` in en, choice);
  for (const permission of ["chat", "files", "approve", "rules", "agents"]) {
    assert.ok(`members.permission.${permission}` in en, permission);
    assert.ok(`members.permissionHelp.${permission}` in en, permission);
  }
  for (const field of ["cliPath", "workspaceRoot", "tools", "answerTimeout", "approvalTimeout", "outputLimit"]) {
    assert.ok(`enginesPage.local.${field}` in en, field);
    assert.ok(`enginesPage.local.${field}Help` in en, field);
  }
});
