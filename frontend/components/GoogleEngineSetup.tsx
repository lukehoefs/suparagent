"use client";

import { useEffect, useRef, useState } from "react";
import { api, ApiError, isLocalApiEndpoint, type Engine, type GoogleSetupOperation } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Banner } from "@/components/ui/Banner";
import { Input } from "@/components/ui/Input";

// Google redirects the browser to http://127.0.0.1:<port>/ on the server. When the
// browser is on another machine (a hosted install), that page cannot load and the
// person must paste its URL back here, so the paste box is shown up front.
function serverIsElsewhere(): boolean {
  if (typeof window === "undefined" || window.suparagent?.openGoogleSignIn) return false;
  const host = window.location.hostname.toLowerCase();
  const browserLocal = host === "localhost" || host.endsWith(".localhost") || host.startsWith("127.") || host === "[::1]";
  return !(browserLocal && isLocalApiEndpoint());
}

export function GoogleEngineSetup({ engine, onChanged }: { engine: Engine; onChanged: () => void }) {
  const [operation, setOperation] = useState<GoogleSetupOperation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [callback, setCallback] = useState("");
  const autoOpenedRef = useRef<string | null>(null);
  const changed = useRef(onChanged);
  useEffect(() => { changed.current = onChanged; }, [onChanged]);

  useEffect(() => {
    if (operation?.phase === "running" && operation.authorization_url && autoOpenedRef.current !== operation.authorization_url) {
      autoOpenedRef.current = operation.authorization_url;
      if (window.suparagent?.openGoogleSignIn) {
        window.suparagent.openGoogleSignIn(operation.authorization_url).catch(() => {});
      }
    }
  }, [operation?.phase, operation?.authorization_url]);

  useEffect(() => {
    let cancelled = false;
    api.googleSetupStatus().then((status) => {
      if (!cancelled && status?.phase === "running") setOperation(status);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (operation?.phase !== "running") return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const status = await api.googleSetupStatus();
        if (cancelled) return;
        setOperation(status);
        if (status?.phase !== "running") {
          changed.current();
          return;
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof ApiError ? `Could not check Google setup. ${err.message}` : "Could not check Google setup.");
      }
      if (!cancelled) timer = setTimeout(() => void poll(), 1500);
    };
    timer = setTimeout(() => void poll(), 1000);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [operation?.id, operation?.phase]);

  const act = async (work: () => Promise<void>) => {
    setBusy(true); setError(null);
    try { await work(); }
    catch (err) {
      const msg = err instanceof ApiError ? err.message : (err instanceof Error ? err.message : String(err));
      setError(`Could not complete Google setup. ${msg}`);
    }
    finally { setBusy(false); }
  };
  const running = operation?.phase === "running";
  const start = (kind: "install" | "sign_in" | "models") => void act(async () => {
    autoOpenedRef.current = null;
    setCallback("");
    setOperation(await api.startGoogleSetup(kind));
  });

  return <div className="space-y-3">
    <div className="flex flex-wrap gap-2">
      {!engine.installed && <Button type="button" disabled={busy || running} onClick={() => start("install")}>Install Antigravity</Button>}
      {engine.installed && <Button type="button" disabled={busy || running} onClick={() => start("sign_in")}>{engine.signed_in ? "Switch Google account" : "Sign in with Google"}</Button>}
      {engine.signed_in && <>
        <Button type="button" disabled={busy || running} onClick={() => start("models")}>Refresh models</Button>
        <Button type="button" disabled={busy || running} onClick={() => void act(async () => { await api.deleteEngineConfig("antigravity"); setOperation(null); changed.current(); })}>Remove Google account</Button>
      </>}
      {running && <Button type="button" disabled={busy} onClick={() => void act(async () => { await api.cancelGoogleSetup(); setOperation(await api.googleSetupStatus()); setCallback(""); changed.current(); })}>Cancel setup</Button>}
    </div>
    {running && (
      <div className="space-y-2">
        <p role="status" className="text-xs text-muted">
          {operation.detail || (operation.kind === "install" ? "Downloading and verifying the official Google runtime. This can take a few minutes." : operation.kind === "models" ? "Refreshing the models available to your account…" : "Waiting for Google sign-in and loading your models…")}
        </p>
        {operation.progress != null && (
          <div className="w-full bg-line rounded-full h-2 overflow-hidden">
            <div className="bg-accent h-2 rounded-full transition-all duration-200" style={{ width: `${Math.max(4, Math.min(100, operation.progress))}%` }} />
          </div>
        )}
      </div>
    )}
    {running && operation.authorization_url && <div className="space-y-2">
      <Button type="button" disabled={busy} onClick={() => void act(async () => {
        if (window.suparagent?.openGoogleSignIn) {
          await window.suparagent.openGoogleSignIn(operation.authorization_url!);
        } else {
          window.open(operation.authorization_url!, "_blank", "noopener,noreferrer");
        }
      })}>Continue to Google sign-in</Button>
      {/* Rendered only after a sign-in starts in this browser, never during server rendering. */}
      <details open={serverIsElsewhere() || undefined}><summary className="cursor-pointer text-xs">Signing in from another computer?</summary>
        <p className="mt-2 text-xs text-muted">After you approve on Google, the tab goes to a 127.0.0.1 address that will not load (&quot;This site can&apos;t be reached&quot;). That is expected: copy the complete URL from that tab&apos;s address bar and paste it below within 5 minutes.</p>
        <form className="mt-2 flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); void act(async () => { const value = callback; setCallback(""); await api.completeGoogleSetup(operation.id, value); }); }}>
          <Input aria-label="Google redirect URL" type="password" autoComplete="off" value={callback} onChange={(event) => setCallback(event.target.value)} className="min-w-0 flex-1" />
          <Button type="submit" disabled={busy || !callback.trim()}>Complete sign-in</Button>
        </form>
      </details>
    </div>}
    {operation?.phase === "succeeded" && <Banner tone="success">{operation.kind === "install" ? "Antigravity installed. Sign in with Google to continue." : "Google account models refreshed."}</Banner>}
    {(error || operation?.error) && <Banner tone="danger">{error || operation?.error}</Banner>}
  </div>;
}
