"use client";

// Custom MCP servers (design: Apps.html): one card per server with its status, when it was last
// tested, sharing, and Test, Turn on or off and Manage grants. Edit, sign out, the secret and
// removal sit in the card's menu.
import { Ellipsis, Plus, Server } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import {
  authKeys, canGrant, canTurnOn, formFor, problemOf, serverHintKey, serverStart, serverStatus, SERVERS_ANCHOR,
  type Problem, type ServerForm as Form,
} from "@/lib/apps-page";
import { buildUpdate, DIRECT_TOOL_LIMIT, type CustomMcpConnection, type CustomMcpTool } from "@/lib/custom-mcp";
import { relativeTime } from "@/lib/relative-time";
import { useT } from "@/lib/use-i18n";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { IconButton } from "@/components/ui/IconButton";
import { Menu, MenuItem, MenuSeparator } from "@/components/ui/Menu";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatusPill } from "@/components/ui/StatusPill";
import { Card } from "@/components/ui/Surface";
import { Switch } from "@/components/ui/Switch";
import { useToast } from "@/components/ui/Toast";
import { ServerForm } from "./ServerForm";
import { ToolGrants } from "./ToolGrants";
import { ProblemBanner, SectionHeading, SERVER_GRID, useCount, type AgentOption } from "./shared";
import type { CustomServers as Servers } from "./useServers";

function useWhen() {
  const t = useT();
  return (iso: string) => {
    const when = relativeTime(iso);
    if (!when) return null;
    return "date" in when ? when.date : t(when.key, "n" in when ? { n: when.n } : undefined);
  };
}

type CardActions = {
  onTest: () => void;
  onSignIn: () => void;
  onEdit: () => void;
  onToggle: (on: boolean) => void;
  onGrants: () => void;
  onShare: (on: boolean) => void;
  onSignOut: () => void;
  onRemoveSecret: () => void;
  onRemove: () => void;
};

function ServerCard({ server, busy, testing, signingIn, actions }: { server: CustomMcpConnection; busy: boolean; testing: boolean; signingIn: boolean; actions: CardActions }) {
  const t = useT();
  const count = useCount();
  const when = useWhen();
  const pill = serverStatus(server);
  const hint = serverHintKey(server);
  const tested = server.last_tested_at ? when(server.last_tested_at) : null;
  const toolsLine = server.tool_count !== null ? count("apps.servers.tools", server.tool_count) : null;

  const header = (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <h3 className="break-words text-[15px] font-semibold text-ink">{server.name}</h3>
        <p className="break-all font-mono text-small text-muted">{server.endpoint}</p>
      </div>
      <StatusPill status={pill.status}>{t(pill.key)}</StatusPill>
    </div>
  );

  if (!server.can_manage) {
    // Someone else's private server, shown to the workspace owner so it can be switched off or removed.
    return (
      <Card className="flex h-full flex-col gap-3">
        {header}
        <p className="text-small text-muted">{t("apps.servers.privateNote", { who: server.added_by ?? t("apps.servers.someone") })}</p>
        <div className="mt-auto flex flex-wrap gap-1.5">
          {server.enabled && <Button disabled={busy} onClick={() => actions.onToggle(false)}>{t("apps.servers.turnOff")}</Button>}
          <Button variant="ghost" className="text-muted hover:text-ink" disabled={busy} onClick={actions.onRemove}>{t("apps.servers.remove")}</Button>
        </div>
      </Card>
    );
  }

  const start = serverStart(server);
  return (
    <Card className="flex h-full flex-col gap-3">
      {header}
      <div className="flex flex-col gap-0.5 text-small text-muted">
        <span>{tested ? t("apps.servers.lastTested", { time: tested, tools: toolsLine ?? count("apps.servers.tools", 0) }) : t("apps.servers.notTested")}</span>
        <span>{authKeys(server).map((key) => t(key)).join(" · ")}</span>
      </div>
      {hint && <p className="text-small text-ink">{t(hint)}</p>}
      {server.mine ? (
        <div className="flex items-center justify-between gap-3 text-label text-ink">
          <span>{t("apps.servers.share")}</span>
          <Switch checked={server.shared} disabled={busy} label={t("apps.servers.shareAria", { name: server.name })} onChange={actions.onShare} />
        </div>
      ) : server.shared ? (
        <p className="text-small text-muted">{t("apps.servers.sharedBy", { who: server.added_by ?? t("apps.servers.someone") })}</p>
      ) : null}
      <div className="mt-auto flex flex-wrap items-center gap-1.5">
        {start === "signIn" && (
          <Button disabled={busy || signingIn} onClick={actions.onSignIn}>{signingIn ? t("apps.servers.waitingSignIn") : t("apps.servers.signIn")}</Button>
        )}
        {start === "addSecret" && <Button disabled={busy} onClick={actions.onEdit}>{t("apps.servers.addSecret")}</Button>}
        {start === "test" && <Button loading={testing} disabled={busy} onClick={actions.onTest}>{testing ? t("apps.servers.testing") : t("apps.servers.test")}</Button>}
        {server.enabled
          ? <Button disabled={busy} onClick={() => actions.onToggle(false)}>{t("apps.servers.turnOff")}</Button>
          : canTurnOn(server) && <Button disabled={busy} onClick={() => actions.onToggle(true)}>{t("apps.servers.turnOn")}</Button>}
        {canGrant(server) && <Button variant="ghost" className="text-muted hover:text-ink" disabled={busy} onClick={actions.onGrants}>{t("apps.servers.manageGrants")}</Button>}
        <span className="ml-auto">
          <Menu trigger={<IconButton label={t("apps.servers.more", { name: server.name })} disabled={busy}><Ellipsis size={18} aria-hidden="true" /></IconButton>}>
            <MenuItem onSelect={actions.onEdit}>{t("apps.servers.edit")}</MenuItem>
            {server.auth_mode === "oauth" && server.oauth_signed_in && <MenuItem onSelect={actions.onSignOut}>{t("apps.servers.signOut")}</MenuItem>}
            {server.credential_configured && server.auth_mode !== "oauth" && <MenuItem onSelect={actions.onRemoveSecret}>{t("apps.servers.removeSecret")}</MenuItem>}
            <MenuSeparator />
            <MenuItem danger onSelect={actions.onRemove}>{t("apps.servers.remove")}</MenuItem>
          </Menu>
        </span>
      </div>
    </Card>
  );
}

function EditDialog({ server, onClose, onSaved }: { server: CustomMcpConnection; onClose: () => void; onSaved: (next: CustomMcpConnection, reset: boolean) => void }) {
  const t = useT();
  const [form, setForm] = useState<Form>(() => formFor(server));
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  const save = async () => {
    const body = buildUpdate(server, form);
    if (body === null) { onClose(); return; }
    const reset = "endpoint" in body || "auth_mode" in body || "credential" in body || "auth_header_name" in body || "oauth_client_id" in body || "oauth_scopes" in body;
    setBusy(true); setProblem(null);
    try {
      onSaved(await api.updateCustomMcp(server.id, body), reset);
    } catch (err) {
      setProblem(problemOf(err, "apps.error.generic"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => { if (!open && !busy) onClose(); }}
      title={t("apps.edit.title", { name: server.name })}
      size="md"
      footer={<>
        <Button disabled={busy} onClick={onClose}>{t("common.cancel")}</Button>
        <Button variant="primary" loading={busy} disabled={!form.name.trim() || !form.endpoint.trim()} onClick={() => void save()}>{t("apps.edit.save")}</Button>
      </>}
    >
      <div className="flex flex-col gap-4">
        {problem && <ProblemBanner problem={problem} onDismiss={() => setProblem(null)} />}
        <ServerForm form={form} onChange={setForm} hasSecret={server.credential_configured} disabled={busy} />
        <p className="text-small text-muted">{t("apps.edit.note")}</p>
      </div>
    </Dialog>
  );
}

function GrantsDialog({ server, agents, servers, onClose }: { server: CustomMcpConnection; agents: AgentOption[] | null; servers: Servers; onClose: () => void }) {
  const t = useT();
  const { list, reload } = servers;
  const [tools, setTools] = useState<CustomMcpTool[] | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  useEffect(() => {
    let live = true;
    api.getCustomMcpTools(server.id)
      .then((found) => { if (live) setTools(found); })
      .catch((err: unknown) => { if (live) setProblem(problemOf(err, "apps.grants.toolsFailed")); });
    return () => { live = false; };
  }, [server.id]);
  const load = useCallback(async (agentId: number) => (await api.getCustomMcpGrants(server.id, agentId)).tool_names, [server.id]);
  const save = useCallback(async (agentId: number, exact: { name: string; schema_digest: string }[]) => {
    const current = list?.find((item) => item.id === server.id) ?? server;
    await api.saveCustomMcpGrants(current.id, agentId, current.revision, exact);
    await reload();
  }, [list, reload, server]);
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }} title={t("apps.grants.title", { name: server.name })} size="md"
      footer={<Button onClick={onClose}>{t("common.close")}</Button>}>
      <div className="flex flex-col gap-3">
        {server.server_name && <p className="text-small text-muted">{t("apps.servers.claim", { name: server.server_name })}</p>}
        <p className="text-small text-muted">{t("apps.grants.intro")} {t("apps.grants.customScope")}</p>
        {problem && <ProblemBanner problem={problem} />}
        {!problem && tools === null && <Skeleton className="h-24 w-full" />}
        {tools && <ToolGrants tools={tools} agents={agents} load={load} save={save} searchLimit={DIRECT_TOOL_LIMIT} />}
      </div>
    </Dialog>
  );
}

export function CustomServers({ servers, agents, onAdd }: { servers: Servers; agents: AgentOption[] | null; onAdd: () => void }) {
  const t = useT();
  const toast = useToast();
  const count = useCount();
  const { list, put, drop, reload, signingIn, startSignIn } = servers;
  // The card that is working, and whether that work is a test (its button then says Testing).
  const [busy, setBusy] = useState<{ id: string; test: boolean } | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [editing, setEditing] = useState<CustomMcpConnection | null>(null);
  const [granting, setGranting] = useState<CustomMcpConnection | null>(null);
  const [sharing, setSharing] = useState<CustomMcpConnection | null>(null);
  const [removing, setRemoving] = useState<CustomMcpConnection | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);

  // The old address /marketplace/#custom-mcp-heading lands here once the list is on screen.
  const scrolled = useRef(false);
  useEffect(() => {
    if (list === null || scrolled.current) return;
    scrolled.current = true;
    if (window.location.hash === `#${SERVERS_ANCHOR}`) document.getElementById(SERVERS_ANCHOR)?.scrollIntoView({ block: "start" });
  }, [list]);

  const act = async (server: CustomMcpConnection, work: () => Promise<CustomMcpConnection | void>, done?: string, test = false) => {
    setBusy({ id: server.id, test }); setProblem(null);
    try {
      const next = await work();
      if (next) put(next);
      if (done) toast(done);
    } catch (err) {
      setProblem(problemOf(err, "apps.error.generic"));
      await reload().catch(() => undefined);
    } finally {
      setBusy(null);
    }
  };

  const actionsFor = (server: CustomMcpConnection): CardActions => ({
    onTest: () => void act(server, async () => {
      const next = await api.testCustomMcp(server.id, server.revision);
      toast(t("apps.servers.testPassedToast", { tools: count("apps.servers.tools", next.tool_count ?? 0) }));
      return next;
    }, undefined, true),
    onSignIn: () => void (async () => {
      setBusy({ id: server.id, test: false }); setProblem(null);
      const failure = await startSignIn(server);
      if (failure) setProblem(failure);
      setBusy(null);
    })(),
    onEdit: () => setEditing(server),
    onToggle: (on) => void act(server, () => api.setCustomMcpEnabled(server.id, server.revision, on), t(on ? "apps.servers.turnedOn" : "apps.servers.turnedOff")),
    onGrants: () => setGranting(server),
    onShare: (on) => {
      if (on) setSharing(server);
      else void act(server, () => api.setCustomMcpSharing(server.id, server.revision, false), t("apps.servers.unshared"));
    },
    onSignOut: () => void act(server, () => api.signOutCustomMcp(server.id, server.revision), t("apps.servers.signedOutToast")),
    onRemoveSecret: () => void act(server, () => api.removeCustomMcpCredential(server.id, server.revision), t("apps.servers.secretRemoved")),
    onRemove: () => setRemoving(server),
  });

  const confirmRemove = async () => {
    if (!removing) return;
    const server = removing;
    setRemoveBusy(true); setProblem(null);
    try {
      await api.deleteCustomMcp(server.id);
      drop(server.id);
      toast(t("apps.servers.removed", { name: server.name }));
    } catch (err) {
      setProblem(problemOf(err, "apps.error.generic"));
    } finally {
      setRemoveBusy(false);
      setRemoving(null);
    }
  };

  let content;
  if (list === null && !servers.problem) {
    content = (
      <div role="status" className={SERVER_GRID}>
        <span className="sr-only">{t("common.loading")}</span>
        {[0, 1].map((key) => <Card key={key} className="flex flex-col gap-3"><Skeleton className="h-5 w-40" /><Skeleton className="h-4 w-56" /><Skeleton className="h-9 w-48" /></Card>)}
      </div>
    );
  } else if (list !== null && list.length === 0) {
    content = (
      <Card>
        <EmptyState icon={<Server size={24} />} title={t("apps.servers.empty.title")} description={t("apps.servers.empty.body")}
          action={<Button icon={<Plus size={15} aria-hidden="true" />} onClick={onAdd}>{t("apps.addServer")}</Button>} />
      </Card>
    );
  } else if (list !== null) {
    content = (
      <ul aria-label={t("apps.servers.title")} className={SERVER_GRID}>
        {list.map((server) => (
          <li key={server.id} className="min-w-0">
            <ServerCard server={server} busy={busy?.id === server.id} testing={busy?.id === server.id && busy.test} signingIn={signingIn === server.id} actions={actionsFor(server)} />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <section aria-labelledby={SERVERS_ANCHOR} className="flex flex-col gap-3">
      <SectionHeading id={SERVERS_ANCHOR} title={t("apps.servers.title")} intro={t("apps.servers.intro")} />
      {servers.problem && <ProblemBanner problem={servers.problem} action={<Button size="sm" onClick={() => void reload().catch(() => undefined)}>{t("apps.retry")}</Button>} />}
      {problem && <ProblemBanner problem={problem} onDismiss={() => setProblem(null)} />}
      {content}

      {editing && (
        <EditDialog
          server={editing}
          onClose={() => setEditing(null)}
          onSaved={(next, reset) => { put(next); setEditing(null); toast(t(reset ? "apps.edit.savedReset" : "apps.edit.saved")); }}
        />
      )}
      {granting && <GrantsDialog server={granting} agents={agents} servers={servers} onClose={() => setGranting(null)} />}
      <ConfirmDialog
        open={sharing !== null}
        onOpenChange={(open) => { if (!open) setSharing(null); }}
        title={sharing ? t("apps.servers.shareTitle", { name: sharing.name }) : ""}
        description={t("apps.servers.shareBody")}
        confirmLabel={t("apps.servers.shareConfirm")}
        cancelLabel={t("common.cancel")}
        onConfirm={() => {
          const server = sharing;
          setSharing(null);
          if (server) void act(server, () => api.setCustomMcpSharing(server.id, server.revision, true), t("apps.servers.shared"));
        }}
      />
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => { if (!open && !removeBusy) setRemoving(null); }}
        title={removing ? t("apps.servers.removeTitle", { name: removing.name }) : ""}
        description={t("apps.servers.removeBody")}
        confirmLabel={t("apps.servers.removeConfirm")}
        cancelLabel={t("common.cancel")}
        danger
        loading={removeBusy}
        onConfirm={() => void confirmRemove()}
      />
    </section>
  );
}
