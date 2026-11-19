"use client";

// Custom MCP servers (design: Apps.html): one card per server with its status, when it was last
// tested, sharing, and one primary button for the next step (Sign in, Add secret, Test, Turn on or
// Manage grants; lib/apps-page serverActions). After a failed test the card offers Try again with
// Edit details beside it (design: States). Everything else (Test again, Turn off, Edit, sign out,
// the secret and removal) sits in the card's menu. Add a server opens after the cards, as its own
// block above Marketplace.
import { Ellipsis, Plus, Server } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import {
  endpointLabel, formFor, problemOf, serverActions, serverHintKey, serverLabel, serverStatus, SERVERS_ANCHOR, testedLineKey,
  type Problem, type ServerAction, type ServerForm as Form,
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
import { ToolGrants, useDiscardGuard } from "./ToolGrants";
import { ProblemBanner, SectionHeading, SERVER_GRID, useCount, WithValue, type AgentOption } from "./shared";
import type { CustomServers as Servers } from "./useServers";

// Where the server's address goes in a hint that names it.
const ADDRESS_MARK = "\u0000";

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

// `qualifier` tells this server from others with the same name (its host); `alsoApp` is the
// connected app it seems to duplicate.
function ServerCard({ server, qualifier, alsoApp, busy, testing, signingIn, actions }: {
  server: CustomMcpConnection;
  qualifier: string | null;
  alsoApp: string | null;
  busy: boolean;
  testing: boolean;
  signingIn: boolean;
  actions: CardActions;
}) {
  const t = useT();
  const count = useCount();
  const when = useWhen();
  const pill = serverStatus(server);
  const hint = serverHintKey(server);
  const tested = server.last_tested_at ? when(server.last_tested_at) : null;
  // A failed test reports no tools (tool_count is null): the line says it failed, with no count.
  const testedLine = t(tested === null ? "apps.servers.notTested" : testedLineKey(server), {
    time: tested ?? "",
    tools: server.tool_count === null ? "" : count("apps.servers.tools", server.tool_count),
  });

  const header = (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <h3 className="break-words text-[15px] font-semibold text-ink">
          {server.name}
          {qualifier ? <span className="ml-1.5 font-normal text-muted [overflow-wrap:anywhere]">({qualifier})</span> : null}
        </h3>
        <p className="font-mono text-small text-muted [overflow-wrap:anywhere]">{endpointLabel(server.endpoint)}</p>
      </div>
      <StatusPill status={pill.status}>{t(pill.key)}</StatusPill>
    </div>
  );
  const also = alsoApp ? (
    <p className="self-start rounded-full bg-warning-bg px-2 py-0.5 text-small font-medium text-warning-on">{t("polishStates.apps.alsoApp", { name: alsoApp })}</p>
  ) : null;

  if (!server.can_manage) {
    // Someone else's private server, shown to the workspace owner so it can be switched off or removed.
    return (
      <Card className="flex h-full flex-col gap-3">
        {header}
        {also}
        <p className="text-small text-muted">{t("apps.servers.privateNote", { who: server.added_by ?? t("apps.servers.someone") })}</p>
        {/* Turning it off is the one action here; removing it sits in the menu. */}
        <div className="mt-auto flex flex-wrap items-center gap-1.5">
          {server.enabled && <Button variant="primary" disabled={busy} onClick={() => actions.onToggle(false)}>{t("apps.servers.turnOff")}</Button>}
          <span className="ml-auto">
            <Menu trigger={<IconButton label={t("apps.servers.more", { name: serverLabel(server.name, qualifier) })} disabled={busy}><Ellipsis size={18} aria-hidden="true" /></IconButton>}>
              <MenuItem danger onSelect={actions.onRemove}>{t("apps.servers.remove")}</MenuItem>
            </Menu>
          </span>
        </div>
      </Card>
    );
  }

  // One primary button (the next step), at most one beside it, the rest in the menu
  // (lib/apps-page serverActions).
  const { primary, secondary, more } = serverActions(server);
  const labels: Record<ServerAction, string> = {
    signIn: "apps.servers.signIn",
    addSecret: "apps.servers.addSecret",
    test: "apps.servers.test",
    retry: "apps.retry",
    editDetails: "apps.servers.editDetails",
    turnOn: "apps.servers.turnOn",
    turnOff: "apps.servers.turnOff",
    grants: "apps.servers.manageGrants",
    testAgain: "apps.servers.test",
  };
  const run: Record<ServerAction, () => void> = {
    signIn: actions.onSignIn,
    addSecret: actions.onEdit,
    test: actions.onTest,
    retry: actions.onTest,
    editDetails: actions.onEdit,
    turnOn: () => actions.onToggle(true),
    turnOff: () => actions.onToggle(false),
    grants: actions.onGrants,
    testAgain: actions.onTest,
  };
  const button = (action: ServerAction, variant: "primary" | "secondary") => {
    if (action === "signIn") {
      return <Button variant={variant} disabled={busy || signingIn} onClick={run.signIn}>{signingIn ? t("apps.servers.waitingSignIn") : t(labels.signIn)}</Button>;
    }
    const tests = action === "test" || action === "retry";
    return (
      <Button variant={variant} loading={tests && testing} disabled={busy} onClick={run[action]}>
        {tests && testing ? t("apps.servers.testing") : t(labels[action])}
      </Button>
    );
  };
  return (
    <Card className="flex h-full flex-col gap-3">
      {header}
      {also}
      {/* How it signs in lives in Edit; Add secret or Sign in shows when one is missing. */}
      <p className="text-small text-muted">{testedLine}</p>
      {hint && (
        <p className="text-small text-ink">
          {/* A test that never reached the server names the address it tried (design: States). */}
          <WithValue text={t(hint, { endpoint: ADDRESS_MARK })} marker={ADDRESS_MARK}>
            <span className="break-all font-mono">{endpointLabel(server.endpoint)}</span>
          </WithValue>
        </p>
      )}
      {server.mine ? (
        <div className="flex items-center justify-between gap-3 text-label text-ink">
          <span>{t("apps.servers.share")}</span>
          <Switch checked={server.shared} disabled={busy} label={t("apps.servers.shareAria", { name: serverLabel(server.name, qualifier) })} onChange={actions.onShare} />
        </div>
      ) : server.shared ? (
        <p className="text-small text-muted">{t("apps.servers.sharedBy", { who: server.added_by ?? t("apps.servers.someone") })}</p>
      ) : null}
      <div className="mt-auto flex flex-wrap items-center gap-1.5">
        {primary && button(primary, "primary")}
        {secondary && button(secondary, "secondary")}
        {/* A test started from the menu has no button to show it running. */}
        {testing && primary !== "test" && primary !== "retry" && <span role="status" className="text-small text-muted">{t("apps.servers.testing")}</span>}
        <span className="ml-auto">
          <Menu trigger={<IconButton label={t("apps.servers.more", { name: serverLabel(server.name, qualifier) })} disabled={busy}><Ellipsis size={18} aria-hidden="true" /></IconButton>}>
            {more.map((action) => <MenuItem key={action} onSelect={run[action]}>{t(labels[action])}</MenuItem>)}
            {more.length > 0 && <MenuSeparator />}
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
  // Close and Escape ask first while there are unsaved ticks.
  const guard = useDiscardGuard(onClose);
  return (
    <Dialog open onOpenChange={(open) => { if (!open) guard.request(); }} title={t("apps.grants.title", { name: server.name })} size="md"
      footer={<Button onClick={guard.request}>{t("common.close")}</Button>}>
      <div className="flex flex-col gap-3">
        {server.server_name && <p className="text-small text-muted">{t("apps.servers.claim", { name: server.server_name })}</p>}
        <p className="text-small text-muted">{t("apps.grants.intro")} {t("apps.grants.customScope")}</p>
        {problem && <ProblemBanner problem={problem} />}
        {!problem && tools === null && <Skeleton className="h-24 w-full" />}
        {tools && <ToolGrants tools={tools} agents={agents} load={load} save={save} searchLimit={DIRECT_TOOL_LIMIT} onDirtyChange={guard.onDirtyChange} />}
        {guard.dialog}
      </div>
    </Dialog>
  );
}

export function CustomServers({ servers, agents, onAdd, qualifiers, alsoApp, addPanel }: {
  servers: Servers;
  agents: AgentOption[] | null;
  onAdd: () => void;
  // Server id to what tells it from servers with the same name (lib/apps-page serverQualifiers).
  qualifiers?: ReadonlyMap<string, string | null>;
  // Server id to the connected app it seems to duplicate.
  alsoApp?: ReadonlyMap<string, { name: string }>;
  // Add a server while it is open: shown after the cards, 24 px below them (design: Apps.html).
  addPanel?: ReactNode;
}) {
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
  // A server's name as titles and messages show it: with its qualifier when another has the same name.
  const label = (server: CustomMcpConnection) => serverLabel(server.name, qualifiers?.get(server.id));

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
      toast(t("apps.servers.removed", { name: label(server) }));
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
    // While Add a server is open it is the way forward; "No servers yet" with its own Add server
    // would only repeat it.
    content = addPanel ? null : (
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
            <ServerCard server={server} qualifier={qualifiers?.get(server.id) ?? null} alsoApp={alsoApp?.get(server.id)?.name ?? null} busy={busy?.id === server.id} testing={busy?.id === server.id && busy.test} signingIn={signingIn === server.id} actions={actionsFor(server)} />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <section aria-labelledby={SERVERS_ANCHOR} className="flex flex-col gap-3">
      <SectionHeading id={SERVERS_ANCHOR} title={t("apps.servers.title")} />
      {servers.problem && <ProblemBanner problem={servers.problem} action={<Button onClick={() => void reload().catch(() => undefined)}>{t("apps.retry")}</Button>} />}
      {problem && <ProblemBanner problem={problem} onDismiss={() => setProblem(null)} />}
      {content}
      {/* The section gap plus mt-3 is the page's 24 px between blocks; with no cards the panel sits
          under the heading. Opening it scrolls only as far as needed to show the whole panel, edge
          included (AppsPage), however many cards there are. */}
      {addPanel ? <div className={content ? "mt-3" : undefined}>{addPanel}</div> : null}

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
        title={sharing ? t("apps.servers.shareTitle", { name: label(sharing) }) : ""}
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
        title={removing ? t("apps.servers.removeTitle", { name: label(removing) }) : ""}
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
