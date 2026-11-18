import { Suspense } from "react";
import { AuthGate } from "@/components/AuthGate";
import { AppShell } from "@/components/shell/AppShell";

// The Apps page sits in the same frame as the /agents and /computers pages: the shared sidebar,
// inside Suspense (AppShell and the page read the query string; static export) and AuthGate.
export default function AppsLayout({ children }: LayoutProps<"/apps">) {
  return (
    <Suspense fallback={<p className="p-6 text-center text-sm text-muted">Loading…</p>}>
      <AuthGate>
        <AppShell>{children}</AppShell>
      </AuthGate>
    </Suspense>
  );
}
