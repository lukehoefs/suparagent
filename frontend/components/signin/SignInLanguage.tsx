"use client";

import { Globe } from "lucide-react";
import { Select } from "@/components/ui/Select";
import { LANGUAGE_CHOICES, LANGUAGE_LABELS, LANGUAGE_TAGS, type LanguageChoice } from "@/lib/i18n";
import { setLanguageChoice, useLanguageChoice, useT } from "@/lib/use-i18n";

const OPTIONS = LANGUAGE_CHOICES.map((language) => ({
  value: language,
  label: LANGUAGE_LABELS[language],
  lang: LANGUAGE_TAGS[language],
}));

// The language picker at the top of the sign-in pages: the same choice as Settings, at control height
// (36 px with a mouse, 44 px on touch).
export function SignInLanguage() {
  const t = useT();
  const choice = useLanguageChoice();
  return (
    <Select
      aria-label={t("language.label")}
      value={choice}
      onChange={(event) => setLanguageChoice(event.target.value as LanguageChoice)}
      containerClassName="w-auto min-w-36 shrink-0"
      triggerClassName="h-control min-w-36 border-line-strong bg-raised text-sm touch:h-touch"
      menuClassName="min-w-40"
      leadingIcon={<Globe size={16} aria-hidden="true" />}
      options={OPTIONS}
    />
  );
}
