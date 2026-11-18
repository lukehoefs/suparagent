"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { api, desktopViewerUrl } from "@/lib/api";
import { DESKTOP_KEYS, type DesktopRfb } from "@/lib/desktop-rfb";
import { openRfbStream, type RfbStream } from "@/lib/rfb-stream";
import { takeover } from "@/lib/takeover";
import { RfbCanvas } from "@/components/computers/RfbCanvas";

const BUTTON = "cursor-pointer rounded border border-line px-2 py-1 text-xs disabled:opacity-50";
export function LiveDesktop({ computerId }: { computerId: number }) {
  const [state, dispatch] = useReducer(takeover, "watching");
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [expanded, setExpanded] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const lease = useRef<string | null>(null);
  const stream = useRef<RfbStream | null>(null);
  const client = useRef<DesktopRfb | null>(null);
  const mounted = useRef(false);
  const generation = useRef(0);
  const active = state !== "watching" && state !== "taking";

  const release = useCallback(() => {
    generation.current++;
    const token = lease.current;
    lease.current = null;
    stream.current?.close(); stream.current = null; client.current = null;
    if (token) void api.releaseComputerControl(computerId, token).catch(() => {});
    dispatch("release"); setExpanded(false);
    opener.current?.focus();
  }, [computerId]);
  useEffect(() => {
    mounted.current = true;
    window.addEventListener("pagehide", release);
    return () => { mounted.current = false; window.removeEventListener("pagehide", release); release(); };
  }, [release]);
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => {
      if (lease.current) void api.computerControlHeartbeat(computerId, lease.current).catch(() => { setError("Control was handed back or this view lost its lease."); release(); });
    }, 10000);
    return () => clearInterval(timer);
  }, [active, computerId, release]);

  // The stream itself (socket, RFB client, painting) is lib/rfb-stream.ts, shared with the cloud computers.
  const connect = (ticket: string, version: number) => {
    stream.current?.close();
    stream.current = openRfbStream({
      url: desktopViewerUrl(computerId, ticket, location.href),
      protocols: "binary",
      canvas: () => canvas.current,
      onLive: () => { if (version === generation.current) dispatch("frame"); },
      onEnd: (end) => {
        if (version !== generation.current) return;
        if (end.kind === "timeout") { setError("The desktop could not be shown. Try again."); release(); }
        else if (end.kind === "protocol") { setError(end.message || "The desktop stream failed."); release(); }
        else if (lease.current) { dispatch("disconnect"); setError("Connection lost. Reconnect within 20 seconds to keep control."); }
      },
    });
    client.current = stream.current.client;
  };
  const take = async () => {
    const version = ++generation.current;
    dispatch("take"); setError(null);
    try {
      const result = await api.takeComputerControl(computerId, lease.current ?? undefined);
      const token = result.lease_id ?? lease.current;
      if (!mounted.current || generation.current !== version) { if (result.lease_id) void api.releaseComputerControl(computerId,result.lease_id).catch(()=>{}); return; }
      if (!result.owned || !token || !result.ticket) { setError("Another view has control. Ask it to hand control back."); dispatch("failed"); return; }
      lease.current = token; dispatch("taken"); connect(result.ticket,version);
    } catch (err) { if (generation.current === version) { setError(err instanceof Error ? err.message : "Could not take control."); release(); } }
  };
  return <section className={expanded ? "fixed inset-0 z-50 flex flex-col gap-2 bg-inset p-3" : "space-y-2"}>
    <div className="flex flex-wrap items-center gap-2">
      {state === "watching" || state === "taking" ? <button ref={opener} className={BUTTON} disabled={state === "taking"} onClick={() => void take()}>{state === "taking" ? "Taking control…" : "Take control"}</button> : <>
        <span className="text-xs">{state === "live" ? "You are in control" : state === "lost" ? "Connection lost" : "Connecting…"}</span>
        <button className={BUTTON} onClick={release}>Hand control back</button>
        <button className={BUTTON} onClick={() => setExpanded(!expanded)}>{expanded ? "Exit full screen" : "Full screen"}</button>
        {state === "lost" && <button className={BUTTON} onClick={() => void take()}>Reconnect</button>}
      </>}
    </div>
    {active && <>
      <RfbCanvas canvasRef={canvas} client={client} interactive label="Computer desktop. Click to focus; Hand control back returns control to the agent."
        className="aspect-[16/10] min-h-0 w-full rounded border border-line bg-black outline-accent" />
      <form className="flex flex-wrap gap-2" onSubmit={event => { event.preventDefault(); client.current?.text(text); setText(""); }}>
        <input aria-label="Text to type on the desktop" maxLength={2000} className="min-w-0 flex-1 rounded border border-line bg-transparent px-2 py-1 text-sm" value={text} onChange={event=>setText(event.target.value)} />
        <button type="submit" className={BUTTON}>Type text</button>
        {["Escape","Tab","Enter"].map(key=><button type="button" key={key} className={BUTTON} onClick={()=>{client.current?.key(DESKTOP_KEYS[key],true);client.current?.key(DESKTOP_KEYS[key],false);}}>{key}</button>)}
      </form>
    </>}
    {error && <p role="status" className="text-xs text-warning">{error}</p>}
  </section>;
}
