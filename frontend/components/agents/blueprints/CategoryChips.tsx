"use client";

import { ALL_CATEGORIES_KEY, CATEGORY_LABEL_KEYS } from "@/lib/blueprint-browse";
import { BLUEPRINT_CATEGORIES, type BlueprintCategory } from "@/lib/blueprints";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/use-i18n";

// One category at a time, "All" first (design: Blueprints.html). Pressed chips are the active
// filter, so they take the accent tint; the rest sit on the surface with a strong hairline.
export function CategoryChips({
  value,
  onChange,
}: {
  value: BlueprintCategory | null;
  onChange: (next: BlueprintCategory | null) => void;
}) {
  const t = useT();
  const options: { value: BlueprintCategory | null; label: string }[] = [
    { value: null, label: t(ALL_CATEGORIES_KEY) },
    ...BLUEPRINT_CATEGORIES.map((category) => ({ value: category, label: t(CATEGORY_LABEL_KEYS[category]) })),
  ];
  return (
    <div role="group" aria-label={t("blueprints.categoryGroup")} className="flex flex-wrap gap-2">
      {options.map((option) => {
        const on = option.value === value;
        return (
          <button
            key={option.value ?? "all"}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(option.value)}
            className={cn(
              "h-[30px] cursor-pointer rounded-full border px-3 text-small font-medium transition-colors duration-(--dur-fast) touch:h-10",
              on ? "border-accent bg-accent-bg text-accent-text" : "border-line-strong bg-raised text-muted hover:bg-hover hover:text-ink",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
