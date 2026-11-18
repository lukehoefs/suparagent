"use client";

// Settings › Agent permissions: the permissions matrix (components/settings/permissions/). Every route
// behind it is the workspace owner's or an admin's, so anyone else is told so instead of seeing errors.
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
  if (!isAdmin) {
    return (
      <Card>
        <EmptyState icon={<ShieldCheck size={24} />} title={t("permissions.adminOnly.title")} description={t("permissions.adminOnly.body")} />
      </Card>
    );
  }
  return <PermissionsMatrix />;
}
