import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

// One look for every block on a Settings page (design: WorkspaceSettings.html): a card with a
// hairline border and no shadow, a header (title, a line of help, an optional action on the right)
// on its own hairline, and the rows below it.
export function SettingsCard({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section aria-label={title} className={cn("flex min-w-0 flex-col rounded-card border border-line bg-raised", className)}>
      <div className={cn("flex flex-wrap items-start justify-between gap-3 px-4 py-4 sm:px-5", children ? "border-b border-line" : null)}>
        <div className="min-w-0 flex-1">
          {/* h3: the open page's own title (SettingsShell) is the h2 above every card. */}
          <h3 className="text-h3 font-semibold text-ink">{title}</h3>
          {description ? <p className="mt-0.5 text-small text-muted">{description}</p> : null}
        </div>
        {action}
      </div>
      {children ? <div className="flex min-w-0 flex-col gap-3.5 p-4 sm:p-5">{children}</div> : null}
    </section>
  );
}
