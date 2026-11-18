"use client";

// The canvas an RFB stream paints on (lib/rfb-stream.ts). Interactive: it takes focus and sends
// pointer, wheel and key events to the desktop. Not interactive: a picture, and nothing is sent.
// Shared by the Docker desktop (chat/LiveDesktop.tsx) and the cloud computers.
import { useEffect, type CSSProperties, type KeyboardEvent, type PointerEvent, type RefObject } from "react";
import { framePoint, keysymFor, pointerMask, type DesktopRfb } from "@/lib/desktop-rfb";
import { cn } from "@/lib/cn";

export function RfbCanvas({
  canvasRef,
  client,
  interactive,
  label,
  className,
  style,
}: {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  client: RefObject<DesktopRfb | null>;
  interactive: boolean;
  label: string;
  className?: string;
  style?: CSSProperties;
}) {
  // A native, non-passive listener: React's onWheel cannot stop the page from scrolling.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !interactive) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
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
    const canvas = event.currentTarget;
    const point = framePoint(event.clientX, event.clientY, canvas.getBoundingClientRect(), canvas.width, canvas.height);
    client.current?.pointer(point.x, point.y, pointerMask(buttons));
  };
  const key = (event: KeyboardEvent<HTMLCanvasElement>, down: boolean) => {
    const keysym = keysymFor(event.key);
    if (keysym === undefined) return;
    event.preventDefault();
    client.current?.key(keysym, down);
  };
  return (
    <canvas
      ref={canvasRef}
      tabIndex={0}
      role="application"
      aria-label={label}
      className={cn("touch-none object-contain", className)}
      style={style}
      onPointerDown={(event) => { event.preventDefault(); event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId); pointer(event); }}
      onPointerMove={(event) => pointer(event)}
      onPointerUp={(event) => pointer(event, 0)}
      onPointerCancel={(event) => pointer(event, 0)}
      onContextMenu={(event) => event.preventDefault()}
      onKeyDown={(event) => key(event, true)}
      onKeyUp={(event) => key(event, false)}
    />
  );
}
