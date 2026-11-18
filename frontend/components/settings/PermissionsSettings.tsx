"use client";

// Settings › Agent permissions: the permissions matrix (components/settings/permissions/). Every route
// behind it is the workspace owner's or an admin's, so anyone else is told so instead of seeing errors.
// A page of its own (design: Permissions.html): its title, what it is for and the way back to every
// setting, then the full width for the filters and the matrix, whatever state it is in.
import { ShieldCheck } from "lucide-react";
import { useSession } from "@/components/AuthGate";
import { useT } from "@/lib/use-i18n";
import { SETTINGS_PAGES } from "@/lib/settings-nav";
import { EmptyState } from "@/components/ui/EmptyState";
import { LinkButton } from "@/components/ui/LinkButton";
import { Card } from "@/components/ui/Surface";
import { PermissionsMatrix } from "./permissions/PermissionsMatrix";

export function PermissionsSettings() {
  const t = useT();
  const { session } = useSession();
  // As the app shell decides it: no session information (the desktop app, a trusted local page) is the owner.
  const isAdmin = session === null || session.scopes.includes("admin");
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-h1 font-semibold tracking-[-0.02em] text-ink">{t("settingsNav.permissions")}</h1>
          <p className="mt-1 text-body text-muted">{t("permissions.summary")}</p>
        </div>
        <LinkButton href={SETTINGS_PAGES[0].href} variant="ghost" className="text-muted hover:text-ink">{t("permissions.allSettings")}</LinkButton>
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
