"use client";

// The light browser in the agent settings Computer tab: a headless browser for this agent inside the server
// (backend computers/local_browser.py). Where the server gives it per agent, a switch turns it on or off for this
// agent; while it is on, the live view below lets the person watch and take over (chat/LiveBrowser.tsx).
// Shows nothing where the server has no light browser, or when its setting cannot be read on an older server.
import { useEffect, useId, useState } from "react";
import { api, ApiError, type Agent, type BrowserSettings } from "@/lib/api";
import { useT } from "@/lib/use-i18n";
import { Switch } from "@/components/ui/Switch";
import { LiveBrowser } from "@/components/chat/LiveBrowser";

export function LightBrowserSection({ agent }: { agent: Agent }) {
  const t = useT();
  const headingId = useId();
  // undefined while loading, null when this server has no such setting.
  const [settings, setSettings] = useState<BrowserSettings | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api.getBrowserSettings(agent.id)
      .then((value) => { if (alive) setSettings(value); })
      .catch((err: unknown) => {
        if (!alive) return;
        setSettings(null);
        if (!(err instanceof ApiError && err.status === 404)) setError(t("lightBrowser.loadFailed"));
      });
    return () => { alive = false; };
  }, [agent.id, t]);

  if (settings === undefined) return null;
  if (settings === null || !settings.available) {
    return error ? <p role="alert" className="text-small text-danger">{error}</p> : null;
  }

  const name = agent.name;
  const toggle = async (next: boolean) => {
    setBusy(true);
    setError(null);
    try {
      setSettings(await api.setBrowserSettings(agent.id, next));
    } catch {
      setError(t("lightBrowser.saveFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby={headingId} data-testid="light-browser" className="flex flex-col gap-3 border-t border-line pt-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 id={headingId} className="text-body font-semibold text-ink">{t("lightBrowser.title")}</h3>
          <p className="mt-0.5 text-small text-muted">{t("lightBrowser.body", { name })}</p>
        </div>
        {settings.per_agent && (
          <Switch checked={settings.on} disabled={busy} onChange={(next) => void toggle(next)} label={t("lightBrowser.switch", { name })} />
        )}
      </div>
      <p className="text-small text-muted" data-testid="light-browser-state">
        {settings.per_agent ? t(settings.on ? "lightBrowser.on" : "lightBrowser.off", { name }) : t("lightBrowser.everyAgent")}{" "}
        {t("lightBrowser.private")}
      </p>
      {error && <p role="alert" className="text-small text-danger">{error}</p>}
      {settings.on && <LiveBrowser agentId={agent.id} />}
    </section>
  );
}
