"use client";

import * as RadixMenu from "@radix-ui/react-dropdown-menu";
import { Check, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

// A floating panel: the float shadow and no border (components/ui/Surface.tsx).
const CONTENT = "z-50 min-w-44 max-w-[calc(100vw-1rem)] animate-pop-in rounded-card bg-raised p-1 text-sm text-ink shadow-float";
const ITEM =
  "flex cursor-pointer items-center gap-2 rounded-field px-2.5 py-2 outline-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50 data-[highlighted]:bg-hover touch:py-3";

// A dropdown menu: arrow keys, type-ahead, Escape and focus return come from Radix.
export function Menu({
  trigger,
  children,
  align = "end",
  side = "bottom",
  className,
  onCloseAutoFocus,
  open,
  onOpenChange,
}: {
  trigger: ReactNode;
  children: ReactNode;
  align?: "start" | "end";
  // Where the menu opens; "top" for a trigger at the bottom of the window (the sidebar footer).
  side?: "top" | "bottom";
  className?: string;
  // Called when the menu closes and focus is about to return to the trigger. preventDefault()
  // keeps focus where it is, for an item that moves focus itself (an inline rename field).
  onCloseAutoFocus?: (event: Event) => void;
  // Optional control, for opening the menu from a right-click or the ContextMenu key.
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  return (
    <RadixMenu.Root open={open} onOpenChange={onOpenChange}>
      <RadixMenu.Trigger asChild>{trigger}</RadixMenu.Trigger>
      <RadixMenu.Portal>
        <RadixMenu.Content
          align={align}
          side={side}
          sideOffset={6}
          collisionPadding={8}
          onCloseAutoFocus={onCloseAutoFocus}
          className={cn(CONTENT, className)}
        >
          {children}
        </RadixMenu.Content>
      </RadixMenu.Portal>
    </RadixMenu.Root>
  );
}

export function MenuItem({
  onSelect,
  icon,
  children,
  danger,
  disabled,
  className,
}: {
  onSelect: () => void;
  icon?: ReactNode;
  children: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <RadixMenu.Item
      onSelect={onSelect}
      disabled={disabled}
      className={cn(ITEM, danger && "text-danger", className)}
    >
      {icon ? <span className="shrink-0" aria-hidden="true">{icon}</span> : null}
      {children}
    </RadixMenu.Item>
  );
}

export function MenuSeparator() {
  return <RadixMenu.Separator className="my-1 h-px bg-line" />;
}

// A heading inside a menu, not an item: the keyboard skips it.
export function MenuLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <RadixMenu.Label className={cn("px-2.5 pb-1 pt-1.5 text-small font-medium text-muted", className)}>{children}</RadixMenu.Label>;
}

// An item that opens a second menu beside it (ArrowRight or a click opens it, ArrowLeft closes it).
export function MenuSub({
  label,
  icon,
  hint,
  children,
  disabled,
}: {
  label: ReactNode;
  icon?: ReactNode;
  // The current value, shown quietly at the end of the item ("English").
  hint?: ReactNode;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <RadixMenu.Sub>
      <RadixMenu.SubTrigger disabled={disabled} className={cn(ITEM, "data-[state=open]:bg-hover")}>
        {icon ? <span className="shrink-0" aria-hidden="true">{icon}</span> : null}
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {hint ? <span className="shrink-0 truncate text-small text-muted">{hint}</span> : null}
        <ChevronRight size={14} aria-hidden="true" className="shrink-0 text-muted" />
      </RadixMenu.SubTrigger>
      <RadixMenu.Portal>
        <RadixMenu.SubContent sideOffset={4} collisionPadding={8} className={cn(CONTENT, "max-h-[min(24rem,calc(100dvh-1rem))] overflow-y-auto")}>
          {children}
        </RadixMenu.SubContent>
      </RadixMenu.Portal>
    </RadixMenu.Sub>
  );
}

// One choice of several (theme, language); the chosen one carries a tick.
export function MenuRadioGroup({ value, onValueChange, children, label }: { value: string; onValueChange: (value: string) => void; children: ReactNode; label?: string }) {
  return (
    <RadixMenu.RadioGroup value={value} onValueChange={onValueChange} aria-label={label}>
      {children}
    </RadixMenu.RadioGroup>
  );
}

export function MenuRadioItem({ value, icon, children, lang }: { value: string; icon?: ReactNode; children: ReactNode; lang?: string }) {
  return (
    <RadixMenu.RadioItem value={value} lang={lang} className={ITEM}>
      {icon ? <span className="shrink-0" aria-hidden="true">{icon}</span> : null}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      <span className="inline-flex size-3.5 shrink-0 items-center justify-center" aria-hidden="true">
        <RadixMenu.ItemIndicator>
          <Check size={14} />
        </RadixMenu.ItemIndicator>
      </span>
    </RadixMenu.RadioItem>
  );
}
