"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

export type Polled<T> = {
  // The last answer, kept while a later read fails; null until the first one.
  data: T | null;
  // The last read failed (with `data` null: nothing could be read yet).
  failed: boolean;
  set: Dispatch<SetStateAction<T | null>>;
  reload: () => void;
};

/**
 * Reads now, every `everyMs` while the tab shows, at once when it shows again, and on `reload()` or
 * a new `tick`. Nothing is read while `enabled` is false. A failed read leaves the last answer.
 */
export function usePolled<T>(read: () => Promise<T>, everyMs: number, enabled: boolean, tick = 0): Polled<T> {
  const [data, setData] = useState<T | null>(null);
  const [failed, setFailed] = useState(false);
  const [own, setOwn] = useState(0);
  const latest = useRef(read);
  useEffect(() => {
    latest.current = read;
  });
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const run = () => {
      if (document.hidden) return;
      latest.current()
        .then((value) => { if (alive) { setData(value); setFailed(false); } })
        .catch(() => { if (alive) setFailed(true); });
    };
    run();
    const timer = window.setInterval(run, everyMs);
    document.addEventListener("visibilitychange", run);
    return () => {
      alive = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", run);
    };
  }, [enabled, everyMs, tick, own]);
  const reload = useCallback(() => setOwn((n) => n + 1), []);
  return { data, failed, set: setData, reload };
}
