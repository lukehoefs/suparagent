// The sidebar's navigation (design: Main.html): the pages it links to, in the design's order, who
// sees each one, and which entry an address belongs to. No runtime imports, so node tests load it.

export type ShellPageKey = "today" | "agents" | "tasks" | "results" | "routines" | "apps" | "computers" | "settings";

export type ShellPage = {
  key: ShellPageKey;
  href: string;
  // Owner and admin only, like the page's own endpoints (the command palette gates them the same way).
  adminOnly: boolean;
};

// Static export: every address ends in a slash and takes its details as a query string.
export const SHELL_PAGES: readonly ShellPage[] = [
  { key: "today", href: "/today/", adminOnly: true },
  { key: "agents", href: "/agents/", adminOnly: false },
  { key: "tasks", href: "/tasks/", adminOnly: true },
  { key: "results", href: "/results/", adminOnly: true },
  { key: "routines", href: "/routines/", adminOnly: true },
  { key: "apps", href: "/apps/", adminOnly: true },
  { key: "computers", href: "/computers/", adminOnly: true },
  { key: "settings", href: "/settings/", adminOnly: false },
];

export const TODAY_HREF = "/today/";

/** The entries a person sees: everything for an owner or admin, the rest for everyone else. */
export function shellPages(admin: boolean): ShellPage[] {
  return SHELL_PAGES.filter((page) => admin || !page.adminOnly);
}

/**
 * The entry marked as the page on screen, from the router's path (no deployment prefix), or null
 * for a page outside the navigation (the chat, Clients). The old /marketplace/ address now opens
 * Apps; /boat-tasks/ is the legacy Telegram page, not Tasks.
 */
export function currentShellPage(pathname: string | null | undefined): ShellPageKey | null {
  if (!pathname) return null;
  const first = pathname.split(/[/?#]/).find((part) => part.length > 0) ?? "";
  if (first === "marketplace") return "apps";
  return SHELL_PAGES.find((page) => page.href === `/${first}/`)?.key ?? null;
}

// The phone menu's "Go to" tiles (design: MobileMenu.html) also open the chat, which is how a phone
// reaches its conversations.
export type SheetPageKey = ShellPageKey | "chat";
export type SheetPage = { key: SheetPageKey; href: string; wide: boolean };
export const CHAT_HREF = "/chat/";

/**
 * The phone menu's tiles, two across: the navigation with Chat second (after Today, or first
 * when Today is not shown). Results is not among the design's eight, so it comes last. A last
 * tile left alone in its row (`wide`) takes the whole row, so the grid is never ragged.
 */
export function sheetPages(admin: boolean): SheetPage[] {
  const pages = shellPages(admin);
  const results = pages.filter((page) => page.key === "results");
  const rest: { key: SheetPageKey; href: string }[] = pages.filter((page) => page.key !== "results");
  const at = rest[0]?.key === "today" ? 1 : 0;
  rest.splice(at, 0, { key: "chat", href: CHAT_HREF });
  const all = [...rest, ...results];
  return all.map((page, index) => ({ key: page.key, href: page.href, wide: all.length % 2 === 1 && index === all.length - 1 }));
}

/** The phone menu's tile for the page on screen: the chat's own, or the navigation's. */
export function currentSheetPage(pathname: string | null | undefined): SheetPageKey | null {
  const first = (pathname ?? "").split(/[/?#]/).find((part) => part.length > 0) ?? "";
  return first === "chat" ? "chat" : currentShellPage(pathname);
}
