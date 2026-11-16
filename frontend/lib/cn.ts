import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// tailwind-merge must know the theme's own sizes (app/globals.css `@theme`), or it reads
// `text-label` as a colour and drops it next to `text-muted`, and `h-control` as unknown.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["caption", "small", "label", "body", "title", "h1", "h2", "h3", "heading", "chat"],
      spacing: ["control-sm", "control-md", "control", "touch"],
      radius: ["field", "card", "pill", "inner", "chat"],
      shadow: ["card", "pop", "float"],
    },
  },
});

// Joins class names and lets the last Tailwind utility win ("p-2" then "p-4" is "p-4").
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
