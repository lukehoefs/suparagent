// Ends work a hidden tab has no use for, such as a live desktop stream: `onPause` once the page has
// stayed hidden for `graceMs`, and `onResume` when it shows again after such a pause (a quick
// switch away and back changes nothing). Returns the cleanup. No React; the document and the timers
// are passed in, so node tests can drive them.

type DocumentLike = {
  hidden: boolean;
  addEventListener: (type: "visibilitychange", listener: () => void) => void;
  removeEventListener: (type: "visibilitychange", listener: () => void) => void;
};

type Timers = {
  set: (run: () => void, ms: number) => unknown;
  clear: (handle: unknown) => void;
};

const browserTimers: Timers = {
  set: (run, ms) => setTimeout(run, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export const HIDDEN_GRACE_MS = 10_000;

export function pauseWhileHidden(
  doc: DocumentLike,
  graceMs: number,
  onPause: () => void,
  onResume: () => void,
  timers: Timers = browserTimers,
): () => void {
  let timer: unknown = null;
  let paused = false;
  const stopTimer = () => {
    if (timer !== null) timers.clear(timer);
    timer = null;
  };
  const changed = () => {
    stopTimer();
    if (doc.hidden) {
      if (!paused) timer = timers.set(() => { timer = null; paused = true; onPause(); }, graceMs);
      return;
    }
    if (paused) {
      paused = false;
      onResume();
    }
  };
  changed();
  doc.addEventListener("visibilitychange", changed);
  return () => {
    stopTimer();
    doc.removeEventListener("visibilitychange", changed);
  };
}
