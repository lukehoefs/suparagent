"use client";

// Connected apps through Composio: the owner's key, the accounts, and connecting one in the browser.
// One instance for the page, shared by Connected apps and the marketplace.
import { useCallback, useEffect, useState } from "react";
import { api, type ComposioStatus } from "@/lib/api";
import type { CatalogApp } from "@/lib/apps-catalog";
import { problemOf, reserveTab, type Problem } from "@/lib/apps-page";
import { POLL_INTERVAL_MS, outcomeFor, pollDeadline, type ComposioAccount, type TabWindow } from "@/lib/connected-apps";
import { useT } from "@/lib/use-i18n";
import { useToast } from "@/components/ui/Toast";

export type Waiting = { accountId: string; app: string; name: string; expiresIn: number };

export type Composio = {
  status: ComposioStatus | null;
  configured: boolean;
  accounts: ComposioAccount[] | null;
  problem: Problem | null;
  // The accounts could not be read; a retry is offered.
  accountsFailed: boolean;
  notice: string | null;
  waiting: Waiting | null;
  busy: string | null;
  // Moves when the key changes, so the catalog is read again under the new key.
  keyTick: number;
  loadAccounts: () => Promise<void>;
  connect: (app: Pick<CatalogApp, "app" | "name">, alias?: string) => Promise<boolean>;
  disconnect: (account: ComposioAccount) => Promise<boolean>;
  stopWaiting: () => void;
  saveKey: (key: string) => Promise<Problem | null>;
  removeKey: () => Promise<Problem | null>;
  dismiss: () => void;
};

export function useComposio(): Composio {
  const t = useT();
  const toast = useToast();
  const [status, setStatus] = useState<ComposioStatus | null>(null);
  const [accounts, setAccounts] = useState<ComposioAccount[] | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [accountsFailed, setAccountsFailed] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [waiting, setWaiting] = useState<Waiting | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [keyTick, setKeyTick] = useState(0);

  const loadAccounts = useCallback(async () => {
    try {
      setAccounts(await api.listComposioAccounts());
      setAccountsFailed(false);
      setProblem(null);
    } catch (err) {
      setAccountsFailed(true);
      setProblem(problemOf(err, "apps.connected.loadFailed"));
    }
  }, []);

  useEffect(() => {
    let live = true;
    api.getComposioStatus()
      .then((value) => {
        if (!live) return;
        setStatus(value);
        if (value.configured) void loadAccounts();
      })
      .catch((err: unknown) => { if (live) setProblem(problemOf(err, "apps.connected.loadFailed")); });
    return () => { live = false; };
  }, [loadAccounts]);

  // Waiting for the person to finish in the browser: stops on success, failure, the link's lifetime,
  // Stop waiting, and when the page goes away.
  const accountId = waiting?.accountId;
  const expiresIn = waiting?.expiresIn;
  const waitingName = waiting?.name;
  useEffect(() => {
    if (!accountId || expiresIn === undefined) return;
    const deadline = pollDeadline(expiresIn, Date.now());
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const stop = (key: string) => { setWaiting(null); setProblem({ key, detail: null }); };
    const poll = async () => {
      try {
        const latest = await api.listComposioAccounts();
        if (cancelled) return;
        setAccounts(latest);
        const outcome = outcomeFor(latest, accountId);
        if (outcome === "connected") { setWaiting(null); toast(t("apps.connected.done", { name: waitingName ?? "" })); return; }
        if (outcome === "failed") return stop("apps.connected.failed");
        if (outcome === "gone") return stop("apps.connected.gone");
      } catch (err) {
        if (cancelled) return;
        setWaiting(null);
        setProblem(problemOf(err, "apps.connected.checkFailed"));
        return;
      }
      if (Date.now() > deadline) return stop("apps.connected.expired");
      timer = setTimeout(() => void poll(), POLL_INTERVAL_MS);
    };
    timer = setTimeout(() => void poll(), POLL_INTERVAL_MS);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [accountId, expiresIn, waitingName, toast, t]);

  // Called straight from a click: the tab is opened before anything is awaited.
  const connect = useCallback(async (app: Pick<CatalogApp, "app" | "name">, alias?: string) => {
    const page = reserveTab(window.suparagent, (url, target) => window.open(url, target) as TabWindow | null);
    setBusy(`connect:${app.app}`); setProblem(null); setNotice(null);
    try {
      const link = await api.connectComposioApp(app.app, alias?.trim() || undefined);
      await page.navigate(link.redirect_url);
      setWaiting({ accountId: link.account_id, app: app.app, name: app.name, expiresIn: link.expires_in_seconds });
      await loadAccounts();
      return true;
    } catch (err) {
      page.cancel();
      setProblem(problemOf(err, "apps.connected.startFailed"));
      return false;
    } finally {
      setBusy(null);
    }
  }, [loadAccounts]);

  const disconnect = useCallback(async (account: ComposioAccount) => {
    setBusy(`remove:${account.id}`); setProblem(null); setNotice(null);
    try {
      await api.disconnectComposioAccount(account.id);
      setWaiting((current) => (current?.accountId === account.id ? null : current));
      toast(t("apps.app.disconnected"));
      await loadAccounts();
      return true;
    } catch (err) {
      setProblem(problemOf(err, "apps.app.disconnectFailed"));
      return false;
    } finally {
      setBusy(null);
    }
  }, [loadAccounts, t, toast]);

  // The key is typed by the owner, sent once, and never kept on this page.
  const saveKey = useCallback(async (key: string) => {
    setBusy("key"); setNotice(null);
    try {
      const saved = await api.saveComposioKey(key.trim());
      setStatus(saved); setAccounts(null); setWaiting(null); setProblem(null);
      setKeyTick((n) => n + 1);
      toast(t("apps.key.saved"));
      await loadAccounts();
      return null;
    } catch (err) {
      return problemOf(err, "apps.key.saveFailed");
    } finally {
      setBusy(null);
    }
  }, [loadAccounts, t, toast]);

  const removeKey = useCallback(async () => {
    setBusy("key");
    try {
      await api.deleteComposioKey();
      setStatus((current) => current && { ...current, configured: false });
      setAccounts(null); setWaiting(null); setProblem(null); setAccountsFailed(false);
      setKeyTick((n) => n + 1);
      setNotice("apps.key.removed");
      return null;
    } catch (err) {
      return problemOf(err, "apps.key.removeFailed");
    } finally {
      setBusy(null);
    }
  }, []);

  const stopWaiting = useCallback(() => { setWaiting(null); setNotice("apps.connected.stopped"); }, []);
  const dismiss = useCallback(() => { setProblem(null); setNotice(null); }, []);

  return {
    status, configured: status?.configured === true, accounts, problem, accountsFailed, notice, waiting, busy, keyTick,
    loadAccounts, connect, disconnect, stopWaiting, saveKey, removeKey, dismiss,
  };
}
