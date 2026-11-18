"use client";

import { Users } from "lucide-react";
import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import { people, type Invite, type Person } from "@/lib/people";
import type { Permission } from "@/lib/permissions";
import { useT } from "@/lib/use-i18n";
import {
  accessForChoice,
  canManageMember,
  memberDetail,
  memberInitial,
  roleChoiceOf,
  sortMembers,
  startingPermissions,
  type RoleChoice,
  type Viewer,
} from "@/lib/workspace-settings";
import { useSession } from "@/components/AuthGate";
import { Badge } from "@/components/ui/Badge";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonList } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { SettingsCard } from "./SettingsCard";
import { HandOverCard } from "./workspace/HandOverCard";
import { HistoryCard } from "./workspace/HistoryCard";
import { HostedMembers } from "./workspace/HostedMembers";
import { InvitePanel, OpenInvites } from "./workspace/InvitePanel";
import { MemberAvatar, PermissionChecklist, RoleSelect, useDateFormat } from "./workspace/shared";

// Members (design: WorkspaceSettings.html, "Members"): everyone in this workspace with their role,
// invitation links and who is waiting to join. GET /people for everyone signed in; inviting, roles
// and removal are admin-only (backend auth/people_routes.py). In a hosted workspace the account
// service owns the list; the desktop app is one person, so it has none.
export function MembersSettings() {
  const { session } = useSession();
  return (
    <div id="setting-members-list" data-setting-id="setting-members-list" data-setting-container data-setting-root tabIndex={-1} className="flex flex-col gap-5">
      {session?.kind === "grant" ? <HostedMembers /> : <LocalMembers />}
    </div>
  );
}

type Phase = "loading" | "ready" | "unavailable" | "failed";

function failure(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

function LocalMembers() {
  const t = useT();
  const toast = useToast();
  const date = useDateFormat();
  const { session } = useSession();
  const admin = session !== null && session.kind !== "desktop" && session.scopes.includes("admin");
  const viewer: Viewer = { admin, owner: session?.role === "owner" || (session !== null && session.role == null && admin) };
  const desktop = session?.kind === "desktop";

  const [roster, setRoster] = useState<Person[] | null>(null);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [phase, setPhase] = useState<Phase>(desktop ? "unavailable" : "loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  // The member whose own mix of permissions is open, and the mix being chosen.
  const [editing, setEditing] = useState<{ id: number; permissions: Permission[] } | null>(null);
  const [removing, setRemoving] = useState<Person | null>(null);

  useEffect(() => {
    if (desktop) return;
    let alive = true;
    // Everyone reads the roster; only admins may read the open invitations.
    Promise.all([people.list(), admin ? people.invites() : Promise.resolve([] as Invite[])])
      .then(([list, open]) => { if (alive) { setRoster(list); setInvites(open); setPhase("ready"); setLoadError(null); } })
      .catch((err: unknown) => {
        if (!alive) return;
        if (err instanceof ApiError && err.status === 409) setPhase("unavailable");
        else { setLoadError(failure(err, t("members.loadFailed"))); setPhase((current) => (current === "ready" ? current : "failed")); }
      });
    return () => { alive = false; };
  }, [desktop, admin, tick, t]);

  const refresh = () => setTick((n) => n + 1);

  const act = async (work: () => Promise<unknown>, fallback: string, done?: string) => {
    setBusy(true);
    setActionError(null);
    try {
      await work();
      if (done) toast(done);
      refresh();
      return true;
    } catch (err) {
      setActionError(failure(err, fallback));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const choose = (person: Person, choice: RoleChoice) => {
    if (choice === "custom") {
      setEditing({ id: person.id, permissions: startingPermissions(person.role, person.permissions) });
      return;
    }
    if (choice === roleChoiceOf(person.role, person.permissions)) return;
    const change = accessForChoice(choice);
    if (!change) return;
    setEditing(null);
    void act(() => people.update(person.id, change), t("members.changeFailed"), t("members.changed", { name: person.display_name }));
  };

  const saveCustom = async (person: Person) => {
    if (!editing) return;
    const ok = await act(() => people.update(person.id, { role: "member", permissions: editing.permissions }), t("members.changeFailed"), t("members.changed", { name: person.display_name }));
    if (ok) setEditing(null);
  };

  if (phase === "unavailable") {
    return (
      <SettingsCard title={t("members.title")} description={t("members.description")}>
        <EmptyState icon={<Users size={24} />} title={t("members.unavailableTitle")} description={t("members.unavailableBody")} />
      </SettingsCard>
    );
  }

  const me = roster?.find((person) => person.is_you) ?? null;
  const sorted = roster ? sortMembers(roster) : null;

  return (
    <>
      <SettingsCard title={t("members.title")} description={t("members.description")}>
        {loadError && (
          <Banner tone="danger" action={<Button size="sm" onClick={refresh}>{t("members.retry")}</Button>}>{loadError}</Banner>
        )}
        {actionError && <Banner tone="danger" onDismiss={() => setActionError(null)}>{actionError}</Banner>}
        {sorted === null ? (phase === "loading" ? <SkeletonList rows={3} /> : null) : (
          <ul className="flex flex-col" aria-label={t("members.listLabel")}>
            {sorted.map((person) => {
              const manage = canManageMember(viewer, person);
              const choice = roleChoiceOf(person.role, person.permissions);
              const detail = memberDetail(person, date).map((part) => t(part.key, part.params)).join(" · ");
              const open = editing?.id === person.id;
              return (
                <li key={person.id} className="flex flex-wrap items-center gap-3 border-b border-line py-2.5 last:border-b-0">
                  <MemberAvatar initial={memberInitial(person.display_name)} />
                  <div className="min-w-0 flex-[1_1_200px]">
                    <p className="flex min-w-0 flex-wrap items-center gap-2 text-body font-medium text-ink">
                      <span className="min-w-0 break-words">{person.display_name}</span>
                      {person.is_you && <Badge>{t("members.you")}</Badge>}
                    </p>
                    <p className="break-words text-small text-muted">
                      {detail}
                      {choice === "custom" && <span className="block">{t("members.customDetail", { list: person.permissions.length ? person.permissions.map((p) => t(`members.permission.${p}`)).join(", ") : t("members.readOnly") })}</span>}
                    </p>
                  </div>
                  {manage ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <RoleSelect
                        value={choice}
                        viewer={viewer}
                        current={person}
                        disabled={busy}
                        label={t("members.roleFor", { name: person.display_name })}
                        onChange={(next) => choose(person, next)}
                        className="w-48"
                      />
                      <Button disabled={busy} onClick={() => setRemoving(person)} className="text-danger" aria-label={t("members.removeName", { name: person.display_name })}>
                        {t("members.remove")}
                      </Button>
                    </div>
                  ) : (
                    <Badge tone={person.role === "owner" ? "accent" : "neutral"}>{t(person.role === "owner" ? "members.role.owner" : `members.role.${choice}`)}</Badge>
                  )}
                  {manage && open && editing && (
                    <div className="flex w-full flex-col gap-3 pb-1">
                      <PermissionChecklist
                        value={editing.permissions}
                        onChange={(permissions) => setEditing({ id: person.id, permissions })}
                        owner={viewer.owner}
                        disabled={busy}
                        legend={t("members.whatMay", { name: person.display_name })}
                      />
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button variant="ghost" disabled={busy} onClick={() => setEditing(null)}>{t("members.cancel")}</Button>
                        <Button variant="primary" loading={busy} onClick={() => void saveCustom(person)}>{t("members.savePermissions")}</Button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {admin && phase === "ready" && (
          <div id="setting-members-invite" data-setting-id="setting-members-invite" data-setting-container tabIndex={-1}>
            <InvitePanel viewer={viewer} onCreated={refresh} />
          </div>
        )}
      </SettingsCard>

      {admin && phase === "ready" && invites.length > 0 && (
        <div id="setting-members-invites-open" data-setting-id="setting-members-invites-open" data-setting-container tabIndex={-1}>
          <OpenInvites
            invites={invites}
            viewer={viewer}
            busy={busy}
            onRevoke={(invite) => void act(() => people.revokeInvite(invite.id), t("members.revokeFailed"), t("members.revoked", { email: invite.email }))}
          />
        </div>
      )}

      {phase === "ready" && me?.role === "owner" && (
        <div id="setting-members-handover" data-setting-id="setting-members-handover" data-setting-container tabIndex={-1}>
          <HandOverCard roster={roster ?? []} me={me} />
        </div>
      )}

      {admin && phase === "ready" && (
        <div id="setting-members-history" data-setting-id="setting-members-history" data-setting-container tabIndex={-1}>
          <HistoryCard refreshKey={tick} />
        </div>
      )}

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => { if (!open) setRemoving(null); }}
        title={removing ? t("members.removeTitle", { name: removing.display_name }) : ""}
        description={t("members.removeBody")}
        confirmLabel={t("members.remove")}
        cancelLabel={t("members.cancel")}
        danger
        loading={busy}
        onConfirm={async () => {
          if (!removing) return;
          const person = removing;
          // A failure shows on the card, so the dialog closes either way.
          await act(() => people.remove(person.id), t("members.removeFailed", { name: person.display_name }), t("members.removed", { name: person.display_name }));
          setRemoving(null);
        }}
      />
    </>
  );
}
