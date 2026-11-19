import assert from "node:assert/strict";
import { test } from "node:test";
import { en, translate, LOCALES } from "./i18n.ts";

// A translation pass once wrote Spanish into the English table, so the Approvals page showed a
// Spanish paragraph to English readers. These checks catch text that landed in the wrong table.

// Common short words that give a language away. English UI text almost never uses these as
// whole words, so two or more of them in an English value means it is really another language.
const FOREIGN_WORDS = new Set([
  // Spanish and Portuguese
  "el", "los", "las", "una", "que", "para", "con", "por", "del", "uno", "sus", "esta", "este", "sin", "você", "não", "um", "os",
  // French
  "les", "des", "une", "pour", "avec", "vous", "votre", "dans", "est",
  // Italian
  "il", "di", "che", "della", "gli", "questo",
  // German and Dutch
  "der", "die", "das", "und", "nicht", "mit", "für", "ist", "het", "een", "voor", "niet", "je",
]);

function foreignWords(value) {
  return value.toLowerCase().replace(/\{[^}]*\}/g, " ").split(/[^\p{L}]+/u).filter((word) => FOREIGN_WORDS.has(word));
}

test("every English message is written in English", () => {
  const wrong = [];
  for (const [key, value] of Object.entries(en)) {
    // Language names are shown in their own language on purpose ("Español").
    if (key.startsWith("language.")) continue;
    const accented = value.match(/\p{L}/gu)?.filter((letter) => !/[A-Za-z]/.test(letter)) ?? [];
    if (accented.length) wrong.push(`${key}: letters ${[...new Set(accented)].join("")}`);
    else if (foreignWords(value).length >= 2) wrong.push(`${key}: words ${foreignWords(value).join(", ")}`);
  }
  assert.deepEqual(wrong, []);
});

const SCRIPTS = {
  cyrillic: /[Ѐ-ӿ]/,
  kana: /[぀-ヿ]/,
  hangul: /[가-힯]/,
  han: /[一-鿿]/,
};

// Scripts a locale's text should never contain. Brand names and code stay Latin everywhere, so
// Latin is allowed in every locale.
const FORBIDDEN = {
  ja: ["cyrillic", "hangul"],
  ko: ["cyrillic", "kana"],
  zh: ["cyrillic", "kana", "hangul"],
  ru: ["kana", "hangul", "han"],
};

test("no locale shows text in another language's script", () => {
  const wrong = [];
  for (const locale of LOCALES) {
    const forbidden = FORBIDDEN[locale] ?? Object.keys(SCRIPTS);
    for (const key of Object.keys(en)) {
      const value = translate(locale, key);
      const hit = forbidden.find((name) => SCRIPTS[name].test(value));
      if (hit) wrong.push(`${locale} ${key}: ${hit}`);
    }
  }
  assert.deepEqual(wrong, []);
});

test("the Approvals explanation is English in English and Spanish in Spanish", () => {
  assert.match(translate("en", "approvals.explanation"), /^A saved rule/);
  assert.match(translate("es", "approvals.explanation"), /^Una regla guardada/);
});
