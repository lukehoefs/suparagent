"use client";

import { useState, type InputHTMLAttributes } from "react";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/use-i18n";

// A passphrase or password box with a Show / Hide control inside its right edge (screens/SignIn.html).
// The control's accessible name says what it shows ("Show passphrase"), and contains its visible word.
export function SecretInput({
  showLabel,
  hideLabel,
  className,
  ...rest
}: { showLabel: string; hideLabel: string } & Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const t = useT();
  const [reveal, setReveal] = useState(false);
  return (
    <div className="relative">
      <Input type={reveal ? "text" : "password"} className={cn("h-touch pr-16", className)} {...rest} />
      <button
        type="button"
        onClick={() => setReveal((value) => !value)}
        aria-label={reveal ? hideLabel : showLabel}
        aria-controls={rest.id}
        className="absolute inset-y-1 right-1 inline-flex cursor-pointer items-center rounded-field px-2.5 text-xs font-medium text-muted transition-colors duration-(--dur-fast) hover:bg-hover hover:text-ink touch:inset-y-0 touch:right-0 touch:px-3"
      >
        {reveal ? t("signin.hide") : t("signin.show")}
      </button>
    </div>
  );
}
