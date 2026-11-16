import { Check } from "lucide-react";
import { cn } from "@/lib/cn";

// A progress indicator for a short wizard. Ordered list, current step marked with aria-current="step";
// done and upcoming steps are named for screen readers, so state is never colour alone.
export function Stepper({
  steps,
  current,
  label = "Setup progress",
  className,
  variant = "bar",
}: {
  steps: readonly string[];
  current: number;
  label?: string;
  className?: string;
  // "inline" is the design system's compact row (New agent): numbered dots and names, done ones ticked.
  variant?: "bar" | "inline";
}) {
  if (variant === "inline") {
    return (
      <ol aria-label={label} className={cn("flex flex-wrap items-center gap-5", className)}>
        {steps.map((name, index) => {
          const done = index < current;
          const active = index === current;
          return (
            <li key={name} aria-current={active ? "step" : undefined} className="flex items-center gap-2 text-label font-medium">
              <span
                aria-hidden="true"
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full text-small font-semibold transition-colors duration-(--dur-base) motion-reduce:transition-none",
                  done && "bg-accent-bg text-accent-text",
                  active && "bg-accent text-accent-fg",
                  !done && !active && "bg-hover text-muted",
                )}
              >
                {done ? <Check size={13} strokeWidth={2.5} /> : index + 1}
              </span>
              <span className={active ? "text-ink" : "text-muted"}>
                {name}
                <span className="sr-only">{done ? " (done)" : active ? " (current step)" : " (not started)"}</span>
              </span>
            </li>
          );
        })}
      </ol>
    );
  }
  return (
    <ol aria-label={label} className={cn("flex items-start", className)}>
      {steps.map((name, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <li key={name} aria-current={active ? "step" : undefined} className="flex min-w-0 flex-1 flex-col gap-1.5 last:flex-none">
            <div className="flex items-center">
              <span
                aria-hidden="true"
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium transition-colors duration-(--dur-base) motion-reduce:transition-none",
                  done && "border-accent bg-accent text-accent-fg",
                  active && "border-accent text-accent-text",
                  !done && !active && "border-line text-faint",
                )}
              >
                {done ? <Check size={13} /> : index + 1}
              </span>
              {index < steps.length - 1 ? (
                <span aria-hidden="true" className="mx-2 h-0.5 flex-1 overflow-hidden rounded-full bg-line">
                  <span className={cn("block h-full bg-accent transition-[width] duration-(--dur-base) ease-(--ease-ui) motion-reduce:transition-none", done ? "w-full" : "w-0")} />
                </span>
              ) : null}
            </div>
            <span className={cn("pr-2 text-xs", active ? "font-semibold text-ink" : "text-muted")}>
              {name}
              <span className="sr-only">{done ? " (done)" : active ? " (current step)" : " (not started)"}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
