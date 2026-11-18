"use client";

import type { ReactNode } from "react";
import { useT } from "@/lib/use-i18n";
import { SettingsCard } from "./SettingsCard";
import { LanguageSelect } from "./LanguageSelect";

// `meta`: when the choice applies and whether it saved, in the card's header (SettingsCard).
export function LanguageSettings({ meta }: { meta?: ReactNode }) {
  const t = useT();
  return (
    <SettingsCard
      title={t("language.title")}
      description={t("language.description")}
      action={<LanguageSelect />}
      meta={meta}
    />
  );
}
