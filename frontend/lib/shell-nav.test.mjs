import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { CHAT_HREF, SHELL_PAGES, TODAY_HREF, currentSheetPage, currentShellPage, fullRowEntries, sheetPages, shellPages } from "./shell-nav.ts";
import { PALETTE_PAGES } from "./palette.ts";
import { SETTINGS_NAV_GROUPS, SETTINGS_PAGES } from "./settings-nav.ts";
import { rowAction } from "./needs-you.ts";
import { ADD_SERVER_HREF, APPS_HREF } from "./apps-page.ts";
import { MCP_SERVERS_HREF } from "./remote-computers.ts";
import { boardTaskHref, RESULTS_HREF, routineHref as resultRoutineHref } from "./results.ts";
import { TASKS_HREF as TODAY_TASKS_HREF, routineHref as todayRoutineHref, taskHref as todayTaskHref } from "./today.ts";
import { TASKS_HREF, taskHref } from "./tasks-board.ts";
import { ROUTINES_HREF, routineHref } from "./routines-page.ts";
import { ROUTINES_VIEW_HREF, routineRunsHref } from "./agent-automation.ts";

const APP = fileURLToPath(new URL("../app/", import.meta.url));

// A static export page for an in-app address: /tasks/?task=1 is app/tasks/page.tsx.
function hasPage(href) {
  assert.ok(href.startsWith("/"), `${href} is an in-app address`);
  const path = href.split(/[?#]/)[0].replace(/^\/+|\/+$/g, "");
  return existsSync(`${APP}${path ? `${path}/` : ""}page.tsx`);
}

test("the sidebar lists the design's pages in order, the admin ones only for owners and admins", () => {
  assert.deepEqual(SHELL_PAGES.map((page) => page.key), ["today", "agents", "tasks", "results", "routines", "apps", "computers", "settings"]);
  assert.deepEqual(shellPages(false).map((page) => page.key), ["agents", "settings"]);
  assert.equal(shellPages(true).length, SHELL_PAGES.length);
});

test("every sidebar entry and every command palette page opens a page that exists", () => {
  for (const page of SHELL_PAGES) assert.ok(hasPage(page.href), page.href);
  for (const page of PALETTE_PAGES) assert.ok(hasPage(page.href), page.href);
  assert.ok(hasPage(TODAY_HREF));
  // The palette offers every sidebar page at the same address.
  for (const page of SHELL_PAGES) assert.equal(PALETTE_PAGES.find((entry) => entry.id === page.key)?.href, page.href, page.key);
});

test("the settings list and the links between pages point at pages that exist", () => {
  for (const page of SETTINGS_PAGES) assert.ok(hasPage(page.href), page.href);
  for (const group of SETTINGS_NAV_GROUPS) for (const item of group.items) assert.ok(hasPage(item.href), item.href);
  for (const href of [APPS_HREF, ADD_SERVER_HREF, MCP_SERVERS_HREF, RESULTS_HREF, TASKS_HREF, TODAY_TASKS_HREF, ROUTINES_HREF, ROUTINES_VIEW_HREF]) {
    assert.ok(hasPage(href), href);
  }
  // The legacy Telegram and Boat page moved; the old marketplace address still answers (a redirect).
  assert.ok(hasPage("/boat-tasks/"));
  assert.ok(hasPage("/marketplace/"));
});

test("Today, Results and the needs-you rows open tasks and routines on their own pages", () => {
  assert.equal(todayTaskHref(8), taskHref(8));
  assert.equal(boardTaskHref(8), taskHref(8));
  assert.equal(todayRoutineHref(3), routineHref(3, "runs"));
  assert.equal(resultRoutineHref(3), routineHref(3, "runs"));
  assert.equal(routineRunsHref(3), routineHref(3, "runs"));
  const base = { key: "k", title: "t", detail: null, thread_id: null };
  assert.equal(rowAction({ ...base, kind: "routine_completed", routine_id: 3 }).href, routineHref(3, "runs"));
  assert.equal(rowAction({ ...base, kind: "due", work_item_id: 8 }).href, taskHref(8));
  for (const href of [taskHref(8), routineHref(3, "runs")]) assert.ok(hasPage(href), href);
});

test("the entry marked current follows the address, and only its own pages", () => {
  assert.equal(currentShellPage("/today/"), "today");
  assert.equal(currentShellPage("/tasks/"), "tasks");
  assert.equal(currentShellPage("/tasks"), "tasks");
  assert.equal(currentShellPage("/results/"), "results");
  assert.equal(currentShellPage("/routines/"), "routines");
  assert.equal(currentShellPage("/agents/edit/"), "agents");
  assert.equal(currentShellPage("/computers/"), "computers");
  assert.equal(currentShellPage("/apps/"), "apps");
  assert.equal(currentShellPage("/marketplace/"), "apps");
  assert.equal(currentShellPage("/settings/members/"), "settings");
  for (const other of ["/boat-tasks/", "/chat/", "/clients/", "/", "", null, undefined, "/tasksx/", "/settingsx/"]) {
    assert.equal(currentShellPage(other), null, String(other));
  }
});

test("the phone menu's tiles add the chat second, put Results last and never leave a row ragged", () => {
  const owner = sheetPages(true);
  assert.deepEqual(owner.map((page) => page.key), ["today", "chat", "agents", "tasks", "routines", "apps", "computers", "settings", "results"]);
  // Nine tiles: the ninth takes the whole row; the rest sit two across.
  assert.deepEqual(owner.filter((page) => page.wide).map((page) => page.key), ["results"]);
  const member = sheetPages(false);
  assert.deepEqual(member.map((page) => page.key), ["chat", "agents", "settings"]);
  assert.deepEqual(member.filter((page) => page.wide).map((page) => page.key), ["settings"]);
  assert.equal(owner.find((page) => page.key === "chat")?.href, CHAT_HREF);
  for (const page of owner) assert.ok(hasPage(page.href), page.href);
});

test("the phone menu marks the chat's tile on the chat and the navigation's elsewhere", () => {
  assert.equal(currentSheetPage("/chat/"), "chat");
  assert.equal(currentSheetPage("/chat"), "chat");
  assert.equal(currentSheetPage("/tasks/"), "tasks");
  assert.equal(currentSheetPage("/clients/"), null);
  assert.equal(currentSheetPage(null), null);
});

test("the sidebar's two-across grid never leaves a row half empty", () => {
  assert.deepEqual(fullRowEntries([false, false, false, false]), [false, false, false, false]);
  assert.deepEqual(fullRowEntries([false, false, false]), [false, false, true]);
  // An entry with a notice takes its own row; the one it would have left alone fills its row too.
  assert.deepEqual(fullRowEntries([false, false, false, true]), [false, false, true, true]);
  assert.deepEqual(fullRowEntries([false, true, false, false]), [true, true, false, false]);
  assert.deepEqual(fullRowEntries([true]), [true]);
  assert.deepEqual(fullRowEntries([]), []);
});
