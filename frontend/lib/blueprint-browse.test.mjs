import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ALL_CATEGORIES_KEY,
  CATEGORY_LABEL_KEYS,
  blueprintCountKey,
  blueprintsHref,
  categorySlug,
  parseBlueprintCategory,
  pluralForm,
} from "./blueprint-browse.ts";
import { BLUEPRINT_CATEGORIES } from "./blueprints.ts";
import { agentsBlueprintsMessages } from "./locales/agents-blueprints-extra.ts";

test("the category address round-trips and rejects anything unknown", () => {
  for (const category of BLUEPRINT_CATEGORIES) {
    assert.equal(parseBlueprintCategory(categorySlug(category)), category);
    assert.equal(parseBlueprintCategory(category), category);
  }
  assert.equal(categorySlug("Product and engineering"), "product-and-engineering");
  assert.equal(parseBlueprintCategory("SALES"), "Sales");
  assert.equal(parseBlueprintCategory(" design-and-media "), "Design and media");
  assert.equal(parseBlueprintCategory("nope"), null);
  assert.equal(parseBlueprintCategory(""), null);
  assert.equal(parseBlueprintCategory(null), null);
  assert.equal(parseBlueprintCategory(undefined), null);
});

test("addresses keep the trailing slash and a query string", () => {
  assert.equal(blueprintsHref(null), "/agents/blueprints/");
  assert.equal(blueprintsHref("Sales"), "/agents/blueprints/?category=sales");
  assert.equal(blueprintsHref("Design and media"), "/agents/blueprints/?category=design-and-media");
});

test("plural forms follow the language", () => {
  assert.equal(pluralForm("en", 1), "one");
  assert.equal(pluralForm("en", 0), "other");
  assert.equal(pluralForm("en", 78), "other");
  assert.equal(pluralForm("fr", 0), "one");
  assert.equal(pluralForm("ru", 21), "one");
  assert.equal(pluralForm("ru", 22), "few");
  assert.equal(pluralForm("ru", 25), "many");
  assert.equal(pluralForm("pl", 1), "one");
  assert.equal(pluralForm("pl", 4), "few");
  assert.equal(pluralForm("pl", 21), "many");
  assert.equal(pluralForm("ja", 1), "other");
  assert.equal(pluralForm("not a locale!", 1), "one");
  assert.equal(blueprintCountKey("en", 1), "blueprints.count.one");
  assert.equal(blueprintCountKey("ru", 3), "blueprints.count.few");
});

test("every label key and count form exists in all 13 languages", () => {
  const keys = [ALL_CATEGORIES_KEY, ...Object.values(CATEGORY_LABEL_KEYS)];
  assert.equal(Object.keys(CATEGORY_LABEL_KEYS).length, BLUEPRINT_CATEGORIES.length);
  const english = agentsBlueprintsMessages.en;
  for (const [locale, table] of Object.entries(agentsBlueprintsMessages)) {
    assert.deepEqual(Object.keys(table).sort(), Object.keys(english).sort(), locale);
    for (const key of keys) assert.ok(table[key], `${locale} ${key}`);
    for (const form of ["one", "few", "many", "other"]) assert.match(table[`blueprints.count.${form}`], /\{count\}/, `${locale} ${form}`);
    assert.match(table["blueprints.subtitle"], /\{count\}/, locale);
    assert.match(table["blueprints.buildNamed"], /\{name\}/, locale);
    // The named link label starts with the visible one, so speech input finds it.
    assert.ok(table["blueprints.buildNamed"].startsWith(table["blueprints.build"]), locale);
    for (const value of Object.values(table)) assert.ok(value && !/\[/.test(value), `${locale}: ${value}`);
  }
});
