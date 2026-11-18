"use client";

// The marketplace (design: Apps.html): remote MCP servers from the lukethomas catalog, and the apps
// in Composio's catalog that are not already under Connected apps. The category filter narrows it
// to MCP servers or to one of Composio's categories; search narrows both.
import { Plus, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { CatalogApp } from "@/lib/apps-catalog";
import {
  ALL_MARKET, listingBadge, marketApps, marketFilterActive, marketListings, sectionKey, sourceNoticeKey, type MarketFilter, type MarketListing,
} from "@/lib/apps-page";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/use-i18n";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatusPill } from "@/components/ui/StatusPill";
import { Card } from "@/components/ui/Surface";
import { AppCard } from "./ConnectedApps";
import { ListingDialog } from "./ListingDialog";
import { MARKET_GRID, ProblemBanner, SectionHeading, useCount, type AgentOption } from "./shared";
import type { Catalog } from "./useCatalog";
import type { Composio } from "./useComposio";
import type { Marketplace } from "./useServers";

const CHIPS_SHOWN = 10;
const SEARCH_DELAY_MS = 300;

function Chip({ on, onClick, children, expanded }: { on?: boolean; onClick: () => void; children: string; expanded?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={expanded === undefined ? on : undefined}
      aria-expanded={expanded}
      onClick={onClick}
      className={cn(
        "inline-flex h-control shrink-0 cursor-pointer items-center rounded-full border px-3 text-label font-medium transition-colors duration-(--dur-fast) touch:h-touch",
        on ? "border-transparent bg-accent-bg text-accent-text" : "border-line text-ink hover:bg-hover",
      )}
    >
      {children}
    </button>
  );
}

const listingId = (item: MarketListing) => `${item.section}:${item.listing.slug}:${item.withdrawn ? "w" : "l"}`;

function ListingCard({ item, onOpen }: { item: MarketListing; onOpen: () => void }) {
  const t = useT();
  // A server added already, here or under the other section, is never offered as new.
  const badge = listingBadge(item);
  return (
    <Card className="flex h-full items-center gap-3 p-3.5">
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 cursor-pointer flex-col rounded-field text-left touch:min-h-11">
        <span className="truncate font-medium text-ink">{item.listing.name}</span>
        <span className="truncate text-small text-muted">{t("apps.market.mcpCategory", { section: t(sectionKey(item.section)) })}</span>
      </button>
      {badge ? (
        <StatusPill status={badge.status}>{t(badge.key, badge.section ? { section: t(sectionKey(badge.section)) } : undefined)}</StatusPill>
      ) : (
        <Button icon={<Plus size={15} aria-hidden="true" />} aria-label={t("apps.market.addAria", { name: item.listing.name })} onClick={onOpen}>{t("apps.market.add")}</Button>
      )}
    </Card>
  );
}

export function MarketplaceSection({ filter, onFilter, catalog, market, composio, exclude, agents, onOpenApp, onOpenKey }: {
  filter: MarketFilter;
  onFilter: (next: MarketFilter) => void;
  catalog: Catalog;
  market: Marketplace;
  composio: Composio;
  // The apps already shown under Connected apps.
  exclude: CatalogApp[];
  agents: AgentOption[] | null;
  onOpenApp: (app: CatalogApp) => void;
  onOpenKey: () => void;
}) {
  const t = useT();
  const count = useCount();
  const [searchInput, setSearchInput] = useState(filter.search);
  const [allChips, setAllChips] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  // Typing waits a moment before it asks the server.
  useEffect(() => {
    const timer = setTimeout(() => { if (searchInput !== filter.search) onFilter({ ...filter, search: searchInput }); }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [searchInput, filter, onFilter]);

  const listings = marketListings(market.catalog, market.connections, filter);
  const everyListing = useMemo(() => marketListings(market.catalog, market.connections, ALL_MARKET), [market.catalog, market.connections]);
  const open = openId ? everyListing.find((item) => listingId(item) === openId) ?? null : null;
  const apps = catalog.apps ? marketApps(catalog.apps, exclude) : null;
  const categories = catalog.home?.categories ?? [];
  const chips = allChips ? categories : categories.slice(0, CHIPS_SHOWN);
  const kind = filter.category.kind;
  const notice = kind !== "mcp" && catalog.home ? sourceNoticeKey(catalog.home, composio.configured) : null;

  const listingsLoading = kind !== "app" && market.catalog === null && market.problem === null;
  const appsLoading = kind !== "mcp" && apps === null && catalog.problem === null;
  // A source that failed says so in its banner; "Nothing matches" would blame the filter.
  const listingsFailed = kind !== "app" && market.problem !== null;
  const appsFailed = kind !== "mcp" && catalog.problem !== null;
  const empty = !listingsLoading && !appsLoading && !listingsFailed && !appsFailed && listings.length === 0 && (apps?.length ?? 0) === 0;
  const setCategory = (category: MarketFilter["category"]) => onFilter({ ...filter, category });
  const clear = () => { setSearchInput(""); onFilter(ALL_MARKET); };

  return (
    <section aria-labelledby="apps-market" className="flex flex-col gap-3">
      <SectionHeading id="apps-market" title={t("apps.market.title")} intro={t("apps.market.intro")} />
      <div className="flex flex-col gap-3">
        <div className="relative max-w-md">
          <Search size={15} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <Input type="search" aria-label={t("apps.market.search")} placeholder={t("apps.market.search")} value={searchInput} autoComplete="off"
            className="pl-9" onChange={(event) => setSearchInput(event.target.value)} />
        </div>
        <div role="group" aria-label={t("apps.market.filter")} className="flex flex-wrap gap-2">
          <Chip on={kind === "all"} onClick={() => setCategory({ kind: "all" })}>{t("apps.market.all")}</Chip>
          <Chip on={kind === "mcp"} onClick={() => setCategory(kind === "mcp" ? { kind: "all" } : { kind: "mcp" })}>{t("apps.market.mcp")}</Chip>
          {chips.map((category) => {
            const on = filter.category.kind === "app" && filter.category.name === category.name;
            return <Chip key={category.name} on={on} onClick={() => setCategory(on ? { kind: "all" } : { kind: "app", name: category.name })}>{category.name}</Chip>;
          })}
          {categories.length > CHIPS_SHOWN && (
            <Chip expanded={allChips} onClick={() => setAllChips(!allChips)}>{t(allChips ? "apps.market.fewer" : "apps.market.more")}</Chip>
          )}
        </div>
      </div>

      {notice && <Banner tone={notice.tone}>{t(notice.key)}</Banner>}
      {kind !== "app" && market.problem && (
        <ProblemBanner problem={market.problem} action={<Button onClick={() => void market.refresh().catch(() => undefined)}>{t("apps.retry")}</Button>} />
      )}
      {kind !== "mcp" && catalog.problem && (
        <ProblemBanner problem={catalog.problem} action={<Button onClick={catalog.retry}>{t("apps.retry")}</Button>} />
      )}

      {empty ? (
        <Card>
          <EmptyState
            icon={<Search size={24} />}
            title={t("apps.market.empty.title")}
            description={marketFilterActive(filter) ? t("apps.market.empty.body") : undefined}
            action={marketFilterActive(filter) ? <Button onClick={clear}>{t("apps.market.clear")}</Button> : undefined}
          />
        </Card>
      ) : (
        <ul aria-label={t("apps.market.title")} aria-busy={listingsLoading || appsLoading || undefined} className={MARKET_GRID}>
          {listings.map((item) => (
            <li key={listingId(item)} className="min-w-0"><ListingCard item={item} onOpen={() => setOpenId(listingId(item))} /></li>
          ))}
          {(apps ?? []).map((app) => (
            <li key={app.app} className="min-w-0">
              <AppCard app={app} composio={composio} subtitle={app.categories[0] ?? t("apps.market.app")} onOpen={() => onOpenApp(app)} onOpenKey={onOpenKey} />
            </li>
          ))}
          {(listingsLoading || appsLoading) && [0, 1, 2, 3].map((key) => (
            <li key={`loading-${key}`} aria-hidden="true"><Skeleton className="h-[62px] w-full rounded-card" /></li>
          ))}
        </ul>
      )}

      {catalog.moreProblem && <ProblemBanner problem={catalog.moreProblem} />}
      {catalog.nextCursor && catalog.page && (
        <div className="flex flex-wrap items-center gap-3">
          <Button loading={catalog.loadingMore} onClick={() => void catalog.loadMore()}>{t("apps.market.showMore")}</Button>
          <span className="text-small text-muted">{count("apps.market.total", catalog.page.total)}</span>
        </div>
      )}

      {open && <ListingDialog key={openId} item={open} agents={agents} market={market} onClose={() => setOpenId(null)} />}
    </section>
  );
}
