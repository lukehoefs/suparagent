"use client";

// The open routine's panel (design: Routines.html): beside the list on a wide page, a sheet over
// it on a narrow one. It is one element in both, only styled differently, so crossing the width
// (a window snapped to half the screen, the sidebar dragged wider, zoom) keeps everything inside
// mounted: the editor's draft, a webhook secret just made, what is open. As a sheet it is a modal
// dialog: a scrim behind it, Escape and the scrim close it, Tab stays inside it, and focus moves in
// when it becomes one.
import { X } from "lucide-react";
import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { cn } from "@/lib/cn";
import { IconButton } from "@/components/ui/IconButton";

const FOCUSABLE = 'a[href], button, input:not([type="hidden"]), select, textarea, summary, [tabindex], [contenteditable="true"]';

// What Tab can reach inside the panel, in order: enabled, shown, and in the tab order.
function tabbable(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((element) => (
    element.tabIndex >= 0
    && !element.matches(":disabled")
    && !element.closest("[inert]")
    && element.getClientRects().length > 0
  ));
}

// Beside the list: it stays in view while the list scrolls. As a sheet: from the bottom on a
// phone, a centred card from the small breakpoint up (as the app's dialogs are).
const BESIDE = "sticky top-4 max-h-[calc(100dvh-2rem)] w-[clamp(340px,38%,420px)] shrink-0 rounded-card";
const SHEET = "fixed inset-x-0 bottom-0 z-40 max-h-[92dvh] animate-sheet-in rounded-t-card pb-[env(safe-area-inset-bottom)] sm:inset-auto sm:left-1/2 sm:top-1/2 sm:max-h-[85dvh] sm:w-[calc(100vw-2rem)] sm:max-w-xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:animate-pop-in sm:rounded-card sm:pb-0";

export function RoutinePanel({
  sheet,
  title,
  subtitle,
  closeLabel,
  headingRef,
  onClose,
  children,
}: {
  sheet: boolean;
  title: string;
  subtitle?: string | null;
  closeLabel: string;
  // The panel's heading, which the page focuses when the panel opens or shows another routine.
  headingRef: RefObject<HTMLHeadingElement | null>;
  onClose: () => void;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const scrim = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const subtitleId = useId();

  // A sheet is modal: when the panel becomes one with focus outside it (a card), focus moves in.
  useEffect(() => {
    if (sheet && !panel.current?.contains(document.activeElement)) headingRef.current?.focus({ preventScroll: true });
  }, [sheet, headingRef]);

  // The page behind a sheet does not scroll under the scrim (the sheet itself keeps its scroll).
  useEffect(() => {
    const element = scrim.current;
    if (!sheet || !element) return;
    const stop = (event: Event) => event.preventDefault();
    element.addEventListener("wheel", stop, { passive: false });
    element.addEventListener("touchmove", stop, { passive: false });
    return () => {
      element.removeEventListener("wheel", stop);
      element.removeEventListener("touchmove", stop);
    };
  }, [sheet]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const root = panel.current;
    // Keys from a dialog opened inside (its portal is not in the panel) are that dialog's own.
    if (!root || !(event.target instanceof Node) || !root.contains(event.target)) return;
    if (event.key === "Escape" && !event.defaultPrevented) {
      event.preventDefault();
      onClose();
      return;
    }
    if (!sheet || event.key !== "Tab") return;
    const items = tabbable(root);
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) {
      event.preventDefault();
      return;
    }
    const active = document.activeElement as HTMLElement | null;
    // From the first control, or from the heading or the panel itself (not in the tab order), Shift+Tab goes round to the last.
    if (event.shiftKey && (active === first || !active || !items.includes(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <>
      {sheet && (
        <div
          ref={scrim}
          aria-hidden="true"
          // Focus stays where it is (inside the sheet) while the scrim's click asks to close.
          onMouseDown={(event) => event.preventDefault()}
          onClick={onClose}
          className="fixed inset-0 z-40 animate-fade-in bg-scrim"
        />
      )}
      <div
        ref={panel}
        role={sheet ? "dialog" : "complementary"}
        aria-modal={sheet ? true : undefined}
        aria-labelledby={titleId}
        aria-describedby={sheet && subtitle ? subtitleId : undefined}
        // A click on the panel's plain text keeps focus inside it, so Tab and Escape still work.
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className={cn("flex flex-col bg-raised text-ink shadow-float outline-none", sheet ? SHEET : BESIDE)}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 px-[18px] pt-[18px]">
          <div className="min-w-0">
            <h2 id={titleId} ref={headingRef} tabIndex={-1} className="text-h3 font-semibold text-ink outline-none">{title}</h2>
            {subtitle && <p id={subtitleId} className="mt-0.5 truncate text-small text-muted">{subtitle}</p>}
          </div>
          <IconButton label={closeLabel} onClick={onClose} className="-mr-2 -mt-1.5">
            <X size={16} aria-hidden="true" />
          </IconButton>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-[18px] pb-1 pt-3">{children}</div>
      </div>
    </>
  );
}
