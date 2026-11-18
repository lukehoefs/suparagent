import assert from "node:assert/strict";
import { test } from "node:test";
import { isOnline, subscribeOnline } from "./connectivity.ts";

test("isOnline is false only when the browser says it is offline", () => {
  assert.equal(isOnline({ onLine: false }), false);
  assert.equal(isOnline({ onLine: true }), true);
  // No flag, or no navigator at all (server render): never claim the network is down.
  assert.equal(isOnline({}), true);
  assert.equal(isOnline(undefined), true);
});

test("subscribeOnline hears both online and offline, and stops after unsubscribe", () => {
  const target = new EventTarget();
  let calls = 0;
  const stop = subscribeOnline(() => { calls += 1; }, target);
  target.dispatchEvent(new Event("offline"));
  target.dispatchEvent(new Event("online"));
  assert.equal(calls, 2);
  stop();
  target.dispatchEvent(new Event("offline"));
  assert.equal(calls, 2);
});

test("subscribeOnline without a window is a no-op", () => {
  const stop = subscribeOnline(() => assert.fail("must not be called"), undefined);
  assert.equal(typeof stop, "function");
  stop();
});
