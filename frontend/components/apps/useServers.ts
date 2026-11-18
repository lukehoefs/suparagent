"use client";

// The page's lists of MCP servers: the owner's custom servers, and the marketplace listings with
// the copies added from them.
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { problemOf, reserveSignInTab, signInFinished, type Problem } from "@/lib/apps-page";
import type { TabWindow } from "@/lib/connected-apps";
import type { CustomMcpConnection } from "@/lib/custom-mcp";
import type { MarketplaceCatalog, MarketplaceConnection } from "@/lib/marketplace";
import { useT } from "@/lib/use-i18n";
import { useToast } from "@/components/ui/Toast";

const SIGN_IN_EVERY_MS = 2000;
const SIGN_IN_FOR_MS = 10 * 60_000;

export type CustomServers = {
  list: CustomMcpConnection[] | null;
  problem: Problem | null;
  reload: () => Promise<void>;
  put: (next: CustomMcpConnection) => void;
  drop: (id: string) => void;
  // The server whose sign-in tab is open, while the page waits for it.
  signingIn: string | null;
  startSignIn: (server: CustomMcpConnection) => Promise<Problem | null>;
};

export function useCustomServers(): CustomServers {
  const t = useT();
  const toast = useToast();
  const [list, setList] = useState<CustomMcpConnection[] | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [signingIn, setSigningIn] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setList(await api.listCustomMcp());
    setProblem(null);
  }, []);

  useEffect(() => {
    let live = true;
    api.listCustomMcp()
      .then((found) => { if (live) setList(found); })
      .catch((err: unknown) => { if (live) setProblem(problemOf(err, "apps.servers.loadFailed")); });
    return () => { live = false; };
  }, []);

  const put = useCallback((next: CustomMcpConnection) => {
    setList((current) => {
      if (!current) return [next];
      return current.some((item) => item.id === next.id) ? current.map((item) => (item.id === next.id ? next : item)) : [...current, next];
    });
  }, []);
  const drop = useCallback((id: string) => setList((current) => current?.filter((item) => item.id !== id) ?? current), []);

  // While a provider tab is open, look for the finished sign-in every couple of seconds (up to 10 minutes).
  const started = useRef(0);
  useEffect(() => {
    if (!signingIn) return;
    started.current = Date.now();
    const timer = window.setInterval(() => {
      api.listCustomMcp().then((found) => {
        setList(found);
        const server = found.find((item) => item.id === signingIn);
        // Signed in is not enough: a server whose sign-in was turned down is signed in already.
        if (signInFinished(server)) {
          setSigningIn(null);
          if (server?.oauth_signed_in) toast(t("apps.servers.signedInToast"));
        } else if (Date.now() - started.current >= SIGN_IN_FOR_MS) {
          setSigningIn(null);
          setProblem({ key: "apps.servers.signInTimeout", detail: null });
        }
      }).catch(() => undefined);
    }, SIGN_IN_EVERY_MS);
    return () => window.clearInterval(timer);
  }, [signingIn, t, toast]);

  // Called straight from a click: the tab is opened before anything is awaited (lib/apps-page.ts
  // reserveSignInTab), so a browser does not block it after the server's discovery and registration.
  const startSignIn = useCallback(async (server: CustomMcpConnection) => {
    const tab = reserveSignInTab((url, features) => window.open(url, "_blank", features) as TabWindow | null);
    try {
      const { authorization_url: url } = await api.startCustomMcpSignIn(server.id, server.revision);
      tab.navigate(url);
      setSigningIn(server.id);
      toast(t("apps.servers.signInStarted"), "info");
      return null;
    } catch (err) {
      tab.cancel();
      return problemOf(err, "apps.error.generic");
    }
  }, [t, toast]);

  return { list, problem, reload, put, drop, signingIn, startSignIn };
}

export type Marketplace = {
  catalog: MarketplaceCatalog | null;
  connections: MarketplaceConnection[];
  problem: Problem | null;
  refresh: () => Promise<void>;
};

export function useMarketplace(): Marketplace {
  const [catalog, setCatalog] = useState<MarketplaceCatalog | null>(null);
  const [connections, setConnections] = useState<MarketplaceConnection[]>([]);
  const [problem, setProblem] = useState<Problem | null>(null);

  const refresh = useCallback(async () => {
    const [nextCatalog, nextConnections] = await Promise.all([api.getMarketplaceCatalog(), api.listMarketplaceConnections()]);
    setCatalog(nextCatalog);
    setConnections(nextConnections);
    setProblem(null);
  }, []);

  useEffect(() => {
    let live = true;
    Promise.all([api.getMarketplaceCatalog(), api.listMarketplaceConnections()])
      .then(([nextCatalog, nextConnections]) => { if (live) { setCatalog(nextCatalog); setConnections(nextConnections); } })
      .catch((err: unknown) => { if (live) setProblem(problemOf(err, "apps.market.listingsFailed")); });
    return () => { live = false; };
  }, []);

  return { catalog, connections, problem, refresh };
}
