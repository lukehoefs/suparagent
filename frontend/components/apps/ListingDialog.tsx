"use client";

// One MCP marketplace listing: what it is, where it connects and how, then adding it. Once added: its
// pinned version, an update when the catalog has a newer manifest, its bearer token, finding its
// tools and the exact tools each agent may call, and removing it.
import { ExternalLink } from "lucide-react";
import { useCallback, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { problemOf, sectionKey, type MarketListing, type Problem } from "@/lib/apps-page";
import type { MarketplaceConnection, MarketplaceListing, MarketplaceTool } from "@/lib/marketplace";
import { useT } from "@/lib/use-i18n";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field, Input } from "@/components/ui/Input";
import { StatusPill } from "@/components/ui/StatusPill";
import { useToast } from "@/components/ui/Toast";
import { ToolGrants } from "./ToolGrants";
import { ProblemBanner, useCount, type AgentOption } from "./shared";
import type { Marketplace } from "./useServers";

function Details({ listing }: { listing: MarketplaceListing }) {
  const t = useT();
  const auth = t(listing.auth_mode === "bearer_token" ? "apps.listing.authBearer" : "apps.listing.authNone");
  const rows: [string, ReactNode][] = [
    [t("apps.listing.address"), <code key="a" className="break-all font-mono text-ink">{listing.endpoint}</code>],
    [t("apps.listing.auth"), auth],
    [t("apps.listing.setup"), <span key="s" className="whitespace-pre-wrap">{listing.setup_instructions}</span>],
    [t("apps.listing.testing"), <span key="t" className="whitespace-pre-wrap">{listing.test_instructions}</span>],
    [t("apps.listing.manifest"), <code key="m" className="break-all font-mono text-ink">{listing.manifest_digest}</code>],
  ];
  return (
    <div className="flex flex-col gap-3">
      <p className="text-small text-muted">{t("apps.listing.meta", { version: listing.version, publisher: listing.publisher, license: listing.license })}</p>
      <dl className="grid gap-x-4 gap-y-2 rounded-field bg-inset p-3 text-small sm:grid-cols-[8rem_1fr]">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="font-medium text-ink">{label}</dt>
            <dd className="min-w-0 text-muted">{value}</dd>
          </div>
        ))}
      </dl>
      {listing.evidence && (
        <p className="text-small text-muted">
          {t("apps.listing.tested", { date: listing.evidence.tested_on })} ·{" "}
          <a className="text-accent-text underline underline-offset-2" href={listing.evidence.evidence_url} target="_blank" rel="noreferrer">{t("apps.listing.evidence")}</a>
        </p>
      )}
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-small">
        {([["apps.listing.source", listing.source_repo], ["apps.listing.privacy", listing.privacy_url], ["apps.listing.terms", listing.terms_url]] as const).map(([key, href]) => (
          <a key={key} className="inline-flex items-center gap-1 text-accent-text underline underline-offset-2 touch:min-h-11" href={href} target="_blank" rel="noreferrer">
            {t(key)}<ExternalLink size={12} aria-hidden="true" />
          </a>
        ))}
      </p>
    </div>
  );
}

function Installed({ item, connection, agents, market }: { item: MarketListing; connection: MarketplaceConnection; agents: AgentOption[] | null; market: Marketplace }) {
  const t = useT();
  const toast = useToast();
  const count = useCount();
  const [token, setToken] = useState("");
  const [tools, setTools] = useState<MarketplaceTool[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const needsToken = connection.manifest.auth_mode === "bearer_token";

  const run = async (key: string, work: () => Promise<void>) => {
    setBusy(key); setProblem(null);
    try { await work(); } catch (err) { setProblem(problemOf(err, "apps.error.generic")); } finally { setBusy(null); }
  };

  const load = useCallback(async (agentId: number) => (await api.getMarketplaceAgentGrants(connection.id, agentId)).tool_names, [connection.id]);
  const save = useCallback(async (agentId: number, exact: { name: string; schema_digest: string }[]) => {
    await api.saveMarketplaceAgentGrants(connection.id, agentId, exact);
  }, [connection.id]);

  return (
    <div className="flex flex-col gap-4 border-t border-line pt-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill status="done">{t("apps.market.added")}</StatusPill>
        <span className="text-body text-ink">{t("apps.listing.installed", { version: connection.manifest.version })}</span>
      </div>
      {problem && <ProblemBanner problem={problem} onDismiss={() => setProblem(null)} />}
      {item.updateAvailable && (
        <Banner tone="warning" title={t("apps.listing.newer")} action={
          <Button size="sm" loading={busy === "update"} disabled={busy !== null} onClick={() => void run("update", async () => {
            await api.installMarketplaceListing(item.section, item.listing.slug, item.listing.manifest_digest);
            setTools(null);
            await market.refresh();
            toast(t("apps.listing.updatedToast", { name: item.listing.name }));
          })}>{t("apps.listing.update", { version: item.listing.version })}</Button>
        }>
          {t("apps.listing.newerDetail", { address: item.listing.endpoint })} {t("apps.listing.updateNote")}
        </Banner>
      )}
      {needsToken && (
        <div className="flex flex-col gap-2">
          <Field label={t(connection.credential_configured ? "apps.listing.tokenReplace" : "apps.listing.token")} hint={t("apps.listing.tokenHint")}>
            {(props) => <Input {...props} type="password" autoComplete="new-password" spellCheck={false} value={token} disabled={busy !== null} onChange={(event) => setToken(event.target.value)} />}
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button loading={busy === "token"} disabled={busy !== null || !token.trim()} onClick={() => void run("token", async () => {
              const value = token.trim();
              setToken("");
              await api.saveMarketplaceCredential(connection.id, value);
              setTools(null);
              await market.refresh();
              toast(t("apps.listing.tokenSaved"));
            })}>{t("apps.listing.saveToken")}</Button>
            {connection.credential_configured && (
              <Button variant="ghost" className="text-muted hover:text-ink" disabled={busy !== null} onClick={() => void run("untoken", async () => {
                await api.removeMarketplaceCredential(connection.id);
                setTools(null);
                await market.refresh();
                toast(t("apps.listing.tokenRemoved"));
              })}>{t("apps.listing.removeToken")}</Button>
            )}
          </div>
        </div>
      )}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button loading={busy === "find"} disabled={busy !== null || (needsToken && !connection.credential_configured)} onClick={() => void run("find", async () => {
            const found = await api.discoverMarketplaceTools(connection.id);
            setTools(found);
            toast(count("apps.listing.found", found.length));
          })}>{t("apps.listing.findTools")}</Button>
          {needsToken && !connection.credential_configured && <span className="text-small text-muted">{t("apps.listing.needsToken")}</span>}
        </div>
        {tools && (
          <>
            <p className="text-small text-muted">{t("apps.grants.intro")}</p>
            <ToolGrants tools={tools} agents={agents} load={load} save={save} />
          </>
        )}
      </div>
    </div>
  );
}

export function ListingDialog({ item, agents, market, onClose }: { item: MarketListing; agents: AgentOption[] | null; market: Marketplace; onClose: () => void }) {
  const t = useT();
  const toast = useToast();
  const [busy, setBusy] = useState<"install" | "remove" | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [removing, setRemoving] = useState(false);
  const { listing, section, connection, elsewhere } = item;
  const sectionName = t(sectionKey(section));

  const install = async () => {
    setBusy("install"); setProblem(null);
    try {
      await api.installMarketplaceListing(section, listing.slug, listing.manifest_digest);
      await market.refresh();
      toast(item.action === "show"
        ? t("apps.listing.movedToast", { name: listing.name, section: sectionName })
        : item.action === "update" ? t("apps.listing.updatedToast", { name: listing.name }) : t("apps.listing.installedToast", { name: listing.name }));
    } catch (err) {
      setProblem(problemOf(err, "apps.error.generic"));
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!connection) return;
    setBusy("remove"); setProblem(null);
    try {
      await api.disconnectMarketplaceListing(connection.id);
      await market.refresh();
      toast(t("apps.listing.removed", { name: listing.name }));
      onClose();
    } catch (err) {
      setProblem(problemOf(err, "apps.error.generic"));
    } finally {
      setBusy(null);
    }
  };

  const installLabel = item.action === "show"
    ? t("apps.listing.showUnder", { section: sectionName })
    : item.action === "update" ? t("apps.listing.update", { version: listing.version }) : t("apps.listing.add");

  const footer = connection ? (
    removing ? (
      <>
        <span className="mr-auto self-center text-small text-ink">{t("apps.listing.removeConfirm", { name: listing.name })}</span>
        <Button disabled={busy !== null} onClick={() => setRemoving(false)}>{t("apps.app.keep")}</Button>
        <Button variant="danger" loading={busy === "remove"} onClick={() => void remove()}>{t("apps.listing.remove")}</Button>
      </>
    ) : (
      <>
        <Button variant="ghost" className="mr-auto text-muted hover:text-ink" disabled={busy !== null} onClick={() => setRemoving(true)}>{t("apps.listing.remove")}</Button>
        <Button onClick={onClose}>{t("common.close")}</Button>
      </>
    )
  ) : (
    <>
      <Button disabled={busy !== null} onClick={onClose}>{t("common.cancel")}</Button>
      <Button variant="primary" loading={busy === "install"} onClick={() => void install()}>{installLabel}</Button>
    </>
  );

  return (
    <Dialog open onOpenChange={(open) => { if (!open && busy === null) onClose(); }} title={listing.name} description={listing.summary} size="md" footer={footer}>
      <div className="flex flex-col gap-4">
        <p className="text-small font-medium text-muted">{t("apps.market.mcpCategory", { section: sectionName })}</p>
        {item.withdrawn && <Banner tone="warning">{t("apps.listing.withdrawnNote")}</Banner>}
        {problem && <ProblemBanner problem={problem} onDismiss={() => setProblem(null)} />}
        <Details listing={connection ? connection.manifest : listing} />
        {!connection && elsewhere && (
          <p className="text-small text-muted">{t("apps.listing.elsewhere", { section: t(sectionKey(elsewhere.section)), version: elsewhere.manifest.version })}</p>
        )}
        {!connection && item.action === "update" && <p className="text-small text-muted">{t("apps.listing.updateNote")}</p>}
        {connection && <Installed item={item} connection={connection} agents={agents} market={market} />}
      </div>
    </Dialog>
  );
}
