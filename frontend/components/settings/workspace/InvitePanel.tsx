"use client";

import { Link2 } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { ApiError } from "@/lib/api";
import { copyToClipboard } from "@/lib/clipboard";
import { BASE_PATH } from "@/lib/paths";
import { people, type Invite } from "@/lib/people";
import type { Permission } from "@/lib/permissions";
import { inviteLink } from "@/lib/session";
import { useT } from "@/lib/use-i18n";
import { accessForChoice, roleChoiceOf, startingPermissions, type RoleChoice, type Viewer } from "@/lib/workspace-settings";
import { Badge } from "@/components/ui/Badge";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { SettingsCard } from "../SettingsCard";
import { PermissionChecklist, RoleSelect, useDateFormat } from "./shared";

// "Invite someone" (design: the panel under the member list). An invitation is a link that works
// once, only for the email it names, and expires (POST /people/invites); the link's secret comes
// back only in that answer, so it is shown once, here.
export function InvitePanel({ viewer, onCreated }: { viewer: Viewer; onCreated: () => void }) {
  const t = useT();
  const when = useDateFormat(true);
  const emailId = useId();
  const roleId = useId();
  const [email, setEmail] = useState("");
  const [choice, setChoice] = useState<RoleChoice>("member");
  const [permissions, setPermissions] = useState<Permission[]>(() => startingPermissions("member", []));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<(Invite & { token: string }) | null>(null);
  const [copied, setCopied] = useState<boolean | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const address = email.trim();
    if (!address) return;
    const access = choice === "custom" ? { role: "member" as const, permissions } : accessForChoice(choice);
    if (!access) return;
    setBusy(true);
    setError(null);
    try {
      const made = await people.invite(address, access.role, access.role === "member" ? access.permissions : undefined);
      if (!made.token) throw new Error(t("members.inviteNoLink"));
      setCreated({ ...made, token: made.token });
      setCopied(null);
      setEmail("");
      setChoice("member");
      setPermissions(startingPermissions("member", []));
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError || err instanceof Error ? err.message : t("members.inviteFailed"));
    } finally {
      setBusy(false);
    }
  };

  const link = created ? inviteLink(window.location.origin, BASE_PATH, created) : "";

  return (
    <div className="flex flex-col gap-2.5 rounded-card bg-inset p-3.5">
      <h3 className="text-body font-medium text-ink">{t("members.inviteTitle")}</h3>
      {error && <Banner tone="danger">{error}</Banner>}
      {created ? (
        <div className="flex flex-col gap-2.5" aria-live="polite">
          <p className="text-body text-ink">{t("members.inviteSend", { email: created.email, date: when(created.expires_at) })}</p>
          <div className="flex min-w-0 items-center gap-2">
            <Input
              readOnly
              value={link}
              aria-label={t("members.inviteLink")}
              onFocus={(event) => event.currentTarget.select()}
              className="min-w-0 flex-1 border-line-strong font-mono text-small"
              spellCheck={false}
            />
            <Button onClick={async () => setCopied(await copyToClipboard(link))}>{copied ? t("members.copied") : t("members.copy")}</Button>
          </div>
          {copied === false && <p role="alert" className="text-small text-danger">{t("members.copyFailed")}</p>}
          <p className="text-small text-muted">{t("members.inviteOnce")}</p>
          <div>
            <Button variant="ghost" onClick={() => { setCreated(null); setCopied(null); }}>{t("members.inviteAnother")}</Button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-2.5">
          <div className="flex flex-wrap items-end gap-2.5">
            <div className="flex min-w-0 flex-[1_1_220px] flex-col gap-1.5">
              <label htmlFor={emailId} className="text-small font-medium text-muted">{t("members.email.label")}</label>
              <Input id={emailId} type="email" required maxLength={254} autoComplete="off" value={email} disabled={busy} data-setting-focus="setting-members-invite"
                onChange={(event) => setEmail(event.target.value)} placeholder={t("members.email.placeholder")} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor={roleId} className="text-small font-medium text-muted">{t("members.roleLabel")}</label>
              <RoleSelect id={roleId} value={choice} viewer={viewer} disabled={busy} onChange={setChoice} className="w-48" />
            </div>
            <Button type="submit" icon={<Link2 size={14} aria-hidden="true" />} loading={busy} disabled={!email.trim()}>{t("members.createLink")}</Button>
          </div>
          {choice === "custom" && (
            <PermissionChecklist value={permissions} onChange={setPermissions} owner={viewer.owner} disabled={busy} legend={t("members.whatTheyMay")} />
          )}
          <p className="text-small text-muted">{t(`members.roleHelp.${choice}`)} {t("members.inviteHow")}</p>
        </form>
      )}
    </div>
  );
}

// Invitations not used yet. Revoking one stops its link working; an admin invitation is the owner's to revoke.
export function OpenInvites({ invites, viewer, busy, onRevoke }: { invites: Invite[]; viewer: Viewer; busy: boolean; onRevoke: (invite: Invite) => void }) {
  const t = useT();
  const when = useDateFormat();
  return (
    <SettingsCard title={t("members.waitingTitle")} description={t("members.waitingDescription")}>
      <ul className="flex flex-col">
        {invites.map((invite) => {
          const choice = roleChoiceOf(invite.role, invite.permissions);
          return (
            <li key={invite.id} className="flex flex-wrap items-center gap-3 border-b border-line py-2.5 last:border-b-0">
              <div className="min-w-0 flex-[1_1_220px]">
                <p className="flex min-w-0 flex-wrap items-center gap-2 text-body font-medium text-ink">
                  <span className="min-w-0 break-all">{invite.email}</span>
                  <Badge>{t(`members.role.${choice}`)}</Badge>
                </p>
                <p className="text-small text-muted">
                  {[t("members.expires", { date: when(invite.expires_at) }), invite.invited_by ? t("members.invitedBy", { name: invite.invited_by }) : null].filter(Boolean).join(" · ")}
                </p>
              </div>
              <Button disabled={busy || (invite.role === "admin" && !viewer.owner)} onClick={() => onRevoke(invite)} aria-label={t("members.revokeFor", { email: invite.email })}>
                {t("members.revoke")}
              </Button>
            </li>
          );
        })}
      </ul>
    </SettingsCard>
  );
}
