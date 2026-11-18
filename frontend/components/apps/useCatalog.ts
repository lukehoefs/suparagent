"use client";

// Composio's catalog of apps. "home" is the unfiltered first page: it holds the apps with curated
// agent tools (always first) and the category list. A search or a category asks the server for its
// own pages; "Show more apps" appends the next one.
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { mergeApps, type CatalogApp, type CatalogPage } from "@/lib/apps-catalog";
import { catalogQuery, problemOf, type MarketFilter, type Problem } from "@/lib/apps-page";

type Loaded = { key: string; page: CatalogPage } | { key: string; problem: Problem };

export type Catalog = {
  home: CatalogPage | null;
  homeProblem: Problem | null;
  // The apps for the current filter, with the pages loaded so far; null while loading.
  apps: CatalogApp[] | null;
  page: CatalogPage | null;
  problem: Problem | null;
  nextCursor: string | null;
  loadingMore: boolean;
  moreProblem: Problem | null;
  loadMore: () => Promise<void>;
  retry: () => void;
};

export function useCatalog(filter: MarketFilter, keyTick: number): Catalog {
  const [tick, setTick] = useState(0);
  const [home, setHome] = useState<Loaded | null>(null);
  const [browse, setBrowse] = useState<Loaded | null>(null);
  const [more, setMore] = useState<{ key: string; apps: CatalogApp[]; next: string | null } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreProblem, setMoreProblem] = useState<Problem | null>(null);

  const homeKey = `${keyTick}:${tick}`;
  useEffect(() => {
    let live = true;
    api.getComposioCatalog()
      .then((page) => { if (live) setHome({ key: homeKey, page }); })
      .catch((err: unknown) => { if (live) setHome({ key: homeKey, problem: problemOf(err, "apps.market.catalogFailed") }); });
    return () => { live = false; };
  }, [homeKey]);

  const query = catalogQuery(filter);
  // Only the MCP listings are shown: Composio is not asked.
  const mcpOnly = query === null;
  const search = query?.search ?? "";
  const category = query?.category ?? null;
  const filtered = !mcpOnly && (search !== "" || category !== null);
  const browseKey = mcpOnly ? "" : JSON.stringify([search, category, homeKey]);
  useEffect(() => {
    if (!filtered) return;
    let live = true;
    api.getComposioCatalog({ search, category })
      .then((page) => { if (live) setBrowse({ key: browseKey, page }); })
      .catch((err: unknown) => { if (live) setBrowse({ key: browseKey, problem: problemOf(err, "apps.market.catalogFailed") }); });
    return () => { live = false; };
  }, [browseKey, filtered, search, category]);

  const homeReady = home !== null && home.key === homeKey ? home : null;
  const current = mcpOnly ? null : filtered ? (browse !== null && browse.key === browseKey ? browse : null) : homeReady;
  const currentKey = filtered ? browseKey : homeKey;
  const page = current && "page" in current ? current.page : null;
  const extra = more !== null && more.key === currentKey ? more : null;
  const apps = useMemo(() => page ? mergeApps(page.apps, extra?.apps ?? []) : null, [page, extra]);
  const nextCursor = page ? (extra ? extra.next : page.next_cursor) : null;

  const loadMore = useCallback(async () => {
    if (!page || !nextCursor || mcpOnly) return;
    setLoadingMore(true); setMoreProblem(null);
    try {
      const next = await api.getComposioCatalog({ search, category, cursor: nextCursor });
      setMore((previous) => ({ key: currentKey, apps: mergeApps(previous?.key === currentKey ? previous.apps : [], next.apps), next: next.next_cursor }));
    } catch (err) {
      setMoreProblem(problemOf(err, "apps.market.moreFailed"));
    } finally {
      setLoadingMore(false);
    }
  }, [page, nextCursor, mcpOnly, search, category, currentKey]);

  const retry = useCallback(() => { setMore(null); setTick((n) => n + 1); }, []);

  return {
    home: homeReady && "page" in homeReady ? homeReady.page : null,
    homeProblem: homeReady && "problem" in homeReady ? homeReady.problem : null,
    apps: mcpOnly ? [] : apps,
    page,
    problem: current && "problem" in current ? current.problem : null,
    nextCursor: mcpOnly ? null : nextCursor,
    loadingMore,
    moreProblem,
    loadMore,
    retry,
  };
}
