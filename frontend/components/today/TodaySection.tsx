import { useId, type ReactNode, type Ref } from "react";
import { cn } from "@/lib/cn";

// One section of the Today page. On a wide screen it is a card with its title in a header row
// (Today.html); on a phone the title sits above and the rows below it in their own card
// (MobileToday.html). `cards`: each row is its own card on a phone (the waiting approvals).
// `headingRef`: the heading can take focus, for when the row that had it is gone.
export function TodaySection({
  title,
  badge,
  cards = false,
  children,
  footer,
  className,
  headingRef,
}: {
  title: string;
  badge?: ReactNode;
  cards?: boolean;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  headingRef?: Ref<HTMLHeadingElement>;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className={cn("flex min-w-0 flex-col gap-4 sm:gap-0 sm:rounded-card sm:border sm:border-line sm:bg-raised", className)}>
      <div className="flex min-h-6 items-center justify-between gap-2 sm:border-b sm:border-line sm:px-4 sm:py-3.5">
        <h2 id={id} ref={headingRef} tabIndex={headingRef ? -1 : undefined} className="text-h3 font-semibold text-ink sm:text-body">{title}</h2>
        {badge}
      </div>
      <div className={cn("flex min-w-0 flex-col", !cards && "rounded-card border border-line bg-raised sm:rounded-none sm:border-0 sm:bg-transparent")}>
        {children}
      </div>
      {footer ? <div className="px-0 sm:border-t sm:border-line sm:px-4 sm:py-3">{footer}</div> : null}
    </section>
  );
}

// What a section says while it has nothing to list, or could not be read.
export function SectionNote({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "danger" }) {
  return (
    <p role={tone === "danger" ? "alert" : undefined} className={cn("px-4 py-3 text-label", tone === "danger" ? "text-danger" : "text-muted")}>
      {children}
    </p>
  );
}
