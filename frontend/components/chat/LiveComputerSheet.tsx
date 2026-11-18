"use client";

import * as RadixDialog from "@radix-ui/react-dialog";
import { useRef } from "react";
import { useT } from "@/lib/use-i18n";
import { LiveComputerPanel } from "@/components/computers/LiveComputerPanel";

// The live computer panel on a window too narrow to show it beside the chat: a sheet over the
// chat from the right (full width on a phone). Escape, the scrim or the panel's own Hide closes it;
// an Escape pressed on the remote screen in control is the computer's, never the sheet's.
// The sheet is frosted glass (glass-strong) over a frosted scrim, and the panel inside it drops its
// own fill so the glass shows. A backdrop filter makes the sheet the box that `position: fixed`
// children are placed in, so while the screen is laid over the page in place of the browser's own
// full screen (data-fullscreen-overlay, iPhone Safari) the sheet turns its filter off (the shared
// rule after the glass utilities in app/globals.css) and the screen covers the whole window again.
export function LiveComputerSheet({
  agentId,
  agentName,
  onClose,
  onControlChange,
}: {
  agentId: number;
  agentName: string;
  onClose: () => void;
  onControlChange?: (held: boolean) => void;
}) {
  const t = useT();
  const opener = useRef<HTMLElement | null>(null);
  return (
    <RadixDialog.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-40 animate-fade-in glass-scrim" />
        <RadixDialog.Content
          aria-describedby={undefined}
          onOpenAutoFocus={() => { opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; }}
          onCloseAutoFocus={(event) => { event.preventDefault(); opener.current?.focus(); }}
          onEscapeKeyDown={(event) => {
            // Radix listens before the canvas does: keep the remote desktop's Escape for it.
            if (event.target instanceof Element && event.target.closest("[data-remote-screen]")) event.preventDefault();
          }}
          className="fixed inset-y-0 right-0 z-50 flex w-[min(360px,100vw)] animate-inspector-in flex-col glass-strong pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]"
        >
          <RadixDialog.Title className="sr-only">{t("computers.panel.title")}</RadixDialog.Title>
          <LiveComputerPanel agentId={agentId} agentName={agentName} onClose={onClose} onControlChange={onControlChange} className="min-h-0 w-full flex-1 border-l-0 bg-transparent [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" />
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
