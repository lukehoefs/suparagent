// The right-hand panel's width (components/shell/Inspector.tsx, beside the chat on wide screens). It
// opens at DEFAULT; drag its left edge between MIN and MAX; drag below SNAP and it becomes the 56 px
// icon strip, one icon per panel. Double-clicking the edge toggles between the strip and the last full
// width. A per-browser convenience kept in localStorage; losing it only resets to DEFAULT.

export const PANEL_DEFAULT = 384;
export const PANEL_MIN = 300;
export const PANEL_MAX = 760;
export const PANEL_SNAP = 220;
export const PANEL_RAIL = 56;
const KEY = "lukethomas.panel";

export type PanelSize = { rail: boolean; width: number };

const clamp = (value: number) => Math.round(Math.min(PANEL_MAX, Math.max(PANEL_MIN, value)));

/** Where a drag that would make the panel `proposed` px wide lands. */
export function dragPanelTo(proposed: number, current: PanelSize): PanelSize {
  if (!Number.isFinite(proposed)) return current;
  if (proposed < PANEL_SNAP) return { rail: true, width: current.width };
  return { rail: false, width: clamp(proposed) };
}

export function togglePanelRail(current: PanelSize): PanelSize {
  return { rail: !current.rail, width: current.width };
}

export function shownPanelWidth(size: PanelSize): number {
  return size.rail ? PANEL_RAIL : size.width;
}

/** A stored value, or the default when it is missing or unreadable. */
export function parseStoredPanel(raw: string | null): PanelSize {
  try {
    const value = raw ? JSON.parse(raw) : null;
    if (value && typeof value.width === "number" && typeof value.rail === "boolean") {
      return { rail: value.rail, width: clamp(value.width) };
    }
  } catch {
    // fall through to the default
  }
  return { rail: false, width: PANEL_DEFAULT };
}

export function loadPanelSize(): PanelSize {
  try {
    return parseStoredPanel(window.localStorage.getItem(KEY));
  } catch {
    return parseStoredPanel(null);
  }
}

export function savePanelSize(size: PanelSize): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(size));
  } catch {
    // storage blocked: the size simply is not remembered
  }
}
