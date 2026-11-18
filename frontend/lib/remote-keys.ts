// The keyboard on an interactive remote screen (components/computers/RfbCanvas.tsx). Every key goes
// to the remote desktop, Tab and Escape included, so there is one way out that is never sent: a
// second Escape within LEAVE_WINDOW_MS of the first (the first still reaches the desktop). The
// canvas's label says so. Pure: no React, no DOM.

export const LEAVE_WINDOW_MS = 600;

// Whether this key press leaves the screen instead of reaching the desktop. `lastEscape` is when the
// previous Escape was pressed on the screen (null for none).
export function leavesScreen(key: string, now: number, lastEscape: number | null, repeat = false): boolean {
  if (key !== "Escape" || repeat || lastEscape === null) return false;
  return now - lastEscape <= LEAVE_WINDOW_MS;
}

// The item after `current` in `ordered` (focusable elements in tab order), or null when it is the
// last or not there.
export function nextInOrder<T>(ordered: readonly T[], current: T): T | null {
  const at = ordered.indexOf(current);
  return at === -1 || at === ordered.length - 1 ? null : ordered[at + 1];
}
