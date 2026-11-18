"use client";

// The live view of one cloud computer: a fresh single-use ticket for the mode, then the RFB stream
// (lib/rfb-stream.ts) painted on the caller's canvas. Changing the mode reconnects; a stream that
// drops after showing a picture is retried once on its own, then waits for retry(). A tab that
// stays hidden for HIDDEN_GRACE_MS closes its stream (the backend allows only a few viewers per
// computer, and a hidden tab would keep pulling frames) and opens a new one when it shows again.
import { useCallback, useEffect, useRef, useState } from "react";
import { REMOTE_DESKTOP_LIMITS, type DesktopRfb } from "@/lib/desktop-rfb";
import { HIDDEN_GRACE_MS, pauseWhileHidden } from "@/lib/hidden-pause";
import { openRfbStream, type RfbStream } from "@/lib/rfb-stream";
import { remoteComputerViewerUrl, remoteErrorKey, viewerCloseKey, viewerEnded, viewerTicket, type ViewerMode } from "@/lib/remote-computers";

// idle: nothing to show, or paused while the tab is hidden; connecting: asking for a ticket or
// waiting for the first picture; failed: it never showed one; lost: it showed one, then dropped.
export type ViewerStatus = "idle" | "connecting" | "live" | "failed" | "lost";

const RETRY_MS = 2000;

export function useRemoteViewer({
  computerId,
  mode,
  enabled,
  onControlLost,
}: {
  computerId: number;
  mode: ViewerMode;
  // False while there is no live view to open (offline, no key): nothing connects.
  enabled: boolean;
  // A control stream was refused or ended because control was handed back elsewhere.
  onControlLost?: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const client = useRef<DesktopRfb | null>(null);
  const [attempt, setAttempt] = useState(0);
  const key = `${computerId}|${mode}|${attempt}`;
  // Results belong to the connection they came from; any other key reads as connecting. `reason`
  // is a message key for why it failed or dropped, when the backend said (too many viewers, ...).
  const [result, setResult] = useState<{ key: string; status: ViewerStatus; reason: string | null }>({ key: "", status: "connecting", reason: null });
  const [frame, setFrame] = useState<{ width: number; height: number } | null>(null);
  const [paused, setPaused] = useState(false);
  const lost = useRef(onControlLost);
  useEffect(() => { lost.current = onControlLost; }, [onControlLost]);

  // Hidden for a while: close the stream. Shown again: a fresh ticket and stream.
  useEffect(() => {
    if (!enabled) return;
    const stop = pauseWhileHidden(document, HIDDEN_GRACE_MS, () => setPaused(true), () => {
      setPaused(false);
      setAttempt((n) => n + 1);
    });
    return () => { stop(); setPaused(false); };
  }, [enabled]);

  useEffect(() => {
    if (!enabled || paused) return;
    // A connection opened again (the computer came back online) starts over, not at the last result.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset for the new connection
    setResult({ key, status: "connecting", reason: null });
    let alive = true;
    let stream: RfbStream | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let retried = false;
    const report = (status: ViewerStatus, reason: string | null = null) => { if (alive) setResult({ key, status, reason }); };
    const open = async () => {
      let ticket: string;
      try {
        ticket = (await viewerTicket(computerId, mode)).ticket;
      } catch (err) {
        report("failed", remoteErrorKey((err as { code?: unknown } | null)?.code));
        return;
      }
      if (!alive) return;
      stream = openRfbStream({
        url: remoteComputerViewerUrl(computerId, ticket, window.location.href),
        canvas: () => canvasRef.current,
        limits: REMOTE_DESKTOP_LIMITS,
        hiddenRefreshMs: 1000,
        onReady: (width, height) => { if (alive) setFrame((current) => (current?.width === width && current.height === height ? current : { width, height })); },
        onLive: () => { retried = false; report("live"); },
        onEnd: (end) => {
          stream = null;
          client.current = null;
          if (!alive) return;
          if (end.kind === "closed" && viewerEnded(mode, end.code)) {
            report("lost");
            lost.current?.();
            return;
          }
          if (end.kind === "closed" && end.live && !retried) {
            retried = true;
            report("connecting");
            retry = setTimeout(() => void open(), RETRY_MS);
            return;
          }
          report(end.kind === "closed" && end.live ? "lost" : "failed", end.kind === "closed" ? viewerCloseKey(end.code) : null);
        },
      });
      client.current = stream.client;
    };
    void open();
    return () => {
      alive = false;
      clearTimeout(retry);
      stream?.close();
      client.current = null;
    };
  }, [computerId, mode, enabled, paused, key]);

  const status: ViewerStatus = !enabled || paused ? "idle" : result.key === key ? result.status : "connecting";
  const reason = status === "failed" || status === "lost" ? result.reason : null;
  const reconnect = useCallback(() => setAttempt((n) => n + 1), []);
  return { canvasRef, client, status, reason, frame, reconnect };
}
