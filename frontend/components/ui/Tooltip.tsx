"use client";

import * as RadixTooltip from "@radix-ui/react-tooltip";
import type { ReactElement } from "react";

// Hover and keyboard-focus hint. It never opens on touch screens, so nothing may depend on it:
// anything it says must also be in the control's accessible name. Ink on a frosted panel, no longer
// inverted; it is portaled, so it is never inside another glass layer.
export function Tooltip({
  content,
  children,
  side = "top",
}: {
  content: string;
  children: ReactElement;
  side?: "top" | "bottom" | "left" | "right";
}) {
  return (
    <RadixTooltip.Provider delayDuration={200} skipDelayDuration={150}>
      <RadixTooltip.Root>
        <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
        <RadixTooltip.Portal>
          <RadixTooltip.Content
            side={side}
            sideOffset={6}
            className="z-50 max-w-64 animate-fade-in rounded-field glass-strong px-2.5 py-1 text-xs font-medium text-ink"
          >
            {content}
          </RadixTooltip.Content>
        </RadixTooltip.Portal>
      </RadixTooltip.Root>
    </RadixTooltip.Provider>
  );
}
