import assert from "node:assert/strict";
import { test } from "node:test";
import {
  countsTowardTotal, customServerState, customToolsSearched, pluginNeedsToken, pluginUpdate, sameNames, toolErrorKey,
} from "./agent-tools.ts";

const conn = (over = {}) => ({ state: "connected", enabled: true, can_manage: true, ...over });

test("a server is ready only when it is switched on and its test is current", () => {
  assert.equal(customServerState(conn()), "ready");
  assert.equal(customServerState(conn({ enabled: false })), "off");
  assert.equal(customServerState(conn({ state: "disabled", enabled: false })), "off");
  assert.equal(customServerState(conn({ state: "needs_sign_in" })), "needs_sign_in");
  assert.equal(customServerState(conn({ state: "unreachable", enabled: false })), "unreachable");
  assert.equal(customServerState(conn({ state: "not_tested", enabled: false })), "not_tested");
  assert.equal(customServerState(conn({ can_manage: false })), "private");
});

test("only a ready server's grants count, as on the roster", () => {
  assert.equal(countsTowardTotal("ready"), true);
  for (const state of ["off", "needs_sign_in", "not_tested", "unreachable", "private"]) assert.equal(countsTowardTotal(state), false);
});

test("a plugin's update state compares its pinned manifest with the catalog", () => {
  const plugin = { slug: "notes", section: "tested", manifest_digest: "a" };
  const listing = (digest, version = "2.0") => ({ slug: "notes", version, manifest_digest: digest });
  assert.deepEqual(pluginUpdate(plugin, null), { state: "unknown" });
  assert.deepEqual(pluginUpdate(plugin, { tested: [listing("a")], community: [] }), { state: "current" });
  assert.deepEqual(pluginUpdate(plugin, { tested: [listing("b", "3.1")], community: [] }), { state: "update", version: "3.1" });
  assert.deepEqual(pluginUpdate(plugin, { tested: [], community: [listing("a")] }), { state: "current" });
  assert.deepEqual(pluginUpdate(plugin, { tested: [{ ...listing("a"), slug: "other" }], community: [] }), { state: "withdrawn" });
  // The listing in its own section wins over one with the same slug in the other.
  assert.deepEqual(pluginUpdate(plugin, { tested: [listing("a")], community: [listing("z")] }), { state: "current" });
});

test("a plugin needs its token only when it signs in with one and has none", () => {
  assert.equal(pluginNeedsToken({ manifest: { auth_mode: "bearer_token" }, credential_configured: false }), true);
  assert.equal(pluginNeedsToken({ manifest: { auth_mode: "bearer_token" }, credential_configured: true }), false);
  assert.equal(pluginNeedsToken({ manifest: { auth_mode: "none" }, credential_configured: false }), false);
});

test("sameNames compares sets", () => {
  assert.equal(sameNames(new Set(["a", "b"]), new Set(["b", "a"])), true);
  assert.equal(sameNames(new Set(["a"]), new Set(["a", "b"])), false);
});

test("server tools are searched past 25 tools or about 100 KB, and only when there are some", () => {
  const tool = (kind, description = "d") => ({ kind, server: "Executor", description, input_schema: { type: "object", properties: {} } });
  assert.equal(customToolsSearched([]), false);
  assert.equal(customToolsSearched(Array.from({ length: 25 }, () => tool("custom"))), false);
  assert.equal(customToolsSearched(Array.from({ length: 26 }, () => tool("custom"))), true);
  // Plugin tools count toward the 25, but alone they are always offered one by one.
  assert.equal(customToolsSearched([...Array.from({ length: 25 }, () => tool("plugin")), tool("custom")]), true);
  assert.equal(customToolsSearched(Array.from({ length: 40 }, () => tool("plugin"))), false);
  assert.equal(customToolsSearched([tool("custom", "x".repeat(4000)), tool("custom", "x".repeat(4000))]), false);
  assert.equal(customToolsSearched(Array.from({ length: 25 }, () => tool("custom", "x".repeat(4000)))), true);
});

test("known error codes have their own wording; anything else keeps the backend's message", () => {
  assert.equal(toolErrorKey({ code: "tool_schema_changed" }), "agentTools.error.tool_schema_changed");
  assert.equal(toolErrorKey({ code: "something_new" }), null);
  assert.equal(toolErrorKey(new Error("x")), null);
  assert.equal(toolErrorKey(null), null);
});
