import { Suspense } from "react";
import { AuthGate } from "@/components/AuthGate";
import { AppShell } from "@/components/shell/AppShell";

// The Today page sits in the same frame as the /agents and /computers pages: the shared sidebar,
// inside Suspense (AppShell reads the query string; static export) and AuthGate.
export default function TodayLayout({ children }: LayoutProps<"/today">) {
  return (
    <Suspense fallback={<p className="p-6 text-center text-sm text-muted">Loading…</p>}>
      <AuthGate>
        <AppShell>{children}</AppShell>
      </AuthGate>
    </Suspense>
  );
}
