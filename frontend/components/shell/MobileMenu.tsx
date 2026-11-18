"use client";

import * as RadixDialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { createContext, useContext, useRef, type ReactNode } from "react";
import { useT } from "@/lib/use-i18n";

// True inside the sheet. The sheet is frosted glass (a backdrop filter), so a panel that opens in
// place inside it (the workspace switcher's list) stays solid: a second backdrop filter there would
// blur only the sheet itself. Portaled menus and tooltips render at the page level, unaffected.
const InSheet = createContext(false);
export const useInSheet = () => useContext(InSheet);

/**
 * The phone menu (design: MobileMenu.html): a sheet that rises from the bottom over the page,
 * holding the sidebar's phone layout (<Sidebar sheet />): what waits for you, the pinned agents,
 * the "Go to" tiles, the conversations and who is signed in. A floating panel of frosted glass
 * (glass-strong: the dimmed page shows through, blurred, under a light edge and the soft float
 * shadow), no border. Radix gives the focus trap and Escape; the Close button at the top
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
        {/* The shared frosted scrim: the page dims and blurs a little behind the sheet. */}
        <RadixDialog.Overlay className="fixed inset-0 z-40 animate-fade-in glass-scrim" />
        <RadixDialog.Content
          aria-describedby={undefined}
          onOpenAutoFocus={() => { opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; }}
          onCloseAutoFocus={(event) => { event.preventDefault(); opener.current?.focus(); }}
          className="fixed inset-x-0 bottom-0 z-50 flex max-h-[calc(100dvh-env(safe-area-inset-top)-1rem)] animate-sheet-in flex-col rounded-t-[28px] glass-strong text-ink outline-none"
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
            <InSheet.Provider value={true}>{children}</InSheet.Provider>
          </div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
