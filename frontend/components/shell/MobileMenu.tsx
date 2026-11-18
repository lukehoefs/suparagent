"use client";

import * as RadixDialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useRef, type ReactNode } from "react";
import { useT } from "@/lib/use-i18n";

/**
 * The phone menu (design: MobileMenu.html): a sheet that rises from the bottom over the page,
 * holding the sidebar's phone layout (<Sidebar sheet />): what waits for you, the pinned agents,
 * the "Go to" tiles, the conversations and who is signed in. A floating panel: shadow, no border,
 * on the page's own background. Radix gives the focus trap and Escape; the Close button at the top
 * (first in the focus order, 44 px) is the way out for touch, screen-reader and switch users, who
 * have no Escape key and cannot reach the dimmed page. A tap on the dimmed page closes it too, and
 * focus goes back to whatever opened it.
 */
export function MobileMenu({
  open,
  onOpenChange,
  label,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Read by screen readers as the sheet's name.
  label: string;
  children: ReactNode;
}) {
  const t = useT();
  const opener = useRef<HTMLElement | null>(null);
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        {/* The design dims the page by half (MobileMenu.html); dark keeps the deeper scrim. */}
        <RadixDialog.Overlay className="fixed inset-0 z-40 animate-fade-in bg-[rgb(0_0_0/0.5)] dark:bg-scrim" />
        <RadixDialog.Content
          aria-describedby={undefined}
          onOpenAutoFocus={() => { opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; }}
          onCloseAutoFocus={(event) => { event.preventDefault(); opener.current?.focus(); }}
          className="fixed inset-x-0 bottom-0 z-50 flex max-h-[calc(100dvh-env(safe-area-inset-top)-1rem)] animate-sheet-in flex-col rounded-t-[28px] bg-surface text-ink shadow-float outline-none"
        >
          <RadixDialog.Title className="sr-only">{label}</RadixDialog.Title>
          {/* The grab handle is drawn only; the Close button beside it is the control. */}
          <div className="relative flex shrink-0 justify-end px-2 pt-1.5">
            <span aria-hidden="true" className="absolute left-1/2 top-2.5 h-1 w-10 -translate-x-1/2 rounded-full bg-line-strong" />
            <RadixDialog.Close
              aria-label={t("common.close")}
              className="inline-flex size-11 cursor-pointer items-center justify-center rounded-field text-muted transition-colors duration-(--dur-fast) hover:bg-hover hover:text-ink"
            >
              <X size={20} strokeWidth={1.7} aria-hidden="true" />
            </RadixDialog.Close>
          </div>
          <div className="min-h-0 overflow-y-auto overscroll-contain px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-1">
            {children}
          </div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
