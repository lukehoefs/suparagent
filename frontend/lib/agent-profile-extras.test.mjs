import assert from "node:assert/strict";
import { test } from "node:test";
import { joinList, ownTeamSteps, ownTeamView, restoreChanges, sameValue, shownFields, shownValue } from "./agent-profile-extras.ts";

const team = (leadId, agents) => ({ team: leadId === undefined ? null : { lead_agent_id: leadId }, agents });
const member = (id, over = {}) => ({ id, is_lead: false, delegation_enabled: true, ...over });
const view = (over) => ownTeamView({ team: null, agentId: 5, isLead: false, storedDelegate: undefined, memberChoice: null, delegateChoice: null, ...over });

test("nothing is known or dirty before the team loads", () => {
  const v = view({});
  assert.equal(v.known, false);
  assert.equal(v.dirty, false);
  assert.equal(v.showMembership, false);
});

test("an agent off the team shows delegation off, and the membership switch when a lead exists", () => {
  const v = view({ team: team(1, [member(1, { is_lead: true })]), storedDelegate: true });
  assert.deepEqual(
    { member: v.member, delegate: v.delegate, showMembership: v.showMembership, leadId: v.leadId, hasTeam: v.hasTeam, dirty: v.dirty },
    { member: false, delegate: false, showMembership: true, leadId: 1, hasTeam: true, dirty: false },
  );
});

test("turning delegation on for an agent off the team joins it", () => {
  const v = view({ team: team(1, [member(1, { is_lead: true })]), memberChoice: true, delegateChoice: true });
  assert.equal(v.member, true);
  assert.equal(v.delegate, true);
  assert.equal(v.dirty, true);
});

test("joining brings back the stored delegation flag", () => {
  const v = view({ team: team(1, [member(1, { is_lead: true })]), storedDelegate: false, memberChoice: true });
  assert.equal(v.delegate, false);
  assert.equal(v.dirty, true);
});

test("a member's delegation flag is read from the team", () => {
  const t = team(1, [member(1, { is_lead: true }), member(5, { delegation_enabled: false })]);
  const v = view({ team: t, storedDelegate: true });
  assert.equal(v.member, true);
  assert.equal(v.delegate, false);
  assert.equal(v.dirty, false);
  assert.equal(view({ team: t, delegateChoice: true }).dirty, true);
  // Leaving the team: delegation shows off, and only membership changed.
  const leaving = view({ team: t, memberChoice: false, delegateChoice: true });
  assert.equal(leaving.delegate, false);
  assert.equal(leaving.dirty, true);
});

test("the lead is a member and has no membership switch", () => {
  const t = team(5, [member(5, { is_lead: true })]);
  const v = view({ team: t, isLead: true });
  assert.equal(v.member, true);
  assert.equal(v.showMembership, false);
  assert.equal(v.leadId, null);
  // Becoming the lead: no membership switch either, and there will be a team.
  const becoming = view({ team: team(undefined, []), isLead: true });
  assert.equal(becoming.showMembership, false);
  assert.equal(becoming.hasTeam, true);
  assert.equal(becoming.member, true);
});

test("with no team at all there is nothing to join", () => {
  const v = view({ team: team(undefined, []) });
  assert.equal(v.hasTeam, false);
  assert.equal(v.showMembership, false);
  // A team whose lead was removed still exists.
  assert.equal(view({ team: team(null, []) }).hasTeam, true);
  assert.equal(view({ team: team(null, []) }).showMembership, false);
});

test("the steps that save the agent's own place on the team", () => {
  const t = team(1, [member(1, { is_lead: true }), member(5, { delegation_enabled: true })]);
  assert.deepEqual(ownTeamSteps(t, 5, { member: true, delegate: true }), []);
  assert.deepEqual(ownTeamSteps(t, 5, { member: true, delegate: false }), [{ kind: "delegation", value: false }]);
  assert.deepEqual(ownTeamSteps(t, 5, { member: false, delegate: true }), [{ kind: "remove" }]);
  // Off the team: one PATCH adds it and sets the flag.
  assert.deepEqual(ownTeamSteps(t, 7, { member: true, delegate: true }), [{ kind: "delegation", value: true }]);
  assert.deepEqual(ownTeamSteps(t, 7, { member: false, delegate: false }), []);
  // The lead is never removed from here.
  assert.deepEqual(ownTeamSteps(t, 1, { member: false, delegate: false }), []);
});

test("empty values are equal, and key order does not matter", () => {
  assert.equal(sameValue(null, ""), true);
  assert.equal(sameValue({}, null), true);
  assert.equal(sameValue(undefined, []), true);
  assert.equal(sameValue({ a: "read", b: "write" }, { b: "write", a: "read" }), true);
  assert.equal(sameValue("x", null), false);
  assert.equal(sameValue(false, null), false);
  assert.equal(sameValue(true, false), false);
});

test("a restore changes only stored, visible fields that differ from now", () => {
  const snapshot = { name: "Ada", title: null, instructions: "old", provider: "claude", model: null, pinned: false, connector_scopes: {} };
  const current = { name: "Ada", title: "", instructions: "new", provider: "codex", model: null, pinned: false, connector_scopes: null };
  assert.deepEqual(restoreChanges(snapshot, current, []), ["instructions", "provider"]);
  assert.deepEqual(restoreChanges(snapshot, current, ["instructions"]), ["provider"]);
});

test("stored fields are listed in profile order, unknown ones last", () => {
  assert.deepEqual(shownFields({ zeta: 1, model: "m", name: "n" }), ["name", "model", "zeta"]);
});

test("stored values are shown by kind", () => {
  assert.deepEqual(shownValue("pinned", true), { kind: "on" });
  assert.deepEqual(shownValue("memory_enabled", false), { kind: "off" });
  assert.deepEqual(shownValue("model", null), { kind: "empty" });
  assert.deepEqual(shownValue("model", "gpt"), { kind: "text", text: "gpt" });
  assert.deepEqual(shownValue("instructions", "Be kind"), { kind: "long", text: "Be kind" });
  assert.deepEqual(shownValue("connector_scopes", { slack: "write", gmail: "read" }), { kind: "apps", apps: [{ app: "gmail", level: "read" }, { app: "slack", level: "write" }] });
  assert.deepEqual(shownValue("connector_scopes", {}), { kind: "empty" });
  assert.deepEqual(shownValue("connector_account_scopes", { gmail: ["a", "b"], slack: ["c"] }), { kind: "accounts", count: 3 });
  assert.deepEqual(shownValue("connector_account_scopes", { gmail: [] }), { kind: "empty" });
});

test("lists are joined in the reader's language", () => {
  assert.equal(joinList("en", ["name", "model", "engine"]), "name, model, and engine");
  assert.equal(joinList("en", ["name"]), "name");
});
