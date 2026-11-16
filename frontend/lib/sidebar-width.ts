// The sidebar's width: drag between MIN and MAX; drag below SNAP and it becomes the 72 px rail
// (avatars and icons only). Double-clicking the edge toggles between the rail and the last full width.
// The width is a per-browser convenience kept in localStorage; losing it only resets to DEFAULT.

export const SIDEBAR_DEFAULT = 300;
export const SIDEBAR_MIN = 200;
export const SIDEBAR_MAX = 420;
export const SIDEBAR_SNAP = 150;
export const SIDEBAR_RAIL = 72;
const KEY = "lukethomas.sidebar";

export type SidebarSize = { rail: boolean; width: number };

/** Where a drag that would make the sidebar `proposed` px wide lands. */
export function dragTo(proposed: number, current: SidebarSize): SidebarSize {
  if (!Number.isFinite(proposed)) return current;
  if (proposed < SIDEBAR_SNAP) return { rail: true, width: current.width };
  return { rail: false, width: Math.round(Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, proposed))) };
}

export function toggleRail(current: SidebarSize): SidebarSize {
  return { rail: !current.rail, width: current.width };
}

export function shownWidth(size: SidebarSize): number {
  return size.rail ? SIDEBAR_RAIL : size.width;
}

/** A stored value, or the default when it is missing or unreadable. */
export function parseStored(raw: string | null): SidebarSize {
  try {
    const value = raw ? JSON.parse(raw) : null;
    if (value && typeof value.width === "number" && typeof value.rail === "boolean") {
      return { rail: value.rail, width: Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, Math.round(value.width))) };
    }
  } catch {
    // fall through to the default
  }
  return { rail: false, width: SIDEBAR_DEFAULT };
}

export function loadSidebarSize(): SidebarSize {
  try {
    return parseStored(window.localStorage.getItem(KEY));
  } catch {
    return parseStored(null);
  }
}

export function saveSidebarSize(size: SidebarSize): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(size));
  } catch {
    // storage blocked: the size simply is not remembered
  }
}
