"use client";

import { useEffect, useRef, useState, type InputHTMLAttributes } from "react";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/use-i18n";

// Space left between the last typed character and the Show / Hide control.
const GAP_PX = 4;

// A passphrase or password box with a Show / Hide control inside its right edge (screens/SignIn.html).
// The control's accessible name says what it shows ("Show passphrase"), and contains its visible word.
export function SecretInput({
  showLabel,
  hideLabel,
  className,
  style,
  ...rest
}: { showLabel: string; hideLabel: string } & Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const t = useT();
  const [reveal, setReveal] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  // The input keeps clear of the control: its right padding runs from the control's left edge to the
  // box's right edge, so typed text never sits under "Ausblenden" or "Показать". The control is as
  // wide as the longer of its two words, so the padding does not jump when it is pressed. Until it is
  // measured, pr-24 covers the longest word in the catalog.
  const [reserve, setReserve] = useState<number | null>(null);

  useEffect(() => {
    const box = boxRef.current;
    const button = buttonRef.current;
    if (!box || !button || typeof ResizeObserver === "undefined") return;
    // Reports once when it starts, then on every size change: a font loading, a touch screen's padding.
    const observer = new ResizeObserver(() => {
      setReserve(Math.ceil(box.getBoundingClientRect().right - button.getBoundingClientRect().left) + GAP_PX);
    });
    observer.observe(button);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={boxRef} className="relative">
      <Input
        type={reveal ? "text" : "password"}
        className={cn("h-touch pr-24", className)}
        style={reserve === null ? style : { ...style, paddingRight: reserve }}
        {...rest}
      />
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setReveal((value) => !value)}
        aria-label={reveal ? hideLabel : showLabel}
        aria-controls={rest.id}
        className="absolute inset-y-1 right-1 inline-flex cursor-pointer items-center rounded-field px-2.5 text-label font-medium whitespace-nowrap text-muted transition-colors duration-(--dur-fast) hover:bg-hover hover:text-ink touch:inset-y-0 touch:right-0 touch:px-3"
      >
        <span className="grid justify-items-center">
          <span className={cn("col-start-1 row-start-1", reveal && "invisible")}>{t("signin.show")}</span>
          <span className={cn("col-start-1 row-start-1", !reveal && "invisible")}>{t("signin.hide")}</span>
        </span>
      </button>
    </div>
  );
}
