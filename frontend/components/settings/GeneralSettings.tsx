"use client";

// Settings › General, Members and Engines: one page, one section under another (design:
// WorkspaceSettings.html). /settings/ opens it at the top; /settings/members/ and /settings/engines/
// open it at their section, so the list, the command palette and older links land where they mean.
// Below the three: app updates, the setup guide and where agent settings live. Appearance and the app's
// language are saved per browser, not per workspace, so they are on You › Profile.
import Link from "next/link";
import { useEffect } from "react";
import { AppUpdates } from "@/components/AppUpdates";
import { DOCS_HREF, type WorkspaceSection } from "@/lib/settings-nav";
import { useT } from "@/lib/use-i18n";
import { SettingsCard } from "./SettingsCard";
import { EnginesSettings } from "./EnginesSettings";
import { MembersSettings } from "./MembersSettings";
import { WorkspaceCard } from "./workspace/WorkspaceCard";

const STOP_ON = ["wheel", "touchstart", "keydown", "pointerdown"] as const;

// Opens the page at a section: brings it to the top, and again while the cards above it finish loading
// (they push it down), until the person scrolls, taps or types, or two seconds pass. An address with a
// #setting-… anchor is left to SettingsShell, which focuses that setting instead.
function useArriveAt(id: WorkspaceSection | null) {
  useEffect(() => {
    if (!id || window.location.hash) return;
    const target = document.getElementById(id);
    const page = target?.parentElement;
    if (!target || !page) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const place = () => target.scrollIntoView({ block: "start" });
    const observer = new ResizeObserver(place);
    const stop = () => {
      observer.disconnect();
      if (timer !== null) clearTimeout(timer);
      for (const name of STOP_ON) window.removeEventListener(name, stop, true);
    };
    place();
    observer.observe(page);
    timer = setTimeout(stop, 2000);
    for (const name of STOP_ON) window.addEventListener(name, stop, { capture: true, passive: true });
    return stop;
  }, [id]);
}

export function GeneralSettings({ section = "general" }: { section?: WorkspaceSection }) {
  const t = useT();
  useArriveAt(section === "general" ? null : section);
  return <div className="flex flex-col gap-5">
    <WorkspaceCard />
    <div id="members" className="scroll-mt-5">
      <MembersSettings />
    </div>
    <div id="engines" className="scroll-mt-5">
      <EnginesSettings />
    </div>
    <div id="setting-general-updates" data-setting-id="setting-general-updates" data-setting-container tabIndex={-1}>
      <AppUpdates />
    </div>
    <div id="setting-general-setup" data-setting-id="setting-general-setup" data-setting-container tabIndex={-1}>
      <SettingsCard
        title={t("appSettings.general.gettingStarted")}
        description={t("appSettings.general.gettingStartedHelp")}
        action={(
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <Link className="text-sm text-accent-text hover:underline" href="/onboarding/">{t("appSettings.general.openSetup")}</Link>
            <Link className="text-sm text-accent-text hover:underline" href={DOCS_HREF}>{t("settingsNav.docs")}</Link>
          </div>
        )}
      />
    </div>
    <SettingsCard title={t("appSettings.general.agentSettings")} description={t("appSettings.general.agentSettingsHelp")}>
      <ul className="divide-y divide-line">
        <li className="py-2 first:pt-0">
          <Link className="text-sm text-accent-text hover:underline" href="/agents/">{t("appSettings.general.agentsApprovals")}</Link>
          <p className="mt-1 text-xs text-muted">{t("appSettings.general.agentsApprovalsHelp")}</p>
        </li>
        <li className="py-2">
          <Link className="text-sm text-accent-text hover:underline" href="/agents/">{t("appSettings.general.skills")}</Link>
          <p className="mt-1 text-xs text-muted">{t("appSettings.general.skillsHelp")}</p>
        </li>
        <li className="py-2">
          <Link className="text-sm text-accent-text hover:underline" href="/agents/">{t("appSettings.general.memory")}</Link>
          <p className="mt-1 text-xs text-muted">{t("appSettings.general.memoryHelp")}</p>
        </li>
        <li className="py-2">
          <Link className="text-sm text-accent-text hover:underline" href="/routines/">{t("appSettings.general.routines")}</Link>
        </li>
        <li id="setting-general-apps" data-setting-id="setting-general-apps" className="py-2 last:pb-0">
          <span className="text-sm">{t("appSettings.general.connectedApps")}</span>{" "}<Link className="text-sm text-accent-text hover:underline" href="/apps/">{t("appSettings.general.openApps")}</Link>
        </li>
      </ul>
    </SettingsCard>
  </div>;
}
