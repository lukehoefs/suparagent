import { Suspense } from "react";
import { AuthGate } from "@/components/AuthGate";
import { AppShell } from "@/components/shell/AppShell";

// The Tasks board sits in the same frame as the /agents and /computers pages: the shared sidebar,
// inside Suspense (AppShell and the board read the query string; static export) and AuthGate.
export default function TasksLayout({ children }: LayoutProps<"/tasks">) {
  return (
    <Suspense fallback={<p className="p-6 text-center text-sm text-muted">Loading…</p>}>
      <AuthGate>
        <AppShell>{children}</AppShell>
      </AuthGate>
    </Suspense>
  );
}
