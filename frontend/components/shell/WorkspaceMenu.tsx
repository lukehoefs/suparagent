"use client";

import { Bell, Building2, ChevronDown, GitBranch, Hash, Languages, LogOut, Plus, UserRound, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { auth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { collaboration, type Room } from "@/lib/collaboration";
import { LANGUAGE_CHOICES, LANGUAGE_LABELS, LANGUAGE_TAGS, type LanguageChoice } from "@/lib/i18n";
import { roomHref } from "@/lib/rooms";
import { badgeText } from "@/lib/routines";
import { THEME_CHOICES, type ThemeChoice } from "@/lib/theme";
import { setLanguageChoice, useLanguageChoice, useT } from "@/lib/use-i18n";
import { useSession } from "@/components/AuthGate";
import { Menu, MenuItem, MenuLabel, MenuRadioGroup, MenuRadioItem, MenuSeparator, MenuSub } from "@/components/ui/Menu";
import { chooseTheme, THEME_ICONS, THEME_LABELS, useThemeChoice } from "@/components/ui/ThemeToggle";
import { NotificationsDialog, useUnreadNotifications } from "./NotificationsDialog";
import { requestTeamPanel, useTeamPanelAvailable } from "./teamPanel";

/**
 * The sidebar footer (design: Main.html): who is signed in and the workspace ("Luke · LH Tech"),
 * opening a menu with notifications, theme, language, Team & rooms, Clients, Workflows, the
 * account page and signing out. In the 72 px rail only the initial shows; on the phone sheet
 * (design: MobileMenu.html) the whole row is the button, the role under the name.
 */
export function WorkspaceMenu({
  person,
  workspace,
  rail,
  sheet = false,
  admin,
  teamReady = false,
  onOpenWorkflows,
  navigate,
  onNavigate,
}: {
  person: { name: string; detail?: string | null };
  // The workspace's name (the team's), or null when it has none: then only the person shows.
  workspace: string | null;
  rail: boolean;
  sheet?: boolean;
  // Owner or admin: notifications and Clients are theirs (like their endpoints).
  admin: boolean;
  // GET /team answered: the team panel has something to show.
  teamReady?: boolean;
  onOpenWorkflows?: () => void;
  navigate: (href: string) => void;
  onNavigate?: () => void;
}) {
  const t = useT();
  const router = useRouter();
  const { session } = useSession();
  const theme = useThemeChoice();
  const language = useLanguageChoice();
  const { unread, refresh } = useUnreadNotifications(admin);
  const [feedOpen, setFeedOpen] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  // The rooms (GET /rooms), read on mount and again each time the menu opens; null where the
  // backend has none.
  const [rooms, setRooms] = useState<Room[] | null>(null);
  const teamPanel = useTeamPanelAvailable() && teamReady;

  const readRooms = useCallback((alive: () => boolean = () => true) => {
    collaboration.rooms().then((list) => { if (alive()) setRooms(list); }).catch(() => { if (alive()) setRooms(null); });
  }, []);
  useEffect(() => {
    let alive = true;
    readRooms(() => alive);
    return () => { alive = false; };
  }, [readRooms]);

  const initial = person.name.trim().charAt(0).toUpperCase();
  const line = workspace ? `${person.name} · ${workspace}` : person.name;
  const second = [person.detail, workspace].filter(Boolean).join(" · ");
  const badge = badgeText(unread ?? 0);
  const triggerLabel = [t("sidebarMenu.trigger", { name: line }), badge ? t("sidebarMenu.unread", { n: unread ?? 0 }) : null].filter(Boolean).join(", ");
  const go = (href: string) => { onNavigate?.(); navigate(href); };

  // As Settings > Account does it (components/DevicesSection.tsx).
  const signOut = async () => {
    setSignOutError(null);
    try {
      await auth.logout();
      router.replace("/login/");
    } catch {
      setSignOutError(t("sidebarMenu.signOutFailed"));
    }
  };

  const avatar = (
    <span
      aria-hidden="true"
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-ink",
        sheet ? "size-9 bg-inset text-body" : "size-8 bg-hover text-[12px]",
      )}
    >
      {initial || <UserRound size={14} strokeWidth={1.7} />}
      {rail && badge && <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-accent ring-2 ring-app" />}
    </span>
  );

  const trigger = rail ? (
    <button type="button" aria-label={triggerLabel} title={triggerLabel} className="inline-flex cursor-pointer items-center justify-center rounded-full">
      {avatar}
    </button>
  ) : sheet ? (
    <button
      type="button"
      aria-label={triggerLabel}
      className="flex min-h-touch w-full min-w-0 cursor-pointer items-center gap-2.5 rounded-field text-left text-ink"
    >
      {avatar}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-body font-medium">{person.name}</span>
        {second && <span className="truncate text-small text-muted">{second}</span>}
      </span>
      {badge && <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-accent" />}
      <ChevronDown size={16} strokeWidth={1.7} aria-hidden="true" className="shrink-0 text-muted" />
    </button>
  ) : (
    <button
      type="button"
      aria-label={triggerLabel}
      className="flex h-control min-w-0 flex-1 cursor-pointer items-center justify-between gap-1.5 rounded-field border border-line bg-raised px-2.5 text-label font-medium text-ink transition-colors duration-(--dur-fast) hover:bg-hover touch:h-touch"
    >
      <span className="truncate">{line}</span>
      <span className="inline-flex shrink-0 items-center gap-1.5">
        {badge && <span aria-hidden="true" className="size-2 rounded-full bg-accent" />}
        <ChevronDown size={14} strokeWidth={1.7} aria-hidden="true" className="text-muted" />
      </span>
    </button>
  );

  // Team & rooms (they left the sidebar's scrolling list, so nothing there is cut off): the team
  // panel, each room, and a new room for an owner or admin.
  const offersRooms = rooms !== null;
  const teamRooms = (teamPanel || offersRooms) && (
    <MenuSub label={t("sidebarMenu.teamRooms")} icon={<Users size={14} strokeWidth={1.7} />} hint={rooms && rooms.length > 0 ? String(rooms.length) : undefined}>
      {teamPanel && (
        <MenuItem onSelect={() => { onNavigate?.(); requestTeamPanel(); }} icon={<Users size={14} strokeWidth={1.7} />}>{t("team.coordination")}</MenuItem>
      )}
      {teamPanel && offersRooms && <MenuSeparator />}
      {(rooms ?? []).map((room) => (
        <MenuItem key={room.id} onSelect={() => go(roomHref(room.id))} icon={<Hash size={14} strokeWidth={1.7} />}>
          <span className="min-w-0 flex-1 truncate">{room.name}</span>
          {room.unread > 0 && (
            <span className="inline-flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-accent-bg px-1.5 text-[11px] font-semibold text-accent-text">
              {badgeText(room.unread)}
              <span className="sr-only">{` ${t("room.unread", { count: room.unread })}`}</span>
            </span>
          )}
        </MenuItem>
      ))}
      {rooms !== null && rooms.length === 0 && !admin && <MenuLabel>{t("room.noRooms")}</MenuLabel>}
      {offersRooms && admin && <MenuItem onSelect={() => go(roomHref("new"))} icon={<Plus size={14} strokeWidth={1.7} />}>{t("room.new")}</MenuItem>}
    </MenuSub>
  );

  return (
    <div className={cn("flex shrink-0 flex-col gap-1", sheet ? "pt-1" : "pt-2")}>
      <div className={cn("flex items-center gap-2.5", rail ? "justify-center" : !sheet && "px-1.5")}>
        {!rail && !sheet && avatar}
        <Menu
          trigger={trigger}
          side="top"
          align="start"
          className="w-64"
          onOpenChange={(open) => { if (open) readRooms(); }}
        >
          <MenuLabel className="text-ink">
            <span className="block truncate text-label font-semibold">{person.name}</span>
            {(person.detail || workspace) && (
              <span className="block truncate font-normal text-muted">{[workspace, person.detail].filter(Boolean).join(" · ")}</span>
            )}
          </MenuLabel>
          <MenuSeparator />
          {admin && unread !== null && (
            <MenuItem onSelect={() => setFeedOpen(true)} icon={<Bell size={14} strokeWidth={1.7} />}>
              <span className="min-w-0 flex-1">{t("notifications.title")}</span>
              {badge && (
                <span className="inline-flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-accent-bg px-1.5 text-[11px] font-semibold text-accent-text">
                  {badge}
                  <span className="sr-only">{` ${t("sidebarMenu.unread", { n: unread })}`}</span>
                </span>
              )}
            </MenuItem>
          )}
          <MenuLabel>{t("theme.label")}</MenuLabel>
          <MenuRadioGroup value={theme} onValueChange={(value) => chooseTheme(value as ThemeChoice)} label={t("theme.label")}>
            {THEME_CHOICES.map((value) => {
              const Icon = THEME_ICONS[value];
              return (
                <MenuRadioItem key={value} value={value} icon={<Icon size={14} strokeWidth={1.7} />}>
                  {t(THEME_LABELS[value])}
                </MenuRadioItem>
              );
            })}
          </MenuRadioGroup>
          <MenuSub label={t("sidebarMenu.language")} icon={<Languages size={14} strokeWidth={1.7} />} hint={LANGUAGE_LABELS[language]}>
            <MenuRadioGroup value={language} onValueChange={(value) => setLanguageChoice(value as LanguageChoice)} label={t("language.label")}>
              {LANGUAGE_CHOICES.map((choice) => (
                <MenuRadioItem key={choice} value={choice} lang={LANGUAGE_TAGS[choice]}>
                  {LANGUAGE_LABELS[choice]}
                </MenuRadioItem>
              ))}
            </MenuRadioGroup>
          </MenuSub>
          {(admin || onOpenWorkflows || teamRooms) && <MenuSeparator />}
          {teamRooms}
          {admin && <MenuItem onSelect={() => go("/clients/")} icon={<Building2 size={14} strokeWidth={1.7} />}>{t("sidebarMenu.clients")}</MenuItem>}
          {onOpenWorkflows && <MenuItem onSelect={() => { onNavigate?.(); onOpenWorkflows(); }} icon={<GitBranch size={14} strokeWidth={1.7} />}>{t("sidebarMenu.workflows")}</MenuItem>}
          <MenuSeparator />
          <MenuItem onSelect={() => go("/settings/account/")} icon={<UserRound size={14} strokeWidth={1.7} />}>{t("sidebarMenu.account")}</MenuItem>
          {/* Signing out ends a browser session; the desktop app, a paired device and a hosted sign-in have their own. */}
          {session?.kind === "browser" && (
            <MenuItem onSelect={() => void signOut()} icon={<LogOut size={14} strokeWidth={1.7} />}>{t("sidebarMenu.signOut")}</MenuItem>
          )}
        </Menu>
      </div>
      {signOutError && <p role="alert" className="px-1.5 text-small text-danger">{signOutError}</p>}
      {admin && <NotificationsDialog open={feedOpen} onOpenChange={setFeedOpen} onChanged={refresh} navigate={go} />}
    </div>
  );
}
