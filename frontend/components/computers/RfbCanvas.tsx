"use client";

// The canvas an RFB stream paints on (lib/rfb-stream.ts). Interactive: it takes focus and sends
// pointer, wheel and key events to the desktop, Tab and Escape included; pressing Escape twice
// leaves it (lib/remote-keys.ts), and its label says so. While `sending` is false (the stream is
// reconnecting) it keeps its focus and still keeps every key to itself, but sends nothing, so keys
// meant for the desktop never reach the page. Not interactive: a picture, and nothing is sent.
// Shared by the Docker desktop (chat/LiveDesktop.tsx) and the cloud computers.
import { useEffect, useRef, type CSSProperties, type KeyboardEvent, type PointerEvent, type RefObject } from "react";
import { framePoint, keysymFor, pointerMask, type DesktopRfb } from "@/lib/desktop-rfb";
import { cn } from "@/lib/cn";
import { leavesScreen, nextInOrder } from "@/lib/remote-keys";

// What Tab can reach, for moving on from the screen.
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusAfter(element: HTMLElement) {
  const ordered = Array.from(document.querySelectorAll<HTMLElement>(FOCUSABLE))
    .filter((item) => item === element || (item.tabIndex >= 0 && item.getClientRects().length > 0));
  const next = nextInOrder(ordered, element);
  if (next) next.focus();
  else element.blur();
}

export function RfbCanvas({
  canvasRef,
  client,
  interactive,
  sending = true,
  label,
  className,
  style,
}: {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  client: RefObject<DesktopRfb | null>;
  interactive: boolean;
  // Interactive, but the stream is not live: nothing is sent.
  sending?: boolean;
  label: string;
  className?: string;
  style?: CSSProperties;
}) {
  const live = useRef(sending);
  useEffect(() => { live.current = sending; }, [sending]);
  // When Escape was last pressed on the screen: a second one soon after leaves it.
  const lastEscape = useRef<number | null>(null);
  // The Escape that left the screen: its key-up is not sent either.
  const leaving = useRef(false);

  // A native, non-passive listener: React's onWheel cannot stop the page from scrolling.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !interactive) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      if (!live.current) return;
      const point = framePoint(event.clientX, event.clientY, canvas.getBoundingClientRect(), canvas.width, canvas.height);
      client.current?.pointer(point.x, point.y, event.deltaY < 0 ? 8 : 16);
      client.current?.pointer(point.x, point.y, 0);
    };
    canvas.addEventListener("wheel", wheel, { passive: false });
    return () => canvas.removeEventListener("wheel", wheel);
  }, [canvasRef, client, interactive]);

  if (!interactive) {
    return <canvas ref={canvasRef} role="img" aria-label={label} className={cn("object-contain", className)} style={style} />;
  }
  const pointer = (event: PointerEvent<HTMLCanvasElement>, buttons = event.buttons) => {
    if (!sending) return;
    const canvas = event.currentTarget;
    const point = framePoint(event.clientX, event.clientY, canvas.getBoundingClientRect(), canvas.width, canvas.height);
    client.current?.pointer(point.x, point.y, pointerMask(buttons));
  };
  const keyDown = (event: KeyboardEvent<HTMLCanvasElement>) => {
    if (leavesScreen(event.key, event.timeStamp, lastEscape.current, event.repeat)) {
      event.preventDefault();
      lastEscape.current = null;
      leaving.current = true;
      focusAfter(event.currentTarget);
      return;
    }
    if (event.key === "Escape" && !event.repeat) lastEscape.current = event.timeStamp;
    send(event, true);
  };
  const keyUp = (event: KeyboardEvent<HTMLCanvasElement>) => {
    if (leaving.current && event.key === "Escape") {
      leaving.current = false;
      event.preventDefault();
      return;
    }
    send(event, false);
  };
  const send = (event: KeyboardEvent<HTMLCanvasElement>, down: boolean) => {
    const keysym = keysymFor(event.key);
    if (keysym === undefined) return;
    // Kept from the page whether or not it can be sent now: a key meant for the desktop never
    // answers something on the page (an approval's A and D, a sheet's Escape).
    event.preventDefault();
    if (sending) client.current?.key(keysym, down);
  };
  return (
    <canvas
      ref={canvasRef}
      tabIndex={0}
      role="application"
      aria-label={label}
      data-remote-screen=""
      // The ring is drawn inside: the screen's box clips anything outside it.
      className={cn("touch-none object-contain focus-visible:outline-offset-[-2px]", className)}
      style={style}
      onPointerDown={(event) => { event.preventDefault(); event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId); pointer(event); }}
      onPointerMove={(event) => pointer(event)}
      onPointerUp={(event) => pointer(event, 0)}
      onPointerCancel={(event) => pointer(event, 0)}
      onContextMenu={(event) => event.preventDefault()}
      onKeyDown={keyDown}
      onKeyUp={keyUp}
    />
  );
}
