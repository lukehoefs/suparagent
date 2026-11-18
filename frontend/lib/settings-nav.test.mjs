import assert from "node:assert/strict";
import { test } from "node:test";
import { ENGINE_SETTINGS, SETTINGS_PAGES, activeSettingsPage, isSetupPage } from "./settings-nav.ts";

test("each Settings page has a unique address, and the engine address is one of them", () => {
  assert.equal(new Set(SETTINGS_PAGES.map((page) => page.href)).size, SETTINGS_PAGES.length);
  assert.ok(SETTINGS_PAGES.some((page) => page.href === ENGINE_SETTINGS));
  assert.equal(SETTINGS_PAGES[0].href, "/settings/");
});

test("the current page is found with or without a trailing slash and under a base path", () => {
  const label = (path) => activeSettingsPage(path).label;
  assert.equal(label("/settings"), "General");
  assert.equal(label("/settings/"), "General");
  assert.equal(label("/settings/engines"), "Engines");
  assert.equal(label("/settings/engines/"), "Engines");
  assert.equal(label("/app/settings/approvals/"), "Approvals");
  assert.equal(label("/settings/account"), "Account & privacy");
  assert.equal(label("/settings/members/"), "Members");
});

test("the navigation lists every Settings page once, the workspace pages first, each with a message key", async () => {
  const { SETTINGS_NAV_GROUPS } = await import("./settings-nav.ts");
  const pages = SETTINGS_NAV_GROUPS.flatMap((group) => group.items).filter((item) => item.pageId);
  assert.deepEqual([...pages.map((item) => item.pageId)].sort(), SETTINGS_PAGES.map((page) => page.id).sort());
  assert.deepEqual(SETTINGS_NAV_GROUPS[0].items.slice(0, 4).map((item) => item.pageId), ["general", "members", "engines", "permissions"]);
  const { en } = await import("./i18n.ts");
  for (const group of SETTINGS_NAV_GROUPS) {
    assert.ok(group.labelKey in en, group.labelKey);
    for (const item of group.items) assert.ok(item.labelKey in en, item.labelKey);
  }
  for (const page of SETTINGS_PAGES) assert.ok(`settingsNav.${page.id}` in en, page.id);
});

test("every Settings page and the setup guide skip the new-owner redirect; other pages do not", () => {
  for (const page of SETTINGS_PAGES) assert.equal(isSetupPage(page.href), true, page.href);
  assert.equal(isSetupPage("/onboarding/"), true);
  assert.equal(isSetupPage("/app/settings/engines"), true);
  for (const other of ["/chat/", "/apps/", "/tasks/", "/mysettings/", "/settingsx/"]) assert.equal(isSetupPage(other), false, other);
});
