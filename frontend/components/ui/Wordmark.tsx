import { cn } from "@/lib/cn";

// The wordmark is always lowercase "lukethomas" in Inter 300 with -0.04em tracking. There is no logo mark.
export function Wordmark({ className }: { className?: string }) {
  return <span className={cn("wordmark text-[20px] leading-6 text-ink", className)}>lukethomas</span>;
}
