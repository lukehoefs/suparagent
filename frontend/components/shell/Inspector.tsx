"use client";

import * as RadixDialog from "@radix-ui/react-dialog";
import { PanelRightClose, PanelRightOpen, X } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import {
  PANEL_DEFAULT,
  PANEL_MAX,
  PANEL_MIN,
  dragPanelTo,
  loadPanelSize,
  savePanelSize,
  shownPanelWidth,
  togglePanelRail,
  type PanelSize,
} from "@/lib/panel-width";
import { useT } from "@/lib/use-i18n";

const CLOSE = "inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-field text-muted hover:bg-hover hover:text-ink touch:size-11";
const KEY_STEP = 16;

// One of the panels that can open here; the header and the icon strip offer them all for switching.
export type InspectorTab = { key: string; label: string; icon: ReactNode; active: boolean; onSelect: () => void };

// The right-hand panel for something you look at beside the conversation: a computer, usage, skills.
// Wide screens put it next to the chat, sliding in part way (lib/panel-width.ts): drag its left edge to
// any width, or far enough to the right to shrink it to an icon strip (one icon per panel, to switch or
// open it again). Narrower screens slide it over the chat from the right, full width on a phone. One
// at a time; Escape or the close button dismisses it. Forms and workflows that need room belong in a
// Dialog instead.
export function Inspector({
  title,
  subtitle,
  inline,
  solid = false,
  tabs,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  // True when the screen is wide enough to show it beside the conversation.
  inline: boolean;
  // Something live inside it (a computer's screen): the sheet keeps the glass's edge and shadow but
  // goes solid with no blur, which every frame of the screen would otherwise run again.
  solid?: boolean;
  // The panels available here, for switching; none or one shows no switcher.
  tabs?: InspectorTab[];
  onClose: () => void;
  children: ReactNode;
}) {
  const t = useT();
  const opener = useRef<HTMLElement | null>(null);
  const switcher = tabs && tabs.length > 1 ? tabs : [];

  const tabButtons = (size: "sm" | "rail", after?: () => void) =>
    switcher.map((tab) => (
      <button
        key={tab.key}
        type="button"
        aria-label={tab.label}
        aria-pressed={tab.active}
        title={tab.label}
        onClick={() => { tab.onSelect(); after?.(); }}
        className={cn(
          "inline-flex shrink-0 cursor-pointer items-center justify-center rounded-field text-muted hover:bg-hover hover:text-ink",
          size === "rail" ? "size-10" : "size-8",
          tab.active && "bg-accent-bg text-accent-text hover:bg-accent-bg hover:text-accent-text",
        )}
      >
        {tab.icon}
      </button>
    ));

  const header = (collapse?: () => void) => (
    <header className="flex shrink-0 items-center gap-2 border-b border-line px-4 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
      <div className="min-w-0 flex-1">
        <RadixTitle inline={inline}>{title}</RadixTitle>
        {subtitle ? <p className="truncate text-xs text-muted">{subtitle}</p> : null}
      </div>
      {switcher.length > 0 && <div className="flex shrink-0 items-center gap-0.5">{tabButtons("sm")}</div>}
      {collapse && (
        <button type="button" aria-label={t("inspector.collapse")} title={t("inspector.collapse")} onClick={collapse} className={CLOSE}>
          <PanelRightClose size={18} strokeWidth={1.7} aria-hidden="true" />
        </button>
      )}
      {/* A plain button, not IconButton: it takes focus when the sheet opens, and a tooltip on it
          would swallow the first Escape. */}
      {inline ? (
        <button type="button" aria-label={t("common.close")} title={t("common.close")} onClick={onClose} className={CLOSE}>
          <X size={18} strokeWidth={1.7} aria-hidden="true" />
        </button>
      ) : (
        <RadixDialog.Close aria-label={t("common.close")} title={t("common.close")} className={CLOSE}>
          <X size={18} strokeWidth={1.7} aria-hidden="true" />
        </RadixDialog.Close>
      )}
    </header>
  );

  if (inline) {
    return (
      <ResizablePanel title={title} onClose={onClose} header={header} tabButtons={tabButtons}>
        {children}
      </ResizablePanel>
    );
  }

  return (
    <RadixDialog.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-40 animate-fade-in glass-scrim" />
        {/* Sliding over the chat, it is frosted glass (glass-strong); beside it (above), it stays solid.
            On a phone it is as wide as the screen, with nothing beside it to frost, and around a live
            screen (solid) it would only redo the blur on every frame: there it is glass-solid. A
            computer's in-place full screen inside it (data-fullscreen-overlay) turns the blur off, so
            that fixed layer covers the window (app/globals.css). */}
        <RadixDialog.Content
          aria-describedby={undefined}
          onOpenAutoFocus={() => { opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; }}
          onCloseAutoFocus={(event) => { event.preventDefault(); opener.current?.focus(); }}
          className={cn(
            "fixed inset-y-0 right-0 z-50 flex w-[min(28rem,100vw)] animate-inspector-in flex-col glass-strong pb-[env(safe-area-inset-bottom)] max-sm:glass-solid",
            solid && "glass-solid",
          )}
        >
          {header()}
          <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

// Beside the chat: a column whose left edge drags (the same feel as the sidebar's right edge,
// SidebarFrame.tsx). In the icon strip the content stays mounted, only hidden, so a half-edited skill
// or a live screen is still there when the panel opens again.
function ResizablePanel({
  title,
  onClose,
  header,
  tabButtons,
  children,
}: {
  title: string;
  onClose: () => void;
  header: (collapse?: () => void) => ReactNode;
  tabButtons: (size: "sm" | "rail", after?: () => void) => ReactNode[];
  children: ReactNode;
}) {
  const t = useT();
  // The chat page renders only in the browser (after the sign-in check), so the saved size can be read at once.
  const [size, setSize] = useState<PanelSize>(() => (typeof window === "undefined" ? { rail: false, width: PANEL_DEFAULT } : loadPanelSize()));
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; shown: number; restore: number } | null>(null);

  const update = (next: PanelSize) => {
    setSize(next);
    savePanelSize(next);
  };
  const expand = () => update({ rail: false, width: size.width });
  const width = shownPanelWidth(size);

  return (
    <aside
      aria-label={title}
      onKeyDown={(event) => { if (event.key === "Escape") onClose(); }}
      style={{ width, maxWidth: size.rail ? undefined : "60vw" }}
      className={cn(
        "relative flex shrink-0 animate-inspector-in flex-col border-l border-line bg-surface",
        !dragging && "transition-[width] duration-(--dur-base) ease-(--ease-ui)",
      )}
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={t("inspector.resize")}
        aria-valuemin={PANEL_MIN}
        aria-valuemax={PANEL_MAX}
        aria-valuenow={width}
        tabIndex={0}
        title={t("inspector.resizeHint")}
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
            // The edge is on the left: moving the pointer left makes the panel wider.
            const next = dragPanelTo(from.shown + from.x - event.clientX, current);
            return next.rail ? { rail: true, width: from.restore } : next;
          });
        }}
        onPointerUp={(event) => {
          if (!start.current) return;
          event.currentTarget.releasePointerCapture(event.pointerId);
          start.current = null;
          setDragging(false);
          setSize((current) => {
            savePanelSize(current);
            return current;
          });
        }}
        onDoubleClick={() => update(togglePanelRail(size))}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            update(togglePanelRail(size));
          } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault();
            update(dragPanelTo(width + (event.key === "ArrowLeft" ? KEY_STEP : -KEY_STEP), size));
          }
        }}
        className="group absolute inset-y-0 -left-1 z-10 w-2 cursor-col-resize touch-none focus-visible:outline-none"
      >
        <span
          aria-hidden="true"
          className={cn(
            "absolute left-[3px] top-1/2 h-9 w-[3px] -translate-y-1/2 rounded-full bg-line transition-colors group-hover:bg-line-strong group-focus-visible:bg-accent",
            dragging && "bg-accent",
          )}
        />
      </div>

      {size.rail && (
        <div className="flex min-h-0 flex-1 flex-col items-center gap-1 py-2">
          <button type="button" aria-label={t("inspector.expand")} title={t("inspector.expand")} onClick={expand} className={CLOSE}>
            <PanelRightOpen size={18} strokeWidth={1.7} aria-hidden="true" />
          </button>
          <div className="my-1 h-px w-8 bg-line" aria-hidden="true" />
          {tabButtons("rail", expand)}
          <div className="flex-1" />
          <button type="button" aria-label={t("common.close")} title={t("common.close")} onClick={onClose} className={CLOSE}>
            <X size={18} strokeWidth={1.7} aria-hidden="true" />
          </button>
        </div>
      )}
      <div className={cn("flex min-h-0 flex-1 flex-col", size.rail && "hidden")}>
        {header(() => update({ rail: true, width: size.width }))}
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </aside>
  );
}

// Radix needs its own Title inside the overlay version for the dialog's accessible name.
function RadixTitle({ inline, children }: { inline: boolean; children: ReactNode }) {
  const cls = "truncate text-[15px] font-semibold";
  return inline ? <h2 className={cls}>{children}</h2> : <RadixDialog.Title className={cls}>{children}</RadixDialog.Title>;
}
