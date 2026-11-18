"use client";

import { cn } from "@/lib/cn";

// An on/off switch. The accent marks "on"; off is the toggle-off grey, which keeps 3:1 against the
// card. The label is always given (visible or as the accessible name).
export function Switch({
  checked,
  onChange,
  label,
  disabled = false,
  className,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-(--dur-fast) disabled:cursor-not-allowed disabled:opacity-50 touch:h-6 touch:w-11",
        checked ? "bg-accent" : "bg-toggle-off",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "inline-block size-4 rounded-full bg-white transition-transform duration-(--dur-fast) touch:size-5",
          checked ? "translate-x-[18px] touch:translate-x-[22px]" : "translate-x-0.5",
        )}
      />
    </button>
  );
}
