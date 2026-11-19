"use client";

import * as RadixTabs from "@radix-ui/react-tabs";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export const Tabs = RadixTabs.Root;

// How far the strip fades out at an edge that has more tabs past it.
const FADE = "24px";

// The tab strip scrolls sideways instead of wrapping or overflowing a narrow screen.
// `w-0 min-w-full` makes it contribute no intrinsic width, so a long strip cannot widen a
// shrink-wrapped parent (for example a centered `mx-auto` column) past the screen. The scrollbar is
// hidden, so an edge with more tabs past it fades out: a tab cut at the edge reads as "scroll for
// more", not as a clipped word. The open tab is scrolled into view when it changes.
export function TabList({ children, label }: { children: ReactNode; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState({ left: false, right: false });

  useEffect(() => {
    const strip = ref.current;
    if (!strip) return;
    const measure = () => {
      const left = strip.scrollLeft > 1;
      const right = strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 1;
      setMore((current) => (current.left === left && current.right === right ? current : { left, right }));
    };
    const reveal = () => {
      const open = strip.querySelector<HTMLElement>('[role="tab"][data-state="active"]');
      if (!open) return;
      // The strip is positioned, so a tab's offsetLeft is measured from the strip's own start.
      const start = open.offsetLeft;
      const end = start + open.offsetWidth;
      if (start < strip.scrollLeft) strip.scrollLeft = start;
      else if (end > strip.scrollLeft + strip.clientWidth) strip.scrollLeft = end - strip.clientWidth;
    };
    reveal();
    measure();
    const resized = new ResizeObserver(measure);
    resized.observe(strip);
    // The open tab changes (data-state), and tabs come and go (an unsaved-changes dot, a tab shown
    // only to admins): bring the open one into view and measure again.
    const changed = new MutationObserver(() => { reveal(); measure(); });
    changed.observe(strip, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-state"] });
    strip.addEventListener("scroll", measure, { passive: true });
    return () => {
      resized.disconnect();
      changed.disconnect();
      strip.removeEventListener("scroll", measure);
    };
  }, []);

  const mask = more.left || more.right
    ? `linear-gradient(to right, ${more.left ? "transparent" : "black"}, black ${FADE}, black calc(100% - ${FADE}), ${more.right ? "transparent" : "black"})`
    : undefined;

  return (
    <RadixTabs.List
      ref={ref}
      aria-label={label}
      style={mask ? { maskImage: mask, WebkitMaskImage: mask } : undefined}
      className="relative flex w-0 min-w-full gap-1 overflow-x-auto border-b border-line [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {children}
    </RadixTabs.List>
  );
}

export function Tab({ value, children }: { value: string; children: ReactNode }) {
  return (
    <RadixTabs.Trigger
      value={value}
      className={cn(
        "-mb-px shrink-0 cursor-pointer border-b-2 border-transparent px-3 py-2 text-sm text-muted transition-colors duration-(--dur-fast) hover:text-ink touch:py-3",
        "data-[state=active]:border-accent data-[state=active]:text-ink",
      )}
    >
      {children}
    </RadixTabs.Trigger>
  );
}

export const TabPanel = RadixTabs.Content;
