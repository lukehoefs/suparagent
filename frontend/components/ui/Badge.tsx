import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type Tone = "neutral" | "accent" | "success" | "warning" | "danger" | "running";

// Tinted by the tone's own colour; the label always carries the meaning, never colour alone.
const TONES: Record<Tone, string> = {
  neutral: "bg-hover text-gray-on",
  accent: "bg-accent-bg text-accent-text",
  success: "bg-success-bg text-success-on",
  warning: "bg-warning-bg text-warning-on",
  danger: "bg-danger-bg text-danger-on",
  running: "bg-running-bg text-running-on",
};

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", TONES[tone], className)}>
      {children}
    </span>
  );
}
