"use client";

// Small pieces the Routines page shares: the reader's language, the error text, a disclosure
// ("More settings") and the width hook that decides whether the panel sits beside the list.
import { ChevronDown } from "lucide-react";
import { useCallback, useEffect, useId, useState, type ReactNode, type RefObject } from "react";
import { ApiError } from "@/lib/api";
import { resolveLocale } from "@/lib/i18n";
import { useLanguageChoice, useT } from "@/lib/use-i18n";
import { cn } from "@/lib/cn";

export function useLocale(): string {
  return resolveLocale(useLanguageChoice());
}

/**
 * The server's own message when it answered with one, otherwise the plain fallback (a network
 * failure's browser text, "Failed to fetch", is not shown).
 */
export function useErrorText() {
  const t = useT();
  return useCallback((err: unknown, fallbackKey = "routines.error.generic") => (
    err instanceof ApiError && err.message ? err.message : t(fallbackKey)
  ), [t]);
}

/**
 * A labelled section that opens and closes. Its content stays mounted, so fields keep their values.
 * It opens and closes itself, or follows `open` when the caller holds it (to open it on a problem).
 */
export function Disclosure({
  title,
  defaultOpen = false,
  open: heldOpen,
  onOpenChange,
  children,
  className,
}: {
  title: string;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
  className?: string;
}) {
  const id = useId();
  const [ownOpen, setOwnOpen] = useState(defaultOpen);
  const open = heldOpen ?? ownOpen;
  const toggle = () => {
    if (heldOpen === undefined) setOwnOpen(!open);
    onOpenChange?.(!open);
  };
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={toggle}
        className="inline-flex h-7 cursor-pointer items-center gap-1.5 self-start rounded-field text-small font-medium text-muted hover:text-ink touch:h-11"
      >
        <ChevronDown size={13} aria-hidden="true" className={cn("transition-transform duration-(--dur-fast)", open ? "rotate-0" : "-rotate-90")} />
        {title}
      </button>
      <div id={id} hidden={!open} className="flex flex-col gap-3">{children}</div>
    </div>
  );
}

/** The element's width, followed as it changes; null until it has been measured. */
export function useWidth(ref: RefObject<HTMLElement | null>): number | null {
  const [width, setWidth] = useState<number | null>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setWidth(Math.round(entry.contentRect.width));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}
