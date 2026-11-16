import { Suspense } from "react";
import { AuthGate } from "@/components/AuthGate";
import { AppShell } from "@/components/shell/AppShell";

// Every /agents page shares one frame: the sidebar loads once and stays while you move between them.
// AppShell reads the query string, so it sits inside Suspense (static export), and inside AuthGate
// so nothing renders before the session is known.
export default function AgentsLayout({ children }: LayoutProps<"/agents">) {
  return (
    <Suspense fallback={<p className="p-6 text-center text-sm text-muted">Loading…</p>}>
      <AuthGate>
        <AppShell>{children}</AppShell>
      </AuthGate>
    </Suspense>
  );
}
