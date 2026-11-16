import assert from "node:assert/strict";
import { test } from "node:test";
import { countedCustomServers, createLimiter, enabledSkillCount, grantedToolCount } from "./roster-counts.ts";

test("the limiter keeps at most max tasks in flight and runs them all", async () => {
  const limit = createLimiter(2);
  let active = 0;
  let peak = 0;
  const order = [];
  const task = (id, ms) => () => new Promise((resolve) => {
    active += 1;
    peak = Math.max(peak, active);
    setTimeout(() => { active -= 1; order.push(id); resolve(id); }, ms);
  });
  const results = await Promise.all([limit(task(1, 20)), limit(task(2, 5)), limit(task(3, 5)), limit(task(4, 1))]);
  assert.deepEqual(results, [1, 2, 3, 4]);
  assert.equal(peak, 2);
  assert.equal(order.length, 4);
});

test("a failing task frees its slot and rejects only itself", async () => {
  const limit = createLimiter(1);
  const failed = limit(() => Promise.reject(new Error("403")));
  const thrown = limit(() => { throw new Error("sync"); });
  const ok = limit(() => Promise.resolve("fine"));
  await assert.rejects(failed, /403/);
  await assert.rejects(thrown, /sync/);
  assert.equal(await ok, "fine");
});

test("skills count only the enabled ones", () => {
  assert.equal(enabledSkillCount([{ enabled: true }, { enabled: false }, { enabled: true }]), 2);
  assert.equal(enabledSkillCount([]), 0);
});

test("tools are the grants on enabled custom servers plus community grants", () => {
  assert.deepEqual(countedCustomServers([{ id: "a", enabled: true }, { id: "b", enabled: false }]), ["a"]);
  assert.equal(grantedToolCount([{ tool_names: ["search", "fetch"] }, { tool_names: [] }, { tool_names: ["send"] }]), 3);
  assert.equal(grantedToolCount([]), 0);
});
