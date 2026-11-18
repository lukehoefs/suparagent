"use client";

// /marketplace/ moved into /apps/ (MCP listings under Marketplace, custom servers under Custom MCP
// servers). Old links, bookmarks and the #custom-mcp-heading anchor land on the same place there.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { APPS_HREF, marketplaceRedirectHref } from "@/lib/apps-page";
import { useT } from "@/lib/use-i18n";

export function MarketplaceRedirect() {
  const t = useT();
  const router = useRouter();
  useEffect(() => {
    router.replace(marketplaceRedirectHref(window.location.search, window.location.hash));
  }, [router]);
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-2 bg-surface p-6 text-center">
      <p role="status" className="text-body text-muted">{t("apps.redirect")}</p>
      <Link href={APPS_HREF} className="text-body text-accent-text underline underline-offset-2">{t("apps.redirectLink")}</Link>
    </main>
  );
}
