// Settings is a few pages with a list on the side, so no one page holds every control.

export type SettingsPageId = "general" | "members" | "notifications" | "profile" | "engines" | "channels" | "permissions" | "approvals" | "account";
export type WorkspaceSection = "general" | "members" | "engines";
// `wide`: a page of its own (design Permissions.html): no Settings title or list, the whole width for
// the permissions matrix and its filters column; the others keep a readable 820 px column beside the list.
// `section`: General, Members and Engines are one page, one section under another (design:
// WorkspaceSettings.html); each address opens that page at its own section, the element with this id.
export type SettingsPage = { id: SettingsPageId; href: string; label: string; summary: string; wide?: boolean; section?: WorkspaceSection };
// `labelKey` is the translated label (lib/locales/workspace-settings-extra.ts); `label` stays the
// English one that search and the command palette show.
export type SettingsNavItem = { href: string; label: string; labelKey: string; pageId: SettingsPageId };
// `headingHidden`: the heading is for assistive tech only (the design's list opens with General).
export type SettingsNavGroup = { label: string; labelKey: string; headingHidden?: boolean; items: readonly SettingsNavItem[] };

export const SETTINGS_PAGES: readonly SettingsPage[] = [
  { id: "general", href: "/settings/", label: "General", summary: "The workspace's name, members, engines, updates and the setup guide.", section: "general" },
  { id: "members", href: "/settings/members/", label: "Members", summary: "Who works in this workspace, their roles, and invitation links.", section: "members" },
  { id: "notifications", href: "/settings/notifications/", label: "Notifications", summary: "Desktop alerts, agent questions and routine failure notices." },
  { id: "profile", href: "/settings/profile/", label: "Profile", summary: "Your profile, appearance and language, annual activity stats, top models and account." },
  { id: "engines", href: "/settings/engines/", label: "Engines", summary: "Claude Code, Codex and the other engines, their keys, paths and limits.", section: "engines" },
  { id: "channels", href: "/settings/channels/", label: "Channels", summary: "Connect Telegram and open the legacy Boat tasks page." },
  { id: "permissions", href: "/settings/permissions/", label: "Agent permissions", summary: "Grant tools and skills to many agents at once.", wide: true },
  { id: "approvals", href: "/settings/approvals/", label: "Approvals", summary: "Commands you always allow and what was decided." },
  { id: "account", href: "/settings/account/", label: "Account & privacy", summary: "Your account, devices, history export and permissions." },
];

const settingsPage = (id: SettingsPageId): SettingsNavItem => {
  const page = SETTINGS_PAGES.find((item) => item.id === id)!;
  return { href: page.href, label: page.label, labelKey: `settingsNav.${page.id}`, pageId: page.id };
};

/** The same routes as SETTINGS_PAGES, arranged for the Settings navigation (design: General, Members,
 *  Engines and Agent permissions at the top, with no heading), then the personal pages under "You".
 *  Apps and MCP servers are in the sidebar's Apps page; the documentation is linked from General. */
export const SETTINGS_NAV_GROUPS: readonly SettingsNavGroup[] = [
  { label: "Workspace", labelKey: "settingsNav.groupWorkspace", headingHidden: true, items: [settingsPage("general"), settingsPage("members"), settingsPage("engines"), settingsPage("permissions"), settingsPage("approvals"), settingsPage("channels")] },
  { label: "You", labelKey: "settingsNav.groupYou", items: [settingsPage("profile"), settingsPage("notifications"), settingsPage("account")] },
];

// The documentation, linked from General's setup card now that it is no longer in the list.
export const DOCS_HREF = "/docs/";

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
