import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

// One edge language. A resting card has a hairline border and no shadow; a floating panel
// (sheet, composer, docked approval, menu) has a shadow and no border. Never both.

export const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function Card({ className, ...rest }, ref) {
  return <div ref={ref} className={cn("rounded-card border border-line bg-raised p-4", className)} {...rest} />;
});

export const Panel = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function Panel({ className, ...rest }, ref) {
  return <div ref={ref} className={cn("rounded-card bg-raised p-4 shadow-float", className)} {...rest} />;
});
