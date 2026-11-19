import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type HeadingLevel = 2 | 3 | 4;

// The card around a whole page's empty state (Tasks, Results, Routines): no wider than a short
// paragraph and centred, so a wide window does not stretch a few words across a long empty band.
export const EMPTY_PAGE_CARD = "mx-auto w-full max-w-xl";

// Centered "nothing here yet" or "can't do that here" block: icon, one line of what, one of why/next,
// then the actions in a row (design: States, "Agents: none yet", "Tasks: all clear").
export function EmptyState({
  icon,
  title,
  description,
  action,
  compact = false,
  tone = "neutral",
  headingLevel = 2,
  className,
}: {
  // An icon or a picture such as an agent's avatar. Decorative: the title says what this is.
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  // One control or several (a fragment); they wrap and stay centred. Keep to one primary.
  action?: ReactNode;
  // Tighter type and spacing for narrow lists such as the sidebar.
  compact?: boolean;
  // "done" colours the icon green, for an all-clear such as "Nothing waiting for you".
  tone?: "neutral" | "done";
  // The title's heading level; 2 by default, deeper when the block sits under a section heading.
  headingLevel?: HeadingLevel;
  className?: string;
}) {
  const Heading = `h${headingLevel}` as "h2" | "h3" | "h4";
  return (
    <div className={cn("flex flex-col items-center justify-center text-center", compact ? "gap-1.5 px-3 py-3" : "gap-3 px-6 py-10", className)}>
      {icon ? <div aria-hidden="true" className={cn("inline-flex", tone === "done" ? "text-success" : "text-muted")}>{icon}</div> : null}
      <Heading className={cn("font-semibold text-ink", compact ? "text-body" : "text-h3")}>{title}</Heading>
      {description ? <p className={cn("max-w-70 text-muted", compact ? "text-small" : "text-body")}>{description}</p> : null}
      {action ? <div className={cn("flex flex-wrap items-center justify-center gap-2", compact && "mt-0.5")}>{action}</div> : null}
    </div>
  );
}
