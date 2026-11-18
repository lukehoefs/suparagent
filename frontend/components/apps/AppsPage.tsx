"use client";

// The Apps page (design: Apps.html), inside the app shell: what agents can connect to. Connected
// apps (Composio), custom MCP servers with the three-step Add a server, and the marketplace (MCP
// listings and Composio's catalog). Owner and admin only, like every route it uses. The old
// /marketplace/ page redirects here (components/apps/MarketplaceRedirect.tsx).
import { LayoutGrid, Plus } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { CatalogApp } from "@/lib/apps-catalog";
import { ADD_SERVER_PARAM, ADD_SERVER_VALUE, ALL_MARKET, connectedAppCards, type MarketFilter } from "@/lib/apps-page";
import { appLabel } from "@/lib/connected-apps";
import { useT } from "@/lib/use-i18n";
import { useAppShell } from "@/components/shell/AppShell";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Card } from "@/components/ui/Surface";
import { AddServerPanel } from "./AddServerPanel";
import { AppDialog } from "./AppDialog";
import { ComposioKeyDialog } from "./ComposioKeyDialog";
import { ConnectedApps } from "./ConnectedApps";
import { CustomServers } from "./CustomServers";
import { MarketplaceSection } from "./MarketplaceSection";
import { useAgentOptions } from "./shared";
import { useCatalog } from "./useCatalog";
import { useComposio } from "./useComposio";
import { useCustomServers, useMarketplace } from "./useServers";

function Header({ action }: { action?: ReactNode }) {
  const t = useT();
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-h1 font-semibold tracking-[-0.02em] text-ink">{t("apps.title")}</h1>
        <p className="mt-1 text-body text-muted">{t("apps.subtitle")}</p>
      </div>
      {action ? <div className="flex flex-wrap items-center gap-2">{action}</div> : null}
    </header>
  );
}

export function AppsPage() {
  const t = useT();
  const { isAdmin } = useAppShell();
  return (
    <div className="flex flex-col gap-6 px-4 pb-10 pt-5 sm:px-8 sm:pt-7">
      {isAdmin ? <Apps /> : (
        <>
          <Header />
          <Card><EmptyState icon={<LayoutGrid size={24} />} title={t("apps.adminOnly.title")} description={t("apps.adminOnly.body")} /></Card>
        </>
      )}
    </div>
  );
}

function Apps() {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const askedToAdd = params.get(ADD_SERVER_PARAM) === ADD_SERVER_VALUE;
  const [adding, setAdding] = useState(askedToAdd);
  const panelHeading = useRef<HTMLHeadingElement>(null);
  // Focus goes back to the header's Add server when the panel closes.
  const addButton = useRef<HTMLButtonElement>(null);
  // Set when Add server is pressed: once the panel shows, it is scrolled to and focused.
  const reveal = useRef(askedToAdd);

  const composio = useComposio();
  const [filter, setFilter] = useState<MarketFilter>(ALL_MARKET);
  const catalog = useCatalog(filter, composio.keyTick);
  const market = useMarketplace();
  const servers = useCustomServers();
  const agents = useAgentOptions();
  const [openApp, setOpenApp] = useState<CatalogApp | null>(null);
  const [keyOpen, setKeyOpen] = useState(false);

  const cards = useMemo(
    () => connectedAppCards(catalog.home?.apps ?? [], catalog.apps ?? [], composio.accounts, appLabel),
    [catalog.home, catalog.apps, composio.accounts],
  );
  const cardsLoading = composio.status === null
    ? !composio.statusFailed
    : (catalog.home === null && catalog.homeProblem === null) || (composio.configured && composio.accounts === null && !composio.accountsFailed);

  useEffect(() => {
    if (!adding || !reveal.current) return;
    reveal.current = false;
    panelHeading.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    panelHeading.current?.focus({ preventScroll: true });
  }, [adding]);

  const openAdd = useCallback(() => {
    if (adding) {
      panelHeading.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      panelHeading.current?.focus({ preventScroll: true });
      return;
    }
    reveal.current = true;
    setAdding(true);
  }, [adding]);

  const closeAdd = useCallback(() => {
    setAdding(false);
    requestAnimationFrame(() => addButton.current?.focus());
    // Reloading the page should not open the panel again.
    if (askedToAdd) router.replace(pathname ?? "/apps/", { scroll: false });
  }, [askedToAdd, router, pathname]);

  return (
    <>
      <Header action={<Button ref={addButton} icon={<Plus size={15} aria-hidden="true" />} onClick={openAdd}>{t("apps.addServer")}</Button>} />
      <ConnectedApps
        composio={composio}
        cards={cards}
        loading={cardsLoading}
        catalogProblem={catalog.homeProblem}
        onRetryCatalog={catalog.retry}
        onOpen={setOpenApp}
        onOpenKey={() => setKeyOpen(true)}
      />
      <CustomServers servers={servers} agents={agents} onAdd={openAdd} />
      {adding && <AddServerPanel headingRef={panelHeading} servers={servers} agents={agents} onClose={closeAdd} />}
      <MarketplaceSection
        filter={filter}
        onFilter={setFilter}
        catalog={catalog}
        market={market}
        composio={composio}
        exclude={cards}
        agents={agents}
        onOpenApp={setOpenApp}
        onOpenKey={() => setKeyOpen(true)}
      />
      {openApp && <AppDialog key={openApp.app} app={openApp} composio={composio} onOpenKey={() => { setOpenApp(null); setKeyOpen(true); }} onClose={() => setOpenApp(null)} />}
      {keyOpen && <ComposioKeyDialog composio={composio} onClose={() => setKeyOpen(false)} />}
    </>
  );
}
