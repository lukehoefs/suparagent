import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

// One edge language, three materials:
// - Content is solid. A resting card (Card) has a hairline border and no shadow; so do tables,
//   list rows, fields and the transcript.
// - What floats over content is frosted glass: menus, popovers, tooltips, toasts, dialogs, sheets,
//   drawers, the palette, slide-over panels, the composer and floating action bars. `glass-strong`
//   (or plain `glass` for small controls with ink text only) brings a translucent fill, a backdrop
//   blur, a light inner edge (a highlight, not a border) and the soft float shadow. No border.
//   Where nothing behind it is worth frosting (the pinned composer, a full-window dialog) or
//   something live is inside it (a computer's screen), `glass-solid` keeps the edge and shadow on a
//   solid fill with no blur.
// - Chrome that frames the page is glass too: `glass-chrome` for bars that content scrolls under
//   (the chat's top bar, sticky page headers), which keep their hairline as the separator and take
//   the page colour until something is under them, and `glass-canvas` for the sidebar and the phone
//   app bar, on the canvas's soft blue-grey wash.
// The tokens, utilities and solid fallbacks are in app/globals.css (dial the glass there, then run
// scripts/check-contrast.mjs). Never put a glass layer inside another or on a scroll container;
// panels that open in place inside glass stay solid. Panel below is the solid floating panel for
// those, and for panels beside content that nothing passes under. Never both border and shadow.

export const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function Card({ className, ...rest }, ref) {
  return <div ref={ref} className={cn("rounded-card border border-line bg-raised p-4", className)} {...rest} />;
});

export const Panel = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function Panel({ className, ...rest }, ref) {
  return <div ref={ref} className={cn("rounded-card bg-raised p-4 shadow-float", className)} {...rest} />;
});
