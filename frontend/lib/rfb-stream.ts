// One RFB stream over a WebSocket, painted onto a canvas: the connection code shared by the Docker
// desktop (components/chat/LiveDesktop.tsx) and the cloud computers (components/computers/*).
// No React. The socket factory can be swapped, so node tests can drive it.
import { DesktopRfb, type RfbLimits } from "./desktop-rfb.ts";

// Why a stream ended. `closed`: the socket closed on its own (`live` says whether a picture had
// arrived first). Never reported after close() was called.
export type RfbStreamEnd =
  | { kind: "timeout" }
  | { kind: "protocol"; message: string }
  | { kind: "closed"; code: number; live: boolean };

type SocketLike = {
  binaryType: string;
  readyState: number;
  send(data: Uint8Array): void;
  close(): void;
  onmessage: ((event: { data: ArrayBuffer }) => void) | null;
  onclose: ((event: { code: number }) => void) | null;
  onerror: (() => void) | null;
};

export type RfbStreamOptions = {
  url: string;
  // The WebSocket subprotocols to ask for; none when left out.
  protocols?: string | string[];
  canvas: () => HTMLCanvasElement | null;
  limits?: RfbLimits;
  // Delay before asking for the next update after a frame arrives; slower while the tab is hidden.
  refreshMs?: number;
  hiddenRefreshMs?: number;
  // No first frame by then: the stream ends with `timeout`.
  firstFrameMs?: number;
  onReady?: (width: number, height: number) => void;
  onLive?: () => void;
  onEnd?: (end: RfbStreamEnd) => void;
  socket?: (url: string, protocols?: string | string[]) => SocketLike;
};

export type RfbStream = { client: DesktopRfb; close: () => void };

const OPEN = 1;

function browserSocket(url: string, protocols?: string | string[]): SocketLike {
  return new WebSocket(url, protocols) as unknown as SocketLike;
}

export function openRfbStream(options: RfbStreamOptions): RfbStream {
  const refreshMs = options.refreshMs ?? 100;
  const hiddenRefreshMs = options.hiddenRefreshMs ?? refreshMs;
  const ws = (options.socket ?? browserSocket)(options.url, options.protocols);
  ws.binaryType = "arraybuffer";
  let done = false;
  let live = false;
  let refresh: ReturnType<typeof setTimeout> | undefined;
  const stop = () => {
    done = true;
    clearTimeout(timeout);
    clearTimeout(refresh);
    try { ws.close(); } catch { /* already closed */ }
  };
  const end = (detail: RfbStreamEnd) => {
    if (done) return;
    stop();
    options.onEnd?.(detail);
  };
  const timeout = setTimeout(() => { if (!live) end({ kind: "timeout" }); }, options.firstFrameMs ?? 15000);
  const rfb = new DesktopRfb({
    send: (bytes) => { if (!done && ws.readyState === OPEN) ws.send(bytes); },
    ready: (width, height) => {
      const canvas = options.canvas();
      if (canvas) { canvas.width = width; canvas.height = height; }
      options.onReady?.(width, height);
    },
    rectangle: (x, y, width, height, rgba) => {
      const context = options.canvas()?.getContext("2d");
      if (context) context.putImageData(new ImageData(rgba as Uint8ClampedArray<ArrayBuffer>, width, height), x, y);
    },
    frame: () => {
      if (done) return;
      if (!live) { live = true; clearTimeout(timeout); options.onLive?.(); }
      const hidden = typeof document !== "undefined" && document.hidden;
      clearTimeout(refresh);
      refresh = setTimeout(() => { if (!done) rfb.request(); }, hidden ? hiddenRefreshMs : refreshMs);
    },
  }, options.limits);
  ws.onmessage = (event) => {
    if (done) return;
    try { rfb.push(new Uint8Array(event.data)); }
    catch (err) { end({ kind: "protocol", message: err instanceof Error ? err.message : "" }); }
  };
  ws.onclose = (event) => { end({ kind: "closed", code: event.code, live }); };
  ws.onerror = () => { try { ws.close(); } catch { /* already closed */ } };
  return { client: rfb, close: () => { if (!done) stop(); } };
}
