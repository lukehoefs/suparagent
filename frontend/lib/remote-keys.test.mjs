import assert from "node:assert/strict";
import { test } from "node:test";
import { LEAVE_WINDOW_MS, leavesScreen, nextInOrder } from "./remote-keys.ts";

test("Escape twice in quick succession leaves the screen; once still reaches the desktop", () => {
  assert.equal(leavesScreen("Escape", 1000, null), false); // the first one is the desktop's
  assert.equal(leavesScreen("Escape", 1000 + LEAVE_WINDOW_MS, 1000), true);
  assert.equal(leavesScreen("Escape", 1000 + LEAVE_WINDOW_MS + 1, 1000), false);
  assert.equal(leavesScreen("Escape", 1200, 1000, true), false); // a held key repeating
  assert.equal(leavesScreen("Tab", 1100, 1000), false);
  assert.equal(leavesScreen("a", 1100, 1000), false);
});

test("leaving moves on to the next control in tab order, or nowhere after the last", () => {
  const order = ["back", "screen", "handBack", "fullscreen"];
  assert.equal(nextInOrder(order, "screen"), "handBack");
  assert.equal(nextInOrder(order, "fullscreen"), null);
  assert.equal(nextInOrder(order, "missing"), null);
});
