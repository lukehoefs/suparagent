import assert from "node:assert/strict";
import { test } from "node:test";
import { BLUEPRINTS, BLUEPRINT_CATEGORIES, blueprintById, filterBlueprints } from "./blueprints.ts";

test("78 blueprints with unique ids, known categories and the five template matches", () => {
  assert.equal(BLUEPRINTS.length, 78);
  assert.equal(new Set(BLUEPRINTS.map((b) => b.id)).size, 78);
  assert.ok(BLUEPRINTS.every((b) => BLUEPRINT_CATEGORIES.includes(b.category) && b.job && !/\[/.test(b.name + b.job)));
  assert.equal(BLUEPRINTS.filter((b) => b.templateId).length, 5);
});

test("search needs every word, category narrows", () => {
  assert.ok(filterBlueprints(BLUEPRINTS, "prospect", null).some((b) => b.id === "prospect-finder"));
  assert.equal(filterBlueprints(BLUEPRINTS, "", "People").length, BLUEPRINTS.filter((b) => b.category === "People").length);
  assert.equal(filterBlueprints(BLUEPRINTS, "prospect zebra", null).length, 0);
  assert.ok(filterBlueprints(BLUEPRINTS, "  Prospect   finder ", null).length >= 1);
});

test("lookup by id", () => {
  assert.equal(blueprintById("loose-ends")?.name, "Loose Ends");
  assert.equal(blueprintById("nope"), null);
  assert.equal(blueprintById(null), null);
});
