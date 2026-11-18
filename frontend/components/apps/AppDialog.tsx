"use client";

// One Composio app: what agents can do with it, its accounts here (each can be disconnected), and
// connecting another account. Connecting gives no agent access: that is set per agent, under Tools.
import { useState } from "react";
import { canConnect, toolCounts, type CatalogApp } from "@/lib/apps-catalog";
import { accountStatus, appAgentsKey, connectionNoteKey, rawStatus } from "@/lib/apps-page";
import { accountsOf } from "@/lib/connected-apps";
import { useT } from "@/lib/use-i18n";
import { Badge } from "@/components/ui/Badge";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field, Input } from "@/components/ui/Input";
import { StatusText } from "@/components/ui/StatusPill";
import { AppIcon, ProblemBanner } from "./shared";
import type { Composio } from "./useComposio";

export function AppDialog({ app, composio, onOpenKey, onClose }: { app: CatalogApp; composio: Composio; onOpenKey: () => void; onClose: () => void }) {
  const t = useT();
  const [alias, setAlias] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);
  const mine = accountsOf(composio.accounts ?? [], app.app);
  const offered = canConnect(app);
  const note = connectionNoteKey(app);
  const counts = toolCounts(app);
  const busy = composio.busy !== null;
  const waitingHere = composio.waiting?.app === app.app;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }} title={app.name} description={app.description || undefined} size="md"
      footer={<Button onClick={onClose}>{t("common.close")}</Button>}>
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-3">
          <AppIcon app={app} size={40} />
          <div className="min-w-0 text-small text-muted">
            <p>{t("apps.connected.provider")}{app.categories.length ? ` · ${app.categories.join(", ")}` : ""}</p>
            {note && <p>{t(note)}</p>}
          </div>
        </div>

        <section aria-labelledby="app-agents" className="flex flex-col gap-2">
          <h3 id="app-agents" className="text-label font-semibold text-ink">{t("apps.app.agentsTitle")}</h3>
          <p className="text-body text-muted">{t(appAgentsKey(app), { name: app.name, read: counts.read, write: counts.write })}</p>
          {app.agent_actions === "curated" && app.curated_tools.length > 0 && (
            <ul className="flex flex-col divide-y divide-line rounded-field border border-line">
              {app.curated_tools.map((tool) => (
                <li key={tool.name} className="flex items-start justify-between gap-3 px-3 py-2">
                  <span className="min-w-0 text-body text-muted">{tool.description}</span>
                  <Badge className="shrink-0">{t(tool.kind === "write" ? "apps.app.write" : "apps.app.read")}</Badge>
                </li>
              ))}
            </ul>
          )}
          {app.agent_actions === "generic" && <p className="text-small text-muted">{t("apps.app.genericMore")}</p>}
          <p className="text-small text-muted">{t("apps.app.grantNote", { name: app.name })}</p>
        </section>

        <section aria-labelledby="app-accounts" className="flex flex-col gap-2">
          <h3 id="app-accounts" className="text-label font-semibold text-ink">{t("apps.app.accounts")}</h3>
          {/* A load failure stays until its Try again on the page works. */}
          {composio.problem && <ProblemBanner problem={composio.problem} onDismiss={composio.statusFailed || composio.accountsFailed ? undefined : composio.dismiss} />}
          {waitingHere && (
            <Banner action={<Button onClick={composio.stopWaiting}>{t("apps.connected.stopWaiting")}</Button>}>
              {t("apps.connected.waiting", { name: app.name })}
            </Banner>
          )}
          {mine.length === 0 ? (
            <p className="text-body text-muted">{t("apps.app.noAccounts")}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line rounded-field border border-line">
              {mine.map((account) => {
                const state = accountStatus(account.status);
                const name = account.alias ?? account.id;
                return (
                  <li key={account.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-body text-ink">{name}</span>
                      <StatusText status={state.status}>{state.key ? t(state.key) : rawStatus(account.status)}</StatusText>
                    </span>
                    {confirming === account.id ? (
                      <span className="flex flex-wrap items-center gap-2 text-small text-ink">
                        {t("apps.app.disconnectConfirm")}
                        <Button variant="danger" loading={composio.busy === `remove:${account.id}`} disabled={busy}
                          onClick={() => void composio.disconnect(account).then((ok) => { if (ok) setConfirming(null); })}>{t("apps.app.disconnect")}</Button>
                        <Button disabled={busy} onClick={() => setConfirming(null)}>{t("apps.app.keep")}</Button>
                      </span>
                    ) : (
                      <Button variant="ghost" className="text-muted hover:text-ink" disabled={busy}
                        aria-label={t("apps.app.disconnectAria", { account: name })} onClick={() => setConfirming(account.id)}>{t("apps.app.disconnect")}</Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {/* Until the page knows whether a key is saved, it offers neither Connect nor Add key. */}
          {offered && composio.status !== null && (composio.configured ? (
            <div className="flex flex-wrap items-end gap-2">
              <Field label={t("apps.app.nameLabel")} className="min-w-0 flex-1 basis-48">
                {(props) => (
                  <Input {...props} placeholder={t("apps.app.namePlaceholder")} maxLength={40} value={alias} autoComplete="off"
                    disabled={busy || composio.waiting !== null} onChange={(event) => setAlias(event.target.value)} />
                )}
              </Field>
              <Button loading={composio.busy === `connect:${app.app}`} disabled={busy || composio.waiting !== null || composio.accounts === null}
                onClick={() => void composio.connect(app, alias).then((ok) => { if (ok) setAlias(""); })}>
                {t(mine.length ? "apps.connected.addAnother" : "apps.connected.connect")}
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-body text-muted">{t("apps.app.needsKey")}</p>
              <Button onClick={onOpenKey}>{t("apps.connected.addKey")}</Button>
            </div>
          ))}
        </section>
      </div>
    </Dialog>
  );
}
