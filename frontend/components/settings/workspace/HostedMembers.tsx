"use client";

import { useEffect, useState } from "react";
import { useT } from "@/lib/use-i18n";
import { memberInitial } from "@/lib/workspace-settings";
import { activeWorkspace, listWorkspaces, sortRoster, workspaceRoster, type RosterMember, type Workspace } from "@/lib/workspaces";
import { Badge } from "@/components/ui/Badge";
import { Banner } from "@/components/ui/Banner";
import { SkeletonList } from "@/components/ui/Skeleton";
import { SettingsCard } from "../SettingsCard";
import { MemberAvatar } from "./shared";

// Members of a hosted workspace. The account service decides who belongs and in what role, so this
// lists them (names and roles) and sends owners and admins to the page where people are managed.
export function HostedMembers() {
  const t = useT();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [members, setMembers] = useState<RosterMember[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    listWorkspaces()
      .then(async (list) => {
        const current = activeWorkspace(list);
        if (!current) throw new Error("no active workspace");
        const roster = await workspaceRoster(current.id);
        if (!live) return;
        setWorkspace(current);
        setMembers(sortRoster(roster));
      })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, []);

  const manage = workspace?.role === "owner" || workspace?.role === "admin";
  return (
    <SettingsCard title={workspace ? t("members.hostedTitle", { name: workspace.name }) : t("members.title")} description={t("members.description")}>
      {failed && <Banner tone="danger">{t("members.loadFailed")}</Banner>}
      {!failed && members === null && <SkeletonList rows={3} />}
      {members && (
        <ul className="flex flex-col" aria-label={t("members.listLabel")}>
          {members.map((member) => (
            <li key={`${member.role}-${member.name}`} className="flex flex-wrap items-center gap-3 border-b border-line py-2.5 last:border-b-0">
              <MemberAvatar initial={memberInitial(member.name)} />
              <p className="flex min-w-0 flex-[1_1_200px] flex-wrap items-center gap-2 text-body font-medium text-ink">
                <span className="min-w-0 break-words">{member.name}</span>
                {member.me && <Badge>{t("members.you")}</Badge>}
              </p>
              <Badge tone={member.role === "owner" ? "accent" : "neutral"}>{t(`members.role.${member.role}`)}</Badge>
            </li>
          ))}
        </ul>
      )}
      <p className="text-small text-muted">
        {manage ? (
          <>
            {t("members.hostedManage")}{" "}
            <a className="text-accent-text underline" href="/account/workspaces">{t("members.hostedManageLink")}</a>
          </>
        ) : t("members.hostedManaged")}
      </p>
    </SettingsCard>
  );
}
