"use client";

// Settings › Agent permissions: the permissions matrix (components/settings/permissions/). Every route
// behind it is the workspace owner's or an admin's, so anyone else is told so instead of seeing errors.
// The page names itself under the Settings title (design: Permissions.html header), whatever state it is in.
import { ShieldCheck } from "lucide-react";
import { useSession } from "@/components/AuthGate";
import { useT } from "@/lib/use-i18n";
import { EmptyState } from "@/components/ui/EmptyState";
import { Card } from "@/components/ui/Surface";
import { PermissionsMatrix } from "./permissions/PermissionsMatrix";

export function PermissionsSettings() {
  const t = useT();
  const { session } = useSession();
  // As the app shell decides it: no session information (the desktop app, a trusted local page) is the owner.
  const isAdmin = session === null || session.scopes.includes("admin");
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h2 className="text-h2 font-semibold text-ink">{t("settingsNav.permissions")}</h2>
        <p className="mt-1 text-body text-muted">{t("permissions.summary")}</p>
      </header>
      {isAdmin ? (
        <PermissionsMatrix />
      ) : (
        <Card>
          <EmptyState icon={<ShieldCheck size={24} />} title={t("permissions.adminOnly.title")} description={t("permissions.adminOnly.body")} />
        </Card>
      )}
    </div>
  );
}
