"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { request } from "@/lib/api";
import { useT } from "@/lib/use-i18n";

type Page = { id: string; title: string; html: string };

// A page an agent made, shown in a sandboxed frame. `allow-scripts` without `allow-same-origin`
// gives the frame an opaque origin: its scripts run, but it cannot read this app's cookies or
// storage, call its API, or navigate the app (no top navigation). Links open in a new tab.
export const CUSTOM_PAGE_SANDBOX = "allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals";

export function CustomPage() {
  const t = useT();
  const id = useSearchParams().get("id") ?? "";
  const valid = /^[a-z0-9-]{1,40}$/.test(id);
  // The answer for one id; a stale answer for another id counts as still loading.
  const [loaded, setLoaded] = useState<{ id: string; page: Page | null } | null>(null);
  const page = loaded?.id === id ? loaded.page : null;
  const missing = !valid || (loaded?.id === id && loaded.page === null);

  useEffect(() => {
    if (!valid) return;
    let live = true;
    request<Page>(`/ui-config/pages/${id}`)
      .then((found) => live && setLoaded({ id, page: found }))
      .catch(() => live && setLoaded({ id, page: null }));
    return () => {
      live = false;
    };
  }, [id, valid]);

  useEffect(() => {
    if (page) document.title = `${page.title} · lukethomas`;
  }, [page]);

  if (missing) {
    return <p className="p-6 text-center text-sm text-muted">{t("uiCustom.pageMissing")}</p>;
  }
  if (!page) return <p className="p-6 text-center text-sm text-muted">{t("uiCustom.loading")}</p>;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-2 border-b border-line px-5 py-3">
        <h1 className="truncate text-title font-semibold text-ink">{page.title}</h1>
        <span className="text-small text-faint">{t("uiCustom.madeByAgent")}</span>
      </header>
      <iframe
        key={page.id}
        title={page.title}
        sandbox={CUSTOM_PAGE_SANDBOX}
        referrerPolicy="no-referrer"
        srcDoc={page.html}
        className="min-h-0 w-full flex-1 border-0 bg-surface"
      />
    </div>
  );
}
