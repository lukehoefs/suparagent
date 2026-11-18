import assert from "node:assert/strict";
import { test } from "node:test";
import { arrangeNav, EMPTY_UI_CONFIG, themeCss } from "./ui-config.ts";

const ALL = ["today", "agents", "tasks", "results", "routines", "apps", "computers", "settings"];

test("with no changes the sidebar keeps its usual order and the theme adds no CSS", () => {
  assert.deepEqual(arrangeNav(ALL, EMPTY_UI_CONFIG).map((e) => e.key), ALL);
  assert.equal(themeCss(EMPTY_UI_CONFIG), "");
  assert.equal(themeCss(null), "");
});

test("ordered entries come first, hidden ones go, settings always stays, custom pages follow", () => {
  const config = {
    ...EMPTY_UI_CONFIG,
    nav: { order: ["page:sales", "agents"], hidden: ["routines", "settings"], labels: {} },
    pages: [{ id: "sales", title: "Sales", in_nav: true }, { id: "off", title: "Off", in_nav: false }],
  };
  const out = arrangeNav(ALL, config);
  assert.deepEqual(out.slice(0, 2), [{ kind: "custom", id: "sales", title: "Sales" }, { kind: "page", key: "agents" }]);
  const keys = out.map((e) => e.key ?? e.id);
  assert.ok(!keys.includes("routines"));
  assert.ok(keys.includes("settings"));
  assert.ok(!keys.includes("off"));
});

test("a page the person may not see stays out even when ordered", () => {
  const config = { ...EMPTY_UI_CONFIG, nav: { order: ["today", "agents"], hidden: [], labels: {} } };
  assert.deepEqual(arrangeNav(["agents", "settings"], config).map((e) => e.key), ["agents", "settings"]);
});

test("only token names and hex colours reach the stylesheet", () => {
  const css = themeCss({
    ...EMPTY_UI_CONFIG,
    theme: { light: { accent: "#1d4ed8", ink: "red; } body { display:none", "x}y": "#fff" }, dark: { accent: "#123" } },
  });
  assert.match(css, /--accent: #1d4ed8;/);
  assert.match(css, /data-theme="dark"\] \{ --accent: #123; \}/);
  assert.ok(!css.includes("display"));
  assert.ok(!css.includes("x}y"));
});
