import { AuthGate } from "@/components/AuthGate";
import { SettingsShell } from "@/components/settings/SettingsShell";
import { PermissionsSettings } from "@/components/settings/PermissionsSettings";

export const metadata = { title: "Agent permissions · lukethomas" };

export default function Page() {
  return (
    <AuthGate>
      <SettingsShell>
        <PermissionsSettings />
      </SettingsShell>
    </AuthGate>
  );
}
