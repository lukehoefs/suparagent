import { Suspense } from "react";
import { AuthGate } from "@/components/AuthGate";
import { AppShell } from "@/components/shell/AppShell";
import { SettingsShell } from "@/components/settings/SettingsShell";

// Every /settings page shares one frame (design: WorkspaceSettings.html): the app's sidebar, then the
// Settings title, search and page list, loaded once while you move between the pages. AppShell reads
// the query string, so it sits inside Suspense (static export), and inside AuthGate so nothing
// renders before the session is known.
export default function SettingsLayout({ children }: LayoutProps<"/settings">) {
  return (
    <Suspense fallback={<p className="p-6 text-center text-sm text-muted">Loading…</p>}>
      <AuthGate>
        <AppShell>
          <SettingsShell>{children}</SettingsShell>
        </AppShell>
      </AuthGate>
    </Suspense>
  );
}
