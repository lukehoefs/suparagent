// The app's agent-editable look (backend app/ui/config.py): colour overrides, the sidebar's order,
// hidden pages and labels, and custom pages agents made. Read once per load from /ui-config and kept
// in a small store; every change is saved server-side as a version the owner can undo in
// Settings, Appearance. No React imports here, so node tests can load the pure parts.

export type UiNavKey = "today" | "agents" | "tasks" | "results" | "routines" | "apps" | "computers" | "settings";
export type UiPageMeta = { id: string; title: string; in_nav: boolean };
export type UiConfig = {
  theme: { light: Record<string, string>; dark: Record<string, string> };
  nav: { order: string[]; hidden: string[]; labels: Record<string, string> };
  pages: UiPageMeta[];
};
export type UiConfigResponse = { version: number | null; config: UiConfig };
export type UiRevision = {
  id: number; summary: string; source: "agent" | "person" | "restore" | string; actor: string;
  agent_id: number | null; restored_from: number | null; created_at: string | null; pages: number;
};

export const EMPTY_UI_CONFIG: UiConfig = {
  theme: { light: {}, dark: {} },
  nav: { order: [], hidden: [], labels: {} },
  pages: [],
};

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const TOKEN = /^[a-z][a-z-]{1,30}$/;

// The accent family sits on solid fills only, so changing it leaves the glass as it is.
const ACCENT_TOKENS = new Set(["accent", "accent-fg", "accent-text", "accent-bg", "focus"]);

// The glass fills and the canvas wash are tuned and contrast-checked against the app's own surfaces
// and text (scripts/check-contrast.mjs); the server checks a changed theme on the solid tokens only.
// So once a theme changes a surface or text colour, its glass goes solid (the same values as the
// reduced-transparency fallback in globals.css) and the wash goes clear: what the server checked
// is what shows.
const SOLID_GLASS = [
  "--glass-bg: var(--bg-raised);",
  "--glass-bg-strong: var(--bg-raised);",
  "--glass-bg-chrome: var(--bg-surface);",
  "--glass-bg-canvas: var(--bg-app);",
  "--glass-scrim: var(--scrim);",
  "--glass-filter: none;",
  "--wash-a: transparent;",
  "--wash-b: transparent;",
];

/** The CSS that applies the colour overrides on top of globals.css, or "" for none. Only token names
 *  and hex colours pass (the server checks the same), so nothing else can reach the stylesheet. */
export function themeCss(config: UiConfig | null | undefined): string {
  if (!config) return "";
  const block = (mode: "light" | "dark") => {
    const valid = Object.entries(config.theme?.[mode] ?? {}).filter(([token, colour]) => TOKEN.test(token) && HEX.test(colour));
    const lines = valid.map(([token, colour]) => `--${token}: ${colour};`);
    if (valid.some(([token]) => !ACCENT_TOKENS.has(token))) lines.push(...SOLID_GLASS);
    if (lines.length === 0) return "";
    const selector = mode === "light" ? ':root, :root[data-theme="light"]' : ':root[data-theme="dark"]';
    return `${selector} { ${lines.join(" ")} }`;
  };
  return [block("light"), block("dark")].filter(Boolean).join("\n");
}

export const customPageHref = (id: string) => `/custom/?id=${encodeURIComponent(id)}`;

export type ArrangedEntry = { kind: "page"; key: UiNavKey } | { kind: "custom"; id: string; title: string };

/** The sidebar's entries in their arranged order: the listed ones first as ordered, then the rest in
 *  their usual place; hidden built-in pages left out (Settings never is); custom pages in the sidebar
 *  after the built-in ones unless ordered. `available` is the built-in pages this person may see. */
export function arrangeNav(available: readonly UiNavKey[], config: UiConfig | null | undefined): ArrangedEntry[] {
  const hidden = new Set((config?.nav?.hidden ?? []).filter((key) => key !== "settings"));
  const pages = (config?.pages ?? []).filter((page) => page.in_nav);
  const all: Map<string, ArrangedEntry> = new Map();
  for (const key of available) if (!hidden.has(key)) all.set(key, { kind: "page", key });
  for (const page of pages) all.set(`page:${page.id}`, { kind: "custom", id: page.id, title: page.title });
  const ordered: ArrangedEntry[] = [];
  for (const key of config?.nav?.order ?? []) {
    const entry = all.get(key);
    if (entry) {
      ordered.push(entry);
      all.delete(key);
    }
  }
  return [...ordered, ...all.values()];
}

// -- the store ----------------------------------------------------------------------

type Listener = () => void;
let current: UiConfigResponse | null = null;
const listeners = new Set<Listener>();
const CACHE_KEY = "lt-ui-config";

function readCache(): UiConfigResponse | null {
  try {
    const raw = globalThis.localStorage?.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as UiConfigResponse) : null;
  } catch {
    return null;
  }
}

export function getUiConfig(): UiConfigResponse | null {
  if (current === null) current = readCache();
  return current;
}

export function setUiConfig(next: UiConfigResponse): void {
  current = next;
  try {
    globalThis.localStorage?.setItem(CACHE_KEY, JSON.stringify(next));
  } catch {
    // A convenience only: the next load fetches it again.
  }
  applyTheme(next.config);
  for (const listener of listeners) listener();
}

export function subscribeUiConfig(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function applyTheme(config: UiConfig | null | undefined): void {
  if (typeof document === "undefined") return;
  const css = themeCss(config);
  let style = document.getElementById("lt-ui-theme") as HTMLStyleElement | null;
  if (!css) {
    style?.remove();
    return;
  }
  if (!style) {
    style = document.createElement("style");
    style.id = "lt-ui-theme";
    document.head.appendChild(style);
  }
  if (style.textContent !== css) style.textContent = css;
}
