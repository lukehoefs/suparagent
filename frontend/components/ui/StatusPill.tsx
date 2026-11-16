import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

// The status language: colour means status and nothing else, and every status carries a word
// and a dot, never colour alone. done = finished, allowed, connected; waiting = needs you;
// denied = denied, failed, destructive; running = an agent is working; idle = neutral.
export type Status = "done" | "waiting" | "denied" | "running" | "idle";

const PILL: Record<Status, string> = {
  done: "bg-success-bg text-success-on",
  waiting: "bg-warning-bg text-warning-on",
  denied: "bg-danger-bg text-danger-on",
  running: "bg-running-bg text-running-on",
  idle: "bg-hover text-gray-on",
};

const DOT: Record<Status, string> = {
  done: "bg-success",
  waiting: "bg-warning",
  denied: "bg-danger",
  running: "bg-running",
  idle: "bg-faint",
};

const TEXT: Record<Status, string> = {
  done: "text-success",
  waiting: "text-warning",
  denied: "text-danger",
  running: "text-running",
  idle: "text-muted",
};

export function StatusDotMark({ status, pulse = false, className }: { status: Status; pulse?: boolean; className?: string }) {
  return <span aria-hidden="true" className={cn("inline-block size-2 shrink-0 rounded-full", DOT[status], pulse && "animate-pulse", className)} />;
}

// A filled pill: dot and word on the status's pale fill.
export function StatusPill({ status, children, className }: { status: Status; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-small font-medium", PILL[status], className)}>
      <StatusDotMark status={status} pulse={status === "running"} />
      {children}
    </span>
  );
}

// Dot and word on the page itself, without a fill (status lines in lists).
export function StatusText({ status, children, className }: { status: Status; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5 text-small", TEXT[status], className)}>
      <StatusDotMark status={status} pulse={status === "running"} />
      <span className="truncate">{children}</span>
    </span>
  );
}
