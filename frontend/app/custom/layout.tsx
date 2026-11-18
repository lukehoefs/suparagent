import { Suspense } from "react";
import { AuthGate } from "@/components/AuthGate";
import { AppShell } from "@/components/shell/AppShell";

// A page an agent made (lib/ui-config.ts). AppShell reads the query string, so it sits inside
// Suspense (static export), and inside AuthGate so nothing renders before the session is known.
export default function CustomLayout({ children }: LayoutProps<"/custom">) {
  return (
    <Suspense fallback={<p className="p-6 text-center text-sm text-muted">Loading…</p>}>
      <AuthGate>
        <AppShell>{children}</AppShell>
      </AuthGate>
    </Suspense>
  );
}
