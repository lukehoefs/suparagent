import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { en } from "./i18n.ts";
import { statesMessages } from "./locales/states-extra.ts";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
// The shared empty, loading and error states (design: States). Every page shows them, so every
// word they say goes through i18n.
const STATE_FILES = [
  "components/ui/Banner.tsx",
  "components/ui/EmptyState.tsx",
  "components/ui/OfflineBanner.tsx",
  "components/ui/Skeleton.tsx",
  "components/ui/Toast.tsx",
  "components/chat/PanelState.tsx",
];

test("the shared state components carry no hard-coded copy", () => {
  const offenders = [];
  for (const file of STATE_FILES) {
    readFileSync(path.join(root, file), "utf8").split("\n").forEach((line, i) => {
      // JSX text between tags, such as >Try again< or >Loading…<.
      if (/>\s*[A-Za-z][^<>{}]*</.test(line)) offenders.push(`${file}:${i + 1}`);
    });
  }
  assert.deepEqual(offenders, []);
});

test("the states copy is registered and translated into every locale", () => {
  for (const key of Object.keys(statesMessages.en)) assert.ok(key in en, `${key} is not in the English table`);
  for (const [locale, table] of Object.entries(statesMessages)) {
    for (const [key, value] of Object.entries(table)) {
      assert.ok(value.trim().length > 0, `${locale} ${key} is empty`);
      assert.ok(!/\[[^\]]*\]/.test(value), `${locale} ${key} has a bracketed placeholder`);
      if (locale !== "en") assert.notEqual(value, statesMessages.en[key], `${locale} ${key} is still English`);
    }
  }
});
