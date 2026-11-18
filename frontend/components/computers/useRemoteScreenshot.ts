"use client";

// A cloud computer's screen as a picture, read again about every 10 s, but only while `active`,
// the tab is visible and (when a target is given) the target is on screen. Returns an object URL
// that it revokes itself, or null when there is no picture.
import { useEffect, useState, type RefObject } from "react";
import { fetchRemoteComputerScreenshot } from "@/lib/remote-computers";

const EVERY_MS = 10_000;

export function useRemoteScreenshot(computerId: number, active: boolean, target?: RefObject<Element | null>): string | null {
  const [picture, setPicture] = useState<{ id: number; url: string } | null>(null);

  useEffect(() => {
    if (!active) return;
    let alive = true;
    let onScreen = !target;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | null = null;
    let current: string | null = null;
    const show = (url: string | null) => {
      if (current) URL.revokeObjectURL(current);
      current = url;
      setPicture(url ? { id: computerId, url } : null);
    };
    const read = async () => {
      clearTimeout(timer);
      if (!alive) return;
      if (onScreen && !document.hidden) {
        controller = new AbortController();
        try {
          const blob = await fetchRemoteComputerScreenshot(computerId, Date.now(), controller.signal);
          if (!alive) return;
          show(URL.createObjectURL(blob));
        } catch {
          if (!alive) return;
          show(null);
        }
      }
      if (alive) timer = setTimeout(() => void read(), EVERY_MS);
    };
    const observer = target?.current && typeof IntersectionObserver !== "undefined"
      ? new IntersectionObserver((entries) => {
          const visible = entries.some((entry) => entry.isIntersecting);
          if (visible && !onScreen) { onScreen = true; void read(); } else onScreen = visible;
        })
      : null;
    if (observer && target?.current) observer.observe(target.current);
    else onScreen = true;
    const visibility = () => { if (!document.hidden) void read(); };
    document.addEventListener("visibilitychange", visibility);
    void read();
    return () => {
      alive = false;
      clearTimeout(timer);
      controller?.abort();
      observer?.disconnect();
      document.removeEventListener("visibilitychange", visibility);
      if (current) URL.revokeObjectURL(current);
      // The revoked address must not be shown when it turns active again.
      setPicture(null);
    };
  }, [computerId, active, target]);

  return active && picture?.id === computerId ? picture.url : null;
}
