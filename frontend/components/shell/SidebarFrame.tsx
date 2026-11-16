"use client";

import { useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/use-i18n";
import {
  SIDEBAR_DEFAULT,
  SIDEBAR_MAX,
  SIDEBAR_MIN,
  dragTo,
  loadSidebarSize,
  saveSidebarSize,
  shownWidth,
  toggleRail,
  type SidebarSize,
} from "@/lib/sidebar-width";

const KEY_STEP = 16;

// The inline sidebar's column: drag its right edge to resize (200 to 420 px), drag below 150 px to
// snap to the 72 px rail, double-click the edge (or press Enter on it) to toggle. Arrow keys resize.
export function SidebarFrame({ children }: { children: (rail: boolean) => ReactNode }) {
  const t = useT();
  // The chat page renders only in the browser (after the sign-in check), so the saved size can be read at once.
  const [size, setSize] = useState<SidebarSize>(() => (typeof window === "undefined" ? { rail: false, width: SIDEBAR_DEFAULT } : loadSidebarSize()));
  const [dragging, setDragging] = useState(false);
  // Where a drag began: the pointer, the width on screen, and the full width to come back to from the rail.
  const start = useRef<{ x: number; shown: number; restore: number } | null>(null);

  const update = (next: SidebarSize) => {
    setSize(next);
    saveSidebarSize(next);
  };

  const width = shownWidth(size);
  return (
    <aside
      style={{ width }}
      className={cn("relative shrink-0 border-r border-line bg-app", !dragging && "transition-[width] duration-(--dur-base) ease-(--ease-ui)")}
    >
      {children(size.rail)}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={t("sidebar.resize")}
        aria-valuemin={SIDEBAR_MIN}
        aria-valuemax={SIDEBAR_MAX}
        aria-valuenow={width}
        tabIndex={0}
        title={t("sidebar.resizeHint")}
        onPointerDown={(event) => {
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          start.current = { x: event.clientX, shown: width, restore: size.rail ? size.width : width };
          setDragging(true);
        }}
        onPointerMove={(event) => {
          if (!start.current) return;
          const from = start.current;
          setSize((current) => {
            const next = dragTo(from.shown + event.clientX - from.x, current);
            // Snapping to the rail keeps the full width the drag started from, for the way back.
            return next.rail ? { rail: true, width: from.restore } : next;
          });
        }}
        onPointerUp={(event) => {
          if (!start.current) return;
          event.currentTarget.releasePointerCapture(event.pointerId);
          start.current = null;
          setDragging(false);
          setSize((current) => {
            saveSidebarSize(current);
            return current;
          });
        }}
        onDoubleClick={() => update(toggleRail(size))}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            update(toggleRail(size));
          } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault();
            update(dragTo(width + (event.key === "ArrowRight" ? KEY_STEP : -KEY_STEP), size));
          }
        }}
        className="group absolute inset-y-0 -right-1 z-10 w-2 cursor-col-resize touch-none focus-visible:outline-none"
      >
        <span
          aria-hidden="true"
          className={cn(
            "absolute right-[3px] top-1/2 h-9 w-[3px] -translate-y-1/2 rounded-full bg-line transition-colors group-hover:bg-line-strong group-focus-visible:bg-accent",
            dragging && "bg-accent",
          )}
        />
      </div>
    </aside>
  );
}
