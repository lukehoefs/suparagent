"use client";

// The open routine's panel (design: Routines.html): beside the list on a wide page, a sheet over
// it on a narrow one. It is one element in both, only styled differently, so crossing the width
// (a window snapped to half the screen, the sidebar dragged wider, zoom) keeps everything inside
// mounted: the editor's draft, a webhook secret just made, what is open. As a sheet it is a modal
// dialog: a scrim behind it, Escape and the scrim close it, Tab stays inside it, and focus moves in
// when it becomes one.
import { X } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { cn } from "@/lib/cn";
import { panelRoom } from "@/lib/routines-page";
import { IconButton } from "@/components/ui/IconButton";

const FOCUSABLE = 'a[href], button, input:not([type="hidden"]), select, textarea, summary, [tabindex], [contenteditable="true"]';

// The nearest ancestor that scrolls (the app's main area), whose bottom is where the panel must end.
function scrollParent(element: HTMLElement): HTMLElement | null {
  for (let node = element.parentElement; node && node !== document.body; node = node.parentElement) {
    if (/(auto|scroll)/.test(getComputedStyle(node).overflowY)) return node;
  }
  return null;
}

// What Tab can reach inside the panel, in order: enabled, shown, and in the tab order.
function tabbable(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((element) => (
    element.tabIndex >= 0
    && !element.matches(":disabled")
    && !element.closest("[inert]")
    && element.getClientRects().length > 0
  ));
}

// Beside the list: it stays in view while the list scrolls, and it is as tall as the room below
// its own top (--panel-room, measured), so its Save bar is in view as soon as the page opens. It
// stays solid there: nothing passes under it. As a sheet: from the bottom on a phone, a centred
// card from the small breakpoint up (as the app's dialogs are), in frosted glass over the page.
// The glass is on this outer layer only; the body inside scrolls.
const BESIDE = "sticky top-4 max-h-[var(--panel-room,calc(100dvh_-_2rem))] w-[clamp(340px,35%,420px)] shrink-0 rounded-card bg-raised shadow-float";
const SHEET = "fixed inset-x-0 bottom-0 z-40 max-h-[92dvh] animate-sheet-in rounded-t-card glass-strong pb-[env(safe-area-inset-bottom)] sm:inset-auto sm:left-1/2 sm:top-1/2 sm:max-h-[85dvh] sm:w-[calc(100vw-2rem)] sm:max-w-xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:animate-pop-in sm:rounded-card sm:pb-0";

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

  // Beside the list, the panel ends 16 px above the bottom of what can be seen: the room below its
  // top is measured when it opens and again as the page scrolls (it then sticks 16 px from the
  // top), the window resizes, or what is above it changes height (a banner, a wrapped header).
  useLayoutEffect(() => {
    const element = panel.current;
    if (sheet || !element) return;
    const scroller = scrollParent(element);
    let frame = 0;
    const measure = () => {
      frame = 0;
      const bottom = Math.min(window.innerHeight, scroller?.getBoundingClientRect().bottom ?? window.innerHeight);
      element.style.setProperty("--panel-room", `${panelRoom(element.getBoundingClientRect().top, bottom)}px`);
    };
    const later = () => { if (!frame) frame = window.requestAnimationFrame(measure); };
    measure();
    window.addEventListener("resize", later);
    // Scroll events do not bubble: caught on the way down, from the main area or any other scroller.
    document.addEventListener("scroll", later, { capture: true, passive: true });
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(later);
    for (let node = element.parentElement; node && node !== document.body; node = node.parentElement) observer?.observe(node);
    return () => {
      window.removeEventListener("resize", later);
      document.removeEventListener("scroll", later, { capture: true });
      observer?.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
      element.style.removeProperty("--panel-room");
    };
  }, [sheet]);

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
          className="fixed inset-0 z-40 animate-fade-in glass-scrim"
        />
      )}
      <div
        ref={panel}
        role={sheet ? "dialog" : "complementary"}
        aria-modal={sheet ? true : undefined}
        aria-labelledby={subtitle && !sheet ? `${titleId} ${subtitleId}` : titleId}
        aria-describedby={sheet && subtitle ? subtitleId : undefined}
        // A click on the panel's plain text keeps focus inside it, so Tab and Escape still work.
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className={cn("flex flex-col text-ink outline-none", sheet ? SHEET : BESIDE)}
      >
        {/* As the design: the 36 px close button sits inside the 18 px padding and the title is
            centred on it; the first field follows 14 px below. */}
        <div className="flex shrink-0 items-center justify-between gap-3 px-[18px] pt-[18px]">
          <div className="min-w-0">
            <h2 id={titleId} ref={headingRef} tabIndex={-1} className="text-h3 font-semibold text-ink outline-none">{title}</h2>
            {/* Beside the list the open routine's card is outlined, so its name is said only to a
                screen reader there; over the list (a sheet) the card is hidden, so it shows. */}
            {subtitle && <p id={subtitleId} className={cn("truncate text-small text-muted", sheet ? "mt-0.5" : "sr-only")}>{subtitle}</p>}
          </div>
          <IconButton label={closeLabel} onClick={onClose}>
            <X size={16} strokeWidth={1.7} aria-hidden="true" />
          </IconButton>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-[18px] pb-1 pt-3.5">{children}</div>
      </div>
    </>
  );
}
