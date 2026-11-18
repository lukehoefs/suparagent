import { Suspense } from "react";
import { AuthGate } from "@/components/AuthGate";
import { AppShell } from "@/components/shell/AppShell";

// The Computers page sits in the same frame as the /agents pages: the shared sidebar, inside
// Suspense (AppShell reads the query string; static export) and AuthGate.
export default function ComputersLayout({ children }: LayoutProps<"/computers">) {
  return (
    <Suspense fallback={<p className="p-6 text-center text-sm text-muted">Loading…</p>}>
      <AuthGate>
        <AppShell>{children}</AppShell>
      </AuthGate>
    </Suspense>
  );
}
