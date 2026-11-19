import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  PAGE_CSP,
  PAGE_RESOURCES,
  PAGE_RESOURCE_NAMES,
  isPageRequest,
  loadResource,
  preparePageHtml,
  rateLimiter,
} from "./page-data.ts";

test("the policy and helper always come first, keeping a leading doctype", () => {
  const page = "<!DOCTYPE html><html><head><title>x</title></head><body>hi</body></html>";
  const out = preparePageHtml(page);
  assert.ok(out.startsWith("<!DOCTYPE html><meta http-equiv=\"Content-Security-Policy\""));
  assert.ok(out.includes("window.lukethomas="));
  assert.ok(out.endsWith("<body>hi</body></html>"));
  // A fake <head> in a comment or script cannot move the policy: it is first, before any of it.
  const tricky = "<!-- <head> --><script>'<head>'</script><p>x</p>";
  assert.ok(preparePageHtml(tricky).startsWith("<!doctype html><meta http-equiv=\"Content-Security-Policy\""));
});

test("the policy keeps the page off the network", () => {
  assert.match(PAGE_CSP, /connect-src 'none'/);
  assert.match(PAGE_CSP, /form-action 'none'/);
  assert.match(PAGE_CSP, /img-src data: blob:(;|$)/);
  assert.match(PAGE_CSP, /default-src 'none'/);
  assert.ok(!PAGE_CSP.includes('"'), "the policy sits inside a double-quoted attribute");
});

test("only well-formed requests for a source are answered", () => {
  assert.ok(isPageRequest({ lt: "req", id: 1, resource: "tasks" }));
  for (const bad of [null, "x", { lt: "req", id: "1", resource: "tasks" }, { lt: "res", id: 1, resource: "tasks" }, { lt: "req", id: 1, resource: "x".repeat(41) }]) {
    assert.ok(!isPageRequest(bad));
  }
});

test("the rate limit allows a burst, then refuses until the window passes", () => {
  let now = 0;
  const allow = rateLimiter(3, 1000, () => now);
  assert.deepEqual([allow(), allow(), allow(), allow()], [true, true, true, false]);
  now = 1000;
  assert.ok(allow());
});

test("sources are trimmed to plain fields, and an unknown or inherited name is refused", async () => {
  const calls = [];
  const fetchJson = async (path) => {
    calls.push(path);
    if (path === "/agents") return [{ id: 1, name: "Hoefs", title: "Lead", instructions: "secret", remote_computer: { token: "t" } }];
    if (path === "/planner/board") return { id: 7, columns: [{ id: 3, name: "Doing" }] };
    if (path.startsWith("/planner/items")) return [{ id: 9, title: "Ship", column_id: 3, priority: "high", revision: 4, description: "d" }];
    if (path === "/today/running") return [{ thread_id: 2, agent_id: 1, title: "Work", approvals: [{}, {}], owner_token: "x" }];
    return [];
  };
  assert.deepEqual(await loadResource("agents", fetchJson), [{ id: 1, name: "Hoefs", title: "Lead" }]);
  assert.deepEqual(await loadResource("tasks", fetchJson), [{ id: 9, title: "Ship", priority: "high", column: "Doing", description: "d" }]);
  assert.deepEqual(calls.slice(1), ["/planner/board", "/planner/items?board_id=7&archived=false"]);
  const running = await loadResource("running", fetchJson);
  assert.deepEqual(running, [{ thread_id: 2, agent_id: 1, title: "Work", waiting_approvals: 2 }]);
  await assert.rejects(loadResource("threads", fetchJson), /Unknown data/);
  await assert.rejects(loadResource("toString", fetchJson), /Unknown data/);
  for (const resource of Object.values(PAGE_RESOURCES)) assert.ok(resource.path.startsWith("/"));
});

test("the agent's page tool lists the same sources, in the same words", () => {
  const python = readFileSync(new URL("../../backend/app/ui/mcp_server.py", import.meta.url), "utf8");
  for (const name of PAGE_RESOURCE_NAMES) {
    assert.ok(python.includes(JSON.stringify(PAGE_RESOURCES[name].about)), name);
  }
  const listed = [...python.matchAll(/^    "([a-z_]+): /gm)].map((match) => match[1]);
  assert.deepEqual(listed, PAGE_RESOURCE_NAMES);
});
