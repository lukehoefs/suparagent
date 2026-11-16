// The Blueprints page's address and labels: the ?category= value, the message key for each category
// chip (the data stays English so filtering is unchanged) and the plural form for counts.
// No runtime imports except plain lib files, so node tests can load it.

import { BLUEPRINTS_HREF } from "./agent-pages.ts";
import { BLUEPRINT_CATEGORIES, type BlueprintCategory } from "./blueprints.ts";

export const ALL_CATEGORIES_KEY = "blueprints.category.all";

export const CATEGORY_LABEL_KEYS: Record<BlueprintCategory, string> = {
  "Sales": "blueprints.category.sales",
  "Marketing": "blueprints.category.marketing",
  "Research": "blueprints.category.research",
  "Product and engineering": "blueprints.category.productEngineering",
  "Design and media": "blueprints.category.designMedia",
  "Operations": "blueprints.category.operations",
  "People": "blueprints.category.people",
  "Personal": "blueprints.category.personal",
};

/** The address form of a category: "Product and engineering" is product-and-engineering. */
export function categorySlug(category: BlueprintCategory): string {
  return category.toLowerCase().replace(/\s+/g, "-");
}

/** The category a ?category= value names (its slug, or its name in any case), or null for all and for anything unknown. */
export function parseBlueprintCategory(value: string | null | undefined): BlueprintCategory | null {
  if (!value) return null;
  const slug = value.trim().toLowerCase().replace(/[\s-]+/g, "-");
  return BLUEPRINT_CATEGORIES.find((category) => categorySlug(category) === slug) ?? null;
}

/** The Blueprints page showing one category, or all of them. */
export function blueprintsHref(category: BlueprintCategory | null): string {
  return category ? `${BLUEPRINTS_HREF}?category=${categorySlug(category)}` : BLUEPRINTS_HREF;
}

export type PluralForm = "one" | "few" | "many" | "other";

/** Which count message a number takes in a language (Russian and Polish have few and many). */
export function pluralForm(locale: string, count: number): PluralForm {
  let form: string;
  try {
    form = new Intl.PluralRules(locale).select(count);
  } catch {
    form = count === 1 ? "one" : "other";
  }
  return form === "one" || form === "few" || form === "many" ? form : "other";
}

/** The message key for "N blueprints" in a language. */
export function blueprintCountKey(locale: string, count: number): string {
  return `blueprints.count.${pluralForm(locale, count)}`;
}
