import Link from "next/link";
import type { MouseEvent, ReactNode } from "react";
import { cn } from "@/lib/cn";

// A real link that looks like ui/Button (same classes), for actions that navigate: it opens in a new
// tab and reads as a link to assistive tech. Kept in step with components/ui/Button.tsx by hand.
const BASE =
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-field font-medium transition-colors duration-(--dur-fast) h-control px-3 text-label touch:h-touch";

const VARIANTS = {
  primary: "bg-accent text-accent-fg hover:opacity-90",
  secondary: "border border-line bg-raised text-ink hover:bg-hover",
  ghost: "text-ink hover:bg-hover",
} as const;

export function LinkButton({
  href,
  variant = "secondary",
  onClick,
  className,
  children,
}: {
  href: string;
  variant?: keyof typeof VARIANTS;
  // Call event.preventDefault() to stop the navigation (an unsaved-changes guard).
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} onClick={onClick} className={cn(BASE, VARIANTS[variant], className)}>
      {children}
    </Link>
  );
}
