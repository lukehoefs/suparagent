import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost";

// The same look as ui/Button (36 px, 13 px medium, the three variants) for a control that moves to
// another page, so it stays a real link: middle-click, copy address, and no client state needed.
const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-accent-fg hover:opacity-90",
  secondary: "border border-line bg-raised text-ink hover:bg-hover",
  ghost: "text-muted hover:bg-hover hover:text-ink",
};

export function LinkButton({
  variant = "secondary",
  icon,
  className,
  children,
  ...rest
}: ComponentProps<typeof Link> & { variant?: Variant; icon?: ReactNode; children: ReactNode }) {
  return (
    <Link
      className={cn(
        "inline-flex h-control shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-field px-3 text-label font-medium transition-colors duration-(--dur-fast) touch:h-touch",
        VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {icon ? <span aria-hidden="true" className="inline-flex shrink-0">{icon}</span> : null}
      {children}
    </Link>
  );
}
