import assert from "node:assert/strict";
import { test } from "node:test";
import { appOf, groupByApp } from "./tool-groups.ts";

test("common Google tools land in the right app", () => {
  assert.equal(appOf("gmail_find_email"), "Gmail");
  assert.equal(appOf("gmail-send-email"), "Gmail");
  assert.equal(appOf("google_sheets_insert_row"), "Google Sheets");
  assert.equal(appOf("google-sheets-find-rows"), "Google Sheets");
  assert.equal(appOf("google_drive_upload_file"), "Google Drive");
  assert.equal(appOf("drive_list_files"), "Google Drive");
});

test("our own servers group sensibly", () => {
  assert.equal(appOf("searxng_web_search"), "Web search");
  assert.equal(appOf("web_url_read"), "Web search");
  assert.equal(appOf("computer_screenshot"), "Computer");
});

test("unknown tools fall back to their prefix, then Other", () => {
  assert.equal(appOf("stripe_create_invoice"), "Stripe");
  assert.equal(appOf("ping"), "Other");
});

test("groups are sorted with Other last and keep tool order", () => {
  const groups = groupByApp([
    { name: "ping" }, { name: "google_sheets_b" }, { name: "gmail_a" }, { name: "google_sheets_a" },
  ]);
  assert.deepEqual(groups.map((g) => g.app), ["Gmail", "Google Sheets", "Other"]);
  assert.deepEqual(groups[1].tools.map((t) => t.name), ["google_sheets_b", "google_sheets_a"]);
});
