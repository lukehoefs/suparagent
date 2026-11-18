"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type SegmentOption<T extends string> = {
  value: T;
  label: string;
  // Shown before the label, decorative (the label names the option).
  icon?: ReactNode;
  // A hover hint, such as what the option does.
  title?: string;
};

// The trays: "sm" (28 px options on a grey tray) for settings and panels, "md" (32 px options on
// the quiet fill, 36 px in all) for a page header such as the chat's Task / Conversational switch.
const TRAY = { sm: "bg-hover", md: "bg-inset" } as const;
const OPTION = {
  sm: "h-7 px-3 touch:h-10",
  md: "inline-flex h-control-md items-center justify-center gap-1.5 whitespace-nowrap px-2.5 font-medium touch:h-10",
} as const;

// A small set of mutually exclusive options (Task / Conversational, Light / Dark, Desktop / Phone).
// `disabled` keeps the options focusable (aria-disabled) so the reason given in `describedBy` can
// be reached and read; a click on them then does nothing.
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
  size = "sm",
  disabled = false,
  busy = false,
  describedBy,
}: {
  value: T;
  onChange: (next: T) => void;
  options: SegmentOption<T>[];
  label: string;
  className?: string;
  size?: "sm" | "md";
  disabled?: boolean;
  // A change is being saved.
  busy?: boolean;
  describedBy?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-disabled={disabled || undefined}
      aria-busy={busy || undefined}
      aria-describedby={describedBy}
      className={cn("inline-flex rounded-field p-0.5", TRAY[size], className)}
    >
      {options.map((option) => {
        const on = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={on}
            aria-disabled={disabled || undefined}
            title={option.title}
            onClick={() => {
              if (!disabled && !on) onChange(option.value);
            }}
            className={cn(
              "cursor-pointer rounded-[calc(var(--radius-field)-2px)] text-label transition-colors duration-(--dur-fast)",
              OPTION[size],
              on ? "bg-raised text-ink shadow-sm" : "text-muted",
              !on && !disabled && "hover:text-ink",
              disabled && "cursor-not-allowed",
              disabled && !on && "opacity-60",
            )}
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
