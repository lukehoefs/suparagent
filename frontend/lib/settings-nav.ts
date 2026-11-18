// Settings is a few pages with a list on the side, so no one page holds every control.

export type SettingsPageId = "general" | "members" | "notifications" | "profile" | "engines" | "channels" | "permissions" | "approvals" | "account";
export type SettingsPage = { id: SettingsPageId; href: string; label: string; summary: string };
// `labelKey` is the translated label (lib/locales/workspace-settings-extra.ts); `label` stays the
// English one that search and the command palette show. `external`: a page outside Settings.
export type SettingsNavItem = { href: string; label: string; labelKey: string; pageId?: SettingsPageId; external?: boolean };
export type SettingsNavGroup = { label: string; labelKey: string; items: readonly SettingsNavItem[] };

export const SETTINGS_PAGES: readonly SettingsPage[] = [
  { id: "general", href: "/settings/", label: "General", summary: "The workspace's name, appearance, updates and the setup guide." },
  { id: "members", href: "/settings/members/", label: "Members", summary: "Who works in this workspace, their roles, and invitation links." },
  { id: "notifications", href: "/settings/notifications/", label: "Notifications", summary: "Desktop alerts, agent questions and routine failure notices." },
  { id: "profile", href: "/settings/profile/", label: "Profile", summary: "Your profile, annual activity stats, top models and account." },
  { id: "engines", href: "/settings/engines/", label: "Engines", summary: "Claude Code, Codex and the other engines, their keys, paths and limits." },
  { id: "channels", href: "/settings/channels/", label: "Channels", summary: "Connect Telegram and open the legacy Boat tasks page." },
  { id: "permissions", href: "/settings/permissions/", label: "Agent permissions", summary: "Grant tools and skills to many agents at once." },
  { id: "approvals", href: "/settings/approvals/", label: "Approvals", summary: "Commands you always allow and what was decided." },
  { id: "account", href: "/settings/account/", label: "Account & privacy", summary: "Your account, devices, history export and permissions." },
];

const settingsPage = (id: SettingsPageId): SettingsNavItem => {
  const page = SETTINGS_PAGES.find((item) => item.id === id)!;
  return { href: page.href, label: page.label, labelKey: `settingsNav.${page.id}`, pageId: page.id };
};

/** The same routes as SETTINGS_PAGES, arranged for the Settings navigation (design: the workspace
 *  pages first), then the pages outside Settings that used to sit here. */
export const SETTINGS_NAV_GROUPS: readonly SettingsNavGroup[] = [
  { label: "Workspace", labelKey: "settingsNav.groupWorkspace", items: [settingsPage("general"), settingsPage("members"), settingsPage("engines"), settingsPage("permissions"), settingsPage("approvals"), settingsPage("channels")] },
  { label: "You", labelKey: "settingsNav.groupYou", items: [settingsPage("profile"), settingsPage("notifications"), settingsPage("account")] },
  {
    label: "More",
    labelKey: "settingsNav.groupMore",
    items: [
      { href: "/marketplace/", label: "MCP servers", labelKey: "settingsNav.mcpServers", external: true },
      { href: "/apps/", label: "Apps", labelKey: "settingsNav.apps", external: true },
      { href: "/docs/", label: "Documentation", labelKey: "settingsNav.docs", external: true },
    ],
  },
];

// Where to send someone who needs to sign in to an engine or fix its setup.
export const ENGINE_SETTINGS = "/settings/engines/";

const trimmed = (path: string) => path.replace(/\/+$/, "");

// The page whose entry is current. A path under a base path (/app/settings/engines) counts too.
export function activeSettingsPage(pathname: string): SettingsPage {
  const path = trimmed(pathname);
  const found = SETTINGS_PAGES.slice(1).find((page) => path.endsWith(trimmed(page.href)));
  return found ?? SETTINGS_PAGES[0];
}

// Setup comes first for a new owner, except on the pages that finish it: the guide and every Settings page.
export function isSetupPage(pathname: string): boolean {
  return /(^|\/)(onboarding|settings)(\/|$)/.test(pathname);
}
