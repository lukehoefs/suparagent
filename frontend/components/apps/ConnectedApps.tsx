"use client";

// Connected apps (design: Apps.html): the apps with their own agent tools (Gmail, GitHub, Calendar)
// and every other app with an account here, each with its status or Connect. A card opens the
// app's details: what agents can do, its accounts, and another account.
import { KeyRound } from "lucide-react";
import { canConnect, type CatalogApp } from "@/lib/apps-catalog";
import { appStatus, type Problem } from "@/lib/apps-page";
import { accountsOf } from "@/lib/connected-apps";
import { useT } from "@/lib/use-i18n";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatusPill } from "@/components/ui/StatusPill";
import { Card } from "@/components/ui/Surface";
import { APP_GRID, AppIcon, ProblemBanner, SectionHeading } from "./shared";
import type { Composio } from "./useComposio";

// One app as a card: the left part opens its details, the right part is its status or Connect.
export function AppCard({ app, composio, subtitle, onOpen, onOpenKey }: {
  app: CatalogApp;
  composio: Composio;
  subtitle: string;
  onOpen: () => void;
  onOpenKey: () => void;
}) {
  const t = useT();
  const mine = accountsOf(composio.accounts ?? [], app.app);
  const status = appStatus(composio.configured, mine);
  const connecting = composio.busy === `connect:${app.app}`;
  return (
    <Card className="flex h-full items-center gap-3 p-3.5">
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-field text-left touch:min-h-11">
        <AppIcon app={app} />
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-ink">{app.name}</span>
          <span className="truncate text-small text-muted">{subtitle}</span>
        </span>
      </button>
      {status ? (
        <StatusPill status={status.status}>{t(status.key)}</StatusPill>
      ) : canConnect(app) ? (
        <Button
          loading={connecting}
          // Until the page knows whether a key is saved, Connect could ask for a key that is already there.
          disabled={composio.status === null || composio.busy !== null || composio.waiting !== null || (composio.configured && composio.accounts === null)}
          aria-label={t("apps.connected.connectAria", { name: app.name })}
          onClick={() => { if (!composio.configured) onOpenKey(); else void composio.connect(app); }}
        >
          {t("apps.connected.connect")}
        </Button>
      ) : null}
    </Card>
  );
}

export function ConnectedApps({ composio, cards, loading, catalogProblem, onRetryCatalog, onOpen, onOpenKey }: {
  composio: Composio;
  cards: CatalogApp[];
  loading: boolean;
  // The unfiltered catalog, which holds the curated apps, could not be loaded.
  catalogProblem: Problem | null;
  onRetryCatalog: () => void;
  onOpen: (app: CatalogApp) => void;
  onOpenKey: () => void;
}) {
  const t = useT();
  const keyButton = composio.status && composio.configured
    ? <Button variant="ghost" className="text-muted hover:text-ink" icon={<KeyRound size={15} aria-hidden="true" />} onClick={onOpenKey}>{t("apps.connected.keyButton")}</Button>
    : undefined;
  return (
    <section aria-labelledby="apps-connected" className="flex flex-col gap-3">
      <SectionHeading id="apps-connected" title={t("apps.connected.title")} action={keyButton} />
      {composio.waiting && (
        <Banner action={<Button onClick={composio.stopWaiting}>{t("apps.connected.stopWaiting")}</Button>}>
          {t("apps.connected.waiting", { name: composio.waiting.name })}
        </Banner>
      )}
      {composio.problem && (
        <ProblemBanner
          problem={composio.problem}
          onDismiss={composio.accountsFailed || composio.statusFailed ? undefined : composio.dismiss}
          action={composio.statusFailed ? <Button onClick={() => void composio.reloadStatus()}>{t("apps.retry")}</Button>
            : composio.accountsFailed ? <Button onClick={() => void composio.loadAccounts()}>{t("apps.retry")}</Button> : undefined}
        />
      )}
      {catalogProblem && <ProblemBanner problem={catalogProblem} action={<Button onClick={onRetryCatalog}>{t("apps.retry")}</Button>} />}
      {composio.notice && <Banner onDismiss={composio.dismiss}>{t(composio.notice)}</Banner>}
      {composio.status && !composio.configured && (
        <Card className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1 basis-64">
            <p className="font-medium text-ink">{t("apps.connected.noKeyTitle")}</p>
            <p className="mt-0.5 text-body text-muted">{t("apps.connected.noKeyBody")}</p>
          </div>
          <Button icon={<KeyRound size={15} aria-hidden="true" />} onClick={onOpenKey}>{t("apps.connected.addKey")}</Button>
        </Card>
      )}
      {loading ? (
        <div role="status" className={APP_GRID}>
          <span className="sr-only">{t("common.loading")}</span>
          {[0, 1, 2].map((key) => <Skeleton key={key} className="h-[62px] w-full rounded-card" />)}
        </div>
      ) : cards.length > 0 ? (
        <ul aria-label={t("apps.connected.title")} className={APP_GRID}>
          {cards.map((app) => (
            <li key={app.app} className="min-w-0">
              <AppCard app={app} composio={composio} subtitle={t("apps.connected.provider")} onOpen={() => onOpen(app)} onOpenKey={onOpenKey} />
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
