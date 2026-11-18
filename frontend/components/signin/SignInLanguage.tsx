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
// (36 px with a mouse, 44 px on touch), sized to the language's name, with a muted globe beside it
// (design: SignIn.html). Its name carries the current language as well ("App language: English"), so
// a screen reader hears the choice and a voice command can use the word it shows.
export function SignInLanguage() {
  const t = useT();
  const choice = useLanguageChoice();
  return (
    <div className="inline-flex items-center gap-2 text-muted">
      <Globe size={16} strokeWidth={1.7} aria-hidden="true" className="shrink-0" />
      <Select
        aria-label={t("signin.languageCurrent", { language: LANGUAGE_LABELS[choice] })}
        value={choice}
        onChange={(event) => setLanguageChoice(event.target.value as LanguageChoice)}
        containerClassName="w-auto shrink-0"
        triggerClassName="h-control border-line-strong bg-raised text-sm touch:h-touch"
        menuClassName="min-w-40"
        options={OPTIONS}
      />
    </div>
  );
}
