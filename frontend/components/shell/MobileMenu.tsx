"use client";

import * as RadixDialog from "@radix-ui/react-dialog";
import { useRef, type ReactNode } from "react";

/**
 * The phone menu (design: MobileMenu.html): a sheet that rises from the bottom over the page,
 * holding the sidebar's phone layout (<Sidebar sheet />): what waits for you, the pinned agents,
 * the "Go to" tiles and who is signed in. A floating panel: shadow, no border, on the page's own
 * background. Radix gives the focus trap and Escape; a tap on the dimmed page closes it, and focus
 * goes back to whatever opened it.
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
          <span aria-hidden="true" className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-line-strong" />
          <div className="min-h-0 overflow-y-auto overscroll-contain px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3.5">
            {children}
          </div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
