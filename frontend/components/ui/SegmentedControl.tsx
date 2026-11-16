"use client";

import { cn } from "@/lib/cn";

// A small set of mutually exclusive options (Task / Conversational, Light / Dark, Desktop / Phone).
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: T;
  onChange: (next: T) => void;
  options: { value: T; label: string }[];
  label: string;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("inline-flex rounded-field bg-hover p-0.5", className)}>
      {options.map((option) => {
        const on = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(option.value)}
            className={cn(
              "h-7 cursor-pointer rounded-[calc(var(--radius-field)-2px)] px-3 text-label transition-colors duration-(--dur-fast) touch:h-10",
              on ? "bg-raised text-ink shadow-sm" : "text-muted hover:text-ink",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
