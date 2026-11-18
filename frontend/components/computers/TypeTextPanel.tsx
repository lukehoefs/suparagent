"use client";

// The live view's Clipboard panel (design: Computers.html, the toolbar's Clipboard button): text put
// here is typed on the computer, key by key. The desktop stream carries no clipboard of its own
// (lib/desktop-rfb.ts), so this is how text is pasted onto it. A floating panel, not a modal: it
// opens with its field focused, and Escape (focus back on the button), a click outside it or Tab
// out of it closes it. A popover in frosted glass over the live view (its field stays solid); no
// frosted layer is around it on the Computers page, the only place it opens.
import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/use-i18n";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export function TypeTextPanel({
  id,
  trigger,
  onType,
  onClose,
  className,
}: {
  id: string;
  // The toolbar button that opens it: a press on it toggles the panel rather than counting as outside.
  trigger: RefObject<HTMLButtonElement | null>;
  onType: (text: string) => void;
  // `refocus`: put focus back on the button (Escape), rather than leaving it where the person went.
  onClose: (refocus: boolean) => void;
  className?: string;
}) {
  const t = useT();
  const [text, setText] = useState("");
  const panel = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const fieldId = useId();
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);

  useEffect(() => {
    field.current?.focus();
    const outside = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && (panel.current?.contains(target) || trigger.current?.contains(target))) return;
      close.current(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [trigger]);

  return (
    <div
      ref={panel}
      id={id}
      role="dialog"
      aria-label={t("computers.live.clipboard")}
      className={cn("w-80 max-w-[calc(100%-1.75rem)] rounded-card glass-strong p-3", className)}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.stopPropagation();
        close.current(true);
      }}
      onBlur={(event) => {
        const next = event.relatedTarget as Node | null;
        if (next && !panel.current?.contains(next) && !trigger.current?.contains(next)) close.current(false);
      }}
    >
      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (!text) return;
          onType(text);
          setText("");
          field.current?.focus();
        }}
      >
        <label htmlFor={fieldId} className="text-label font-medium text-ink">{t("computers.live.typeLabel")}</label>
        <div className="flex gap-2">
          <Input ref={field} id={fieldId} maxLength={2000} value={text} onChange={(event) => setText(event.target.value)} className="min-w-0 flex-1" />
          <Button type="submit" disabled={!text}>{t("computers.live.type")}</Button>
        </div>
      </form>
    </div>
  );
}
