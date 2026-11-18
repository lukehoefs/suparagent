import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PANEL_DEFAULT,
  PANEL_MAX,
  PANEL_MIN,
  PANEL_RAIL,
  dragPanelTo,
  parseStoredPanel,
  shownPanelWidth,
  togglePanelRail,
} from "./panel-width.ts";

test("the panel opens part way, at the default width", () => {
  assert.deepEqual(parseStoredPanel(null), { rail: false, width: PANEL_DEFAULT });
  assert.deepEqual(parseStoredPanel("not json"), { rail: false, width: PANEL_DEFAULT });
  assert.ok(PANEL_DEFAULT > PANEL_MIN && PANEL_DEFAULT < PANEL_MAX);
});

test("dragging stays between the limits and snaps to the icon strip when slid far enough", () => {
  const open = { rail: false, width: 400 };
  assert.deepEqual(dragPanelTo(500, open), { rail: false, width: 500 });
  assert.deepEqual(dragPanelTo(5000, open), { rail: false, width: PANEL_MAX });
  assert.deepEqual(dragPanelTo(250, open), { rail: false, width: PANEL_MIN });
  const strip = dragPanelTo(100, open);
  assert.deepEqual(strip, { rail: true, width: 400 });
  assert.equal(shownPanelWidth(strip), PANEL_RAIL);
  assert.deepEqual(dragPanelTo(Number.NaN, open), open);
});

test("toggling the strip comes back to the last full width, and stored widths are clamped", () => {
  assert.deepEqual(togglePanelRail(togglePanelRail({ rail: false, width: 520 })), { rail: false, width: 520 });
  assert.deepEqual(parseStoredPanel(JSON.stringify({ rail: true, width: 99999 })), { rail: true, width: PANEL_MAX });
});
