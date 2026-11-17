"use client";

// The agent's own place on the team, in the Profile tab's Team section (admin only): "Member of
// {lead}'s team" and "Can delegate". The state and the save live in ProfileForm (saved with Save);
// lib/agent-profile-extras.ts ownTeamView says what each switch shows.
import type { OwnTeamView } from "@/lib/agent-profile-extras";
import { useT } from "@/lib/use-i18n";
import { Switch } from "@/components/ui/Switch";

function Row({ title, hint, checked, disabled, onChange }: { title: string; hint: string; checked: boolean; disabled: boolean; onChange: (next: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-label font-medium text-ink">{title}</p>
        <p className="mt-0.5 text-small text-muted">{hint}</p>
      </div>
      <Switch checked={checked} disabled={disabled} onChange={onChange} label={title} className="mt-0.5" />
    </div>
  );
}

export function OwnTeamSwitches({
  view,
  name,
  leadName,
  disabled,
  onMember,
  onDelegate,
}: {
  view: OwnTeamView;
  // The agent's name, and the lead's when the lead is another agent.
  name: string;
  leadName: string;
  // Saving, or the agent is archived (ProfileForm says why).
  disabled: boolean;
  onMember: (next: boolean) => void;
  onDelegate: (next: boolean) => void;
}) {
  const t = useT();
  if (!view.known) return null;
  const delegateHint = [
    t("agentProfile.team.delegateHint", { name }),
    view.hasTeam && !view.member ? t("agentProfile.team.delegateJoins", { name }) : "",
    view.hasTeam ? "" : t("agentProfile.team.noTeam"),
  ].filter(Boolean).join(" ");
  return (
    <>
      {view.showMembership && (
        <Row
          title={t("agentProfile.team.member", { lead: leadName })}
          hint={t("agentProfile.team.memberHint", { lead: leadName, name })}
          checked={view.member}
          disabled={disabled}
          onChange={onMember}
        />
      )}
      <Row
        title={t("agentProfile.team.delegate")}
        hint={delegateHint}
        checked={view.delegate}
        disabled={disabled || !view.hasTeam}
        onChange={onDelegate}
      />
    </>
  );
}
