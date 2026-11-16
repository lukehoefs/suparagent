import assert from "node:assert/strict";
import { test } from "node:test";
import { SIDEBAR_DEFAULT, SIDEBAR_MAX, SIDEBAR_MIN, SIDEBAR_RAIL, dragTo, parseStored, shownWidth, toggleRail } from "./sidebar-width.ts";

const full = { rail: false, width: 300 };

test("a drag is clamped between 200 and 420", () => {
  assert.deepEqual(dragTo(260, full), { rail: false, width: 260 });
  assert.deepEqual(dragTo(180, full), { rail: false, width: SIDEBAR_MIN });
  assert.deepEqual(dragTo(900, full), { rail: false, width: SIDEBAR_MAX });
});

test("below 150 it snaps to the rail and keeps the last width", () => {
  assert.deepEqual(dragTo(120, full), { rail: true, width: 300 });
  assert.equal(shownWidth(dragTo(120, full)), SIDEBAR_RAIL);
  assert.deepEqual(dragTo(Number.NaN, full), full);
});

test("dragging out of the rail opens it again", () => {
  assert.deepEqual(dragTo(240, { rail: true, width: 300 }), { rail: false, width: 240 });
});

test("double-click toggles between rail and the last width", () => {
  assert.deepEqual(toggleRail(full), { rail: true, width: 300 });
  assert.deepEqual(toggleRail({ rail: true, width: 330 }), { rail: false, width: 330 });
});

test("stored values are checked", () => {
  assert.deepEqual(parseStored(null), { rail: false, width: SIDEBAR_DEFAULT });
  assert.deepEqual(parseStored("not json"), { rail: false, width: SIDEBAR_DEFAULT });
  assert.deepEqual(parseStored('{"rail":true,"width":9999}'), { rail: true, width: SIDEBAR_MAX });
  assert.deepEqual(parseStored('{"rail":"yes","width":250}'), { rail: false, width: SIDEBAR_DEFAULT });
});
