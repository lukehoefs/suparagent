"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { AuthGate, useSession } from "@/components/AuthGate";
import { homeHref } from "@/lib/today";
import { useT } from "@/lib/use-i18n";

// The home page: Today for owners and admins (design: Today.html is the Home screen; it is theirs
// only), the chat for everyone else. The page is plain client code so it also works as a static
// export. AuthGate signs the browser in first and comes back here, so signing in lands on the home
// too; when the server cannot say who is here, the chat opens and shows its own errors.
export default function HomePage() {
  return (
    <AuthGate>
      <Home />
    </AuthGate>
  );
}

function Home() {
  const t = useT();
  const router = useRouter();
  const { session } = useSession();
  const href = homeHref(session?.scopes);
  useEffect(() => {
    router.replace(href);
  }, [router, href]);
  return (
    <p role="status" className="p-6 text-center text-sm text-muted">
      {t("common.loading")} <Link href={href} className="underline">{t("today.home.continue")}</Link>
    </p>
  );
}
