"use client";

// Full screen for one element: the browser's own when it offers it, otherwise the element is laid
// over the page (`overlay`) until Escape or the same button again.
import { useCallback, useEffect, useState, type RefObject } from "react";

export function useFullscreen(target: RefObject<HTMLElement | null>) {
  const [native, setNative] = useState(false);
  const [overlay, setOverlay] = useState(false);

  useEffect(() => {
    const change = () => setNative(target.current !== null && document.fullscreenElement === target.current);
    document.addEventListener("fullscreenchange", change);
    return () => document.removeEventListener("fullscreenchange", change);
  }, [target]);

  useEffect(() => {
    if (!overlay) return;
    // A key the live view sends to the computer is marked handled there; it does not close this.
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape" && !event.defaultPrevented) setOverlay(false); };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [overlay]);

  const toggle = useCallback(() => {
    const element = target.current;
    if (!element) return;
    if (document.fullscreenElement) { void document.exitFullscreen().catch(() => {}); return; }
    if (overlay) { setOverlay(false); return; }
    if (typeof element.requestFullscreen === "function") element.requestFullscreen().catch(() => setOverlay(true));
    else setOverlay(true);
  }, [overlay, target]);

  const exit = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    setOverlay(false);
  }, []);

  return { active: native || overlay, overlay, toggle, exit };
}
