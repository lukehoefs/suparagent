"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight, ChevronDown } from "lucide-react";
import { Component, createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ErrorInfo, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { SETTINGS_NAV_GROUPS, activeSettingsPage } from "@/lib/settings-nav";
import { SETTINGS_REGISTRY, settingsControlMatches, shouldExpandBeforeSettingsFocus } from "@/lib/settings-registry";
import { useT } from "@/lib/use-i18n";
import { useAppShell } from "@/components/shell/AppShell";
import { Badge } from "@/components/ui/Badge";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { SettingsSearch } from "./SettingsSearch";
import { useVersionUpdate } from "@/lib/use-version-update";

function matchingControl(scope: HTMLElement, hint: string): HTMLElement | null {
  const needle = hint.toLocaleLowerCase().trim();
  const controls = [...scope.querySelectorAll<HTMLElement>(
    'input:not([type="hidden"]):not(:disabled), select:not(:disabled), textarea:not(:disabled), button:not(:disabled), a[href], [role="tab"], [role="radio"]',
  )];
  const labels = [...scope.querySelectorAll<HTMLLabelElement>("label[for]")];
  const matching = controls.find((control) => {
    const associatedLabel = labels.find((label) => label.htmlFor === control.id)?.textContent ?? "";
    const nestedLabel = control.closest("label")?.textContent ?? "";
    const radioGroupLabel = control.closest('[role="radiogroup"]')?.getAttribute("aria-label") ?? "";
    const text = [control.getAttribute("aria-label"), control.getAttribute("title"), control.textContent, associatedLabel, nestedLabel, radioGroupLabel]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase();
    return settingsControlMatches(needle, text);
  });
  if (matching) return matching;
  const landmark = [...scope.querySelectorAll<HTMLElement>("h1, h2, h3, h4, section[aria-label]")]
    .find((candidate) => `${candidate.getAttribute("aria-label") ?? ""} ${candidate.textContent ?? ""}`.toLocaleLowerCase().includes(needle));
  return landmark ?? (needle.includes("api key") ? scope.querySelector<HTMLElement>('input[type="password"]:not(:disabled)') : null);
}

// The control a search result focuses, marked data-setting-focus="<anchor id>" where it is drawn. It is
// found in every language; the registry's English focusLabel is matched only where nothing is marked.
function markedControl(scope: HTMLElement, anchorId: string): HTMLElement | null {
  return scope.querySelector<HTMLElement>(`[data-setting-focus~="${CSS.escape(anchorId)}"]`);
}

function firstControl(scope: HTMLElement): HTMLElement | null {
  return scope.querySelector<HTMLElement>(
    'input:not([type="hidden"]):not(:disabled), select:not(:disabled), textarea:not(:disabled), button:not(:disabled), a[href], [role="tab"], [role="radio"]',
  );
}

function ErrorFallback({ error, onRetry }: { error: Error | null; onRetry: () => void }) {
  const t = useT();
  return (
    <div className="flex flex-col items-start gap-4">
      <Banner tone="danger">{error?.message || t("settingsPage.panelError")}</Banner>
      <Button variant="secondary" onClick={onRetry}>{t("settingsPage.tryAgain")}</Button>
    </div>
  );
}

class SettingsErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Settings panel error:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return <ErrorFallback error={this.state.error} onRetry={() => this.setState({ hasError: false, error: null })} />;
    }
    return this.props.children;
  }
}

// Set inside the frame, so a page that still wraps itself in SettingsShell (as every page did before
// app/settings/layout.tsx) renders once, not twice.
const InsideSettings = createContext(false);

// The frame every Settings page shares (design: WorkspaceSettings.html), inside the app shell: the
// page title and search, the list of Settings pages beside (on a phone, above) the page that is open.
export function SettingsShell({ children }: { children: ReactNode }) {
  const nested = useContext(InsideSettings);
  if (nested) return <>{children}</>;
  return <InsideSettings.Provider value><SettingsFrame>{children}</SettingsFrame></InsideSettings.Provider>;
}

function SettingsFrame({ children }: { children: ReactNode }) {
  const t = useT();
  const pathname = usePathname() ?? "";
  const active = activeSettingsPage(pathname);
  const { team } = useAppShell();
  const { updateAvailable } = useVersionUpdate();
  const navId = useId();
  // The phone's page list belongs to the address it was opened on, so choosing a page closes it.
  const [navOpenAt, setNavOpenAt] = useState<string | null>(null);
  const navOpen = navOpenAt === pathname;
  const pendingFocus = useRef<(() => void) | null>(null);
  const focusAnchor = useCallback((anchorId: string) => {
    pendingFocus.current?.();
    const entry = SETTINGS_REGISTRY.find((item) => item.anchorId === anchorId);
    let observer: MutationObserver | null = null;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    const stop = () => {
      stopped = true;
      observer?.disconnect();
      if (timeout !== null) clearTimeout(timeout);
    };
    const attempt = (allowFallback = false) => {
      if (stopped) return false;
      const anchor = document.getElementById(anchorId);
      if (!anchor) return false;
      const root = anchor.closest<HTMLElement>("[data-setting-root]") ?? anchor.parentElement ?? anchor;
      const row = [...root.querySelectorAll<HTMLElement>("[data-setting-id]")]
        .find((candidate) => candidate.dataset.settingId === anchorId);
      row?.closest<HTMLDetailsElement>("details:not([open])")?.setAttribute("open", "");
      const targetSection = row
        ?? (anchor.matches("[data-setting-container]") ? anchor : anchor.closest<HTMLElement>("[data-setting-container]"))
        ?? (anchor.classList.contains("sr-only") ? root : anchor);
      const marked = markedControl(targetSection, anchorId);
      // A marked control that cannot take focus now (read-only for this person) leaves it on its section.
      const control = marked
        ? (marked.matches(":disabled") ? null : marked)
        : entry?.focusLabel
          ? matchingControl(targetSection, entry.focusLabel)
          : firstControl(targetSection);
      const expander = [...root.querySelectorAll<HTMLElement>("[data-setting-expand-for]")]
        .find((candidate) => candidate.dataset.settingExpandFor?.split(/\s+/).includes(anchorId));
      if (expander && shouldExpandBeforeSettingsFocus(!!row || !!control || !!marked, expander.getAttribute("aria-expanded"))) {
        expander.click();
        return false;
      }
      if (entry?.focusLabel && !control && !marked && !allowFallback) return false;
      const focusTarget = control ?? targetSection;
      targetSection.scrollIntoView({ block: "start" });
      if (!focusTarget.hasAttribute("tabindex") && !focusTarget.matches("input, select, textarea, button, a[href], [tabindex]")) {
        focusTarget.tabIndex = -1;
      }
      focusTarget.focus({ preventScroll: true });
      if (focusTarget.getAttribute("role") === "tab") focusTarget.click();
      stop();
      return true;
    };

    if (attempt()) return;
    observer = new MutationObserver(() => { attempt(); });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });
    timeout = setTimeout(() => { attempt(true); stop(); }, 5000);
    pendingFocus.current = stop;
  }, []);

  useEffect(() => {
    const focusHash = () => {
      const anchorId = window.location.hash.slice(1);
      if (anchorId && SETTINGS_REGISTRY.some((entry) => entry.anchorId === anchorId)) focusAnchor(anchorId);
    };
    const onSettingsAnchor = (event: Event) => {
      const anchorId = (event as CustomEvent<unknown>).detail;
      if (typeof anchorId === "string" && SETTINGS_REGISTRY.some((entry) => entry.anchorId === anchorId)) focusAnchor(anchorId);
    };
    focusHash();
    window.addEventListener("hashchange", focusHash);
    window.addEventListener("settings:anchor", onSettingsAnchor);
    return () => {
      window.removeEventListener("hashchange", focusHash);
      window.removeEventListener("settings:anchor", onSettingsAnchor);
      pendingFocus.current?.();
      pendingFocus.current = null;
    };
  }, [focusAnchor, pathname]);

  const workspaceName = team?.team?.name?.trim() || null;
  const activeItem = SETTINGS_NAV_GROUPS.flatMap((group) => group.items).find((item) => item.pageId === active.id);

  // The frame is a container: the page list goes beside the page only when the frame itself (not the
  // window) has room for both, the list's 200 px and a page of at least 520 px (the design's flex-wrap).
  // With the app's sidebar open on a tablet or a narrow window, the page stays one column under the list.
  return (
    <div className="@container flex flex-col gap-6 px-4 pb-10 pt-5 sm:px-8 sm:pt-7">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-h1 font-semibold tracking-[-0.02em] text-ink">{t("settingsPage.title")}</h1>
          <p className="mt-1 text-body text-muted">
            {workspaceName ? t("settingsPage.subtitleNamed", { name: workspaceName }) : t("settingsPage.subtitle")}
          </p>
        </div>
        <div className="w-full sm:w-72">
          <SettingsSearch />
        </div>
      </header>
      <div className="flex flex-col gap-6 @3xl:flex-row @3xl:items-start">
        <nav aria-label={t("settingsPage.sections")} className="@3xl:sticky @3xl:top-0 @3xl:w-[200px] @3xl:shrink-0">
          {/* In a narrow frame (a phone, a tablet beside the sidebar) the list folds behind the page that is open, so the page stays one column. */}
          <button
            type="button"
            aria-expanded={navOpen}
            aria-controls={navId}
            onClick={() => setNavOpenAt(navOpen ? null : pathname)}
            className="flex h-touch w-full cursor-pointer items-center justify-between gap-2 rounded-field border border-line-strong bg-raised px-3 text-body font-medium text-ink @3xl:hidden"
          >
            <span className="truncate">
              <span className="sr-only">{t("settingsPage.sectionsPhone")} </span>
              {activeItem ? t(activeItem.labelKey) : t(`settingsNav.${active.id}`)}
            </span>
            <ChevronDown size={16} aria-hidden="true" className={cn("shrink-0 text-muted transition-transform duration-(--dur-fast)", navOpen && "rotate-180")} />
          </button>
          <ul id={navId} className={cn("mt-2 flex-col gap-0.5 @3xl:mt-0 @3xl:flex", navOpen ? "flex" : "hidden")}>
            {SETTINGS_NAV_GROUPS.map((group, index) => (
              <li key={group.labelKey}>
                <p id={`${navId}-${index}`} className={cn("px-2.5 pb-1 text-small font-medium text-faint", index > 0 && "pt-4")}>{t(group.labelKey)}</p>
                <ul aria-labelledby={`${navId}-${index}`} className="flex flex-col gap-0.5">
                  {group.items.map((item) => {
                    const current = item.pageId === active.id;
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          aria-current={current ? "page" : undefined}
                          className={cn(
                            "flex h-[34px] items-center justify-between gap-2 rounded-field px-2.5 text-body font-medium transition-colors duration-(--dur-fast) touch:h-touch",
                            current ? "bg-inset text-ink" : "text-muted hover:bg-inset hover:text-ink",
                          )}
                        >
                          <span className="truncate">{t(item.labelKey)}</span>
                          {item.external && <ArrowUpRight size={14} aria-hidden="true" className="shrink-0 text-faint" />}
                          {item.pageId === "general" && updateAvailable && <Badge tone="accent">{t("settingsPage.update")}</Badge>}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>
        </nav>
        <div className={cn("flex min-w-0 flex-1 flex-col gap-5", !active.wide && "max-w-[820px]")}>
          {/* The open page's title and summary: the heading that names it (cards are h3 below it).
              Agent permissions draws its own (PermissionsSettings, design Permissions.html), so it is not repeated. */}
          {active.id !== "permissions" && (
            <div className="min-w-0">
              <h2 className="text-h2 font-semibold text-ink">{t(`settingsNav.${active.id}`)}</h2>
              <p className="mt-1 text-body text-muted">{t(`settingsPage.summary.${active.id}`)}</p>
            </div>
          )}
          <SettingsErrorBoundary key={active.href}>{children}</SettingsErrorBoundary>
        </div>
      </div>
    </div>
  );
}
