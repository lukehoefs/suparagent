import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { BUTTON_BASE, SIZES, VARIANTS, type ButtonSize, type ButtonVariant } from "./Button";

// A real link with the look of ui/Button (same classes, imported, not copied), for a control that
// moves to another page: it keeps middle-click, copy address and open-in-new-tab, and reads as a
// link to assistive tech.
export function LinkButton({
  variant = "secondary",
  size = "md",
  icon,
  className,
  children,
  ...rest
}: ComponentProps<typeof Link> & { variant?: Exclude<ButtonVariant, "danger">; size?: ButtonSize; icon?: ReactNode; children: ReactNode }) {
  return (
    <Link className={cn(BUTTON_BASE, VARIANTS[variant], SIZES[size], className)} {...rest}>
      {icon ? <span aria-hidden="true" className="inline-flex shrink-0">{icon}</span> : null}
      {children}
    </Link>
  );
}
