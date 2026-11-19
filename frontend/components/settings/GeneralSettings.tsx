"use client";

// Settings › General: the workspace's name, app updates, the setup guide and where agent settings
// live. Members and Engines are pages of their own (/settings/members/, /settings/engines/), like
// every other entry in the Settings list. Appearance and the app's language are saved per browser,
// not per workspace, so they are on You › Profile.
import Link from "next/link";
import { AppUpdates } from "@/components/AppUpdates";
import { DOCS_HREF } from "@/lib/settings-nav";
import { useT } from "@/lib/use-i18n";
import { SettingsCard } from "./SettingsCard";
import { WorkspaceCard } from "./workspace/WorkspaceCard";

export function GeneralSettings() {
  const t = useT();
  return <div className="flex flex-col gap-5">
    <WorkspaceCard />
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
