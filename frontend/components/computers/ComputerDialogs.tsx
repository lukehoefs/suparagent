"use client";

// Add a computer (a name, one custom MCP connection, optionally an agent), and the small edits on
// a card: link it to another agent or rename it. Mounted only while open, so each opening starts fresh.
import { useEffect, useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import type { CustomMcpConnection } from "@/lib/custom-mcp";
import {
  agentChoices,
  connectionChoices,
  connectionHost,
  connectionNeedsKey,
  connectionStateKey,
  createRemoteComputer,
  isLinkConflict,
  MCP_SERVERS_HREF,
  updateRemoteComputer,
  type RemoteComputer,
} from "@/lib/remote-computers";
import { useT } from "@/lib/use-i18n";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field, Input, Select } from "@/components/ui/Input";
import { LinkButton } from "@/components/ui/LinkButton";
import { SkeletonList } from "@/components/ui/Skeleton";

type AgentRow = { id: number; name: string; archived_at: string | null };

function useErrorText() {
  const t = useT();
  return (err: unknown) => (isLinkConflict(err)
    ? t("computers.error.conflict")
    : err instanceof Error && err.message ? err.message : t("computers.error.generic"));
}

function agentOptions(t: ReturnType<typeof useT>, choices: ReturnType<typeof agentChoices>) {
  return [
    { value: "", label: t("computers.dialog.noAgent") },
    ...choices.map((choice) => ({
      value: String(choice.id),
      label: choice.taken ? t("computers.dialog.agentTaken", { name: choice.name }) : choice.name,
      disabled: choice.taken,
    })),
  ];
}

export function AddComputerDialog({
  computers,
  agents,
  onClose,
  onAdded,
}: {
  computers: RemoteComputer[];
  agents: AgentRow[] | null;
  onClose: () => void;
  onAdded: (computer: RemoteComputer) => void;
}) {
  const t = useT();
  const errorText = useErrorText();
  // undefined while loading, null when the list could not be read.
  const [connections, setConnections] = useState<CustomMcpConnection[] | null | undefined>(undefined);
  const [name, setName] = useState("");
  const [connectionId, setConnectionId] = useState("");
  const [agentId, setAgentId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api.listCustomMcp()
      .then((list) => { if (alive) setConnections(list); })
      .catch(() => { if (alive) setConnections(null); });
    return () => { alive = false; };
  }, []);

  const choices = connections ? connectionChoices(connections, computers) : [];
  const free = choices.filter((choice) => !choice.taken);
  const ready = name.trim() !== "" && connectionId !== "";

  const pick = (id: string) => {
    setConnectionId(id);
    const chosen = connections?.find((connection) => connection.id === id);
    if (chosen && !name.trim()) setName(chosen.name.slice(0, 100));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      const computer = await createRemoteComputer({ name: name.trim(), mcp_connection_id: connectionId, ...(agentId ? { agent_id: Number(agentId) } : {}) });
      onAdded(computer);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  let body;
  if (connections === undefined) {
    body = <SkeletonList rows={3} />;
  } else if (connections === null) {
    body = <Banner tone="danger">{t("computers.dialog.serversFailed")}</Banner>;
  } else if (free.length === 0) {
    body = (
      <div className="flex flex-col items-start gap-3 text-sm text-muted">
        <p>{choices.length === 0 ? t("computers.dialog.noServers") : t("computers.dialog.allServersUsed")}</p>
        <LinkButton href={MCP_SERVERS_HREF}>{t("computers.dialog.openServers")}</LinkButton>
      </div>
    );
  } else {
    body = (
      <div className="flex flex-col gap-4">
        {error && <Banner tone="danger">{error}</Banner>}
        <Field label={t("computers.dialog.server")} hint={t("computers.dialog.serverHint")}>
          {(props) => (
            <Select
              {...props}
              value={connectionId}
              placeholder={t("computers.dialog.serverPlaceholder")}
              // The closed control shows the name only; the state line is for the list.
              triggerLabel={connections.find((connection) => connection.id === connectionId)?.name}
              onChange={(event) => pick(event.target.value)}
              triggerClassName="h-control touch:h-touch"
              options={choices.map(({ connection, taken }) => ({
                value: connection.id,
                disabled: taken,
                label: (
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate">{taken ? t("computers.dialog.serverTaken", { name: connection.name }) : connection.name}</span>
                    <span className="truncate text-xs text-muted">
                      {[t(connectionStateKey(connection)), connectionNeedsKey(connection) ? t("computers.server.noKey") : null, connectionHost(connection.endpoint)].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                ),
              }))}
            />
          )}
        </Field>
        <Field label={t("computers.dialog.name")}>
          {(props) => <Input {...props} value={name} maxLength={100} required onChange={(event) => setName(event.target.value)} />}
        </Field>
        <Field label={t("computers.dialog.agentOptional")} hint={t("computers.dialog.agentHint")}>
          {(props) => (
            <Select
              {...props}
              value={agentId}
              onChange={(event) => setAgentId(event.target.value)}
              triggerClassName="h-control touch:h-touch"
              options={agentOptions(t, agentChoices(agents, computers))}
            />
          )}
        </Field>
      </div>
    );
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => { if (!open && !busy) onClose(); }}
      title={t("computers.dialog.addTitle")}
      description={t("computers.dialog.addBody")}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>{t("common.cancel")}</Button>
          {free.length > 0 && <Button type="submit" form="add-computer" variant="primary" loading={busy} disabled={!ready}>{t("computers.add")}</Button>}
        </>
      }
    >
      <form id="add-computer" onSubmit={(event) => void submit(event)}>{body}</form>
    </Dialog>
  );
}

export function EditComputerDialog({
  computer,
  field,
  computers,
  agents,
  onClose,
  onSaved,
}: {
  computer: RemoteComputer;
  field: "agent" | "name";
  computers: RemoteComputer[];
  agents: AgentRow[] | null;
  onClose: () => void;
  onSaved: (computer: RemoteComputer) => void;
}) {
  const t = useT();
  const errorText = useErrorText();
  const [name, setName] = useState(computer.name);
  const [agentId, setAgentId] = useState(computer.agent_id === null ? "" : String(computer.agent_id));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = field === "name" ? name.trim() !== "" && name.trim() !== computer.name : agentId !== (computer.agent_id === null ? "" : String(computer.agent_id));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      onSaved(await updateRemoteComputer(computer.id, field === "name" ? { name: name.trim() } : { agent_id: agentId ? Number(agentId) : null }));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      size="sm"
      onOpenChange={(open) => { if (!open && !busy) onClose(); }}
      title={field === "name" ? t("computers.dialog.renameTitle") : t("computers.dialog.linkTitle", { name: computer.name })}
      description={field === "agent" ? t("computers.dialog.linkBody") : undefined}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>{t("common.cancel")}</Button>
          <Button type="submit" form="edit-computer" variant="primary" loading={busy} disabled={!ready}>{t("computers.dialog.save")}</Button>
        </>
      }
    >
      <form id="edit-computer" className="flex flex-col gap-4" onSubmit={(event) => void submit(event)}>
        {error && <Banner tone="danger">{error}</Banner>}
        {field === "name" ? (
          <Field label={t("computers.dialog.name")}>
            {(props) => <Input {...props} autoFocus value={name} maxLength={100} required onChange={(event) => setName(event.target.value)} />}
          </Field>
        ) : (
          <Field label={t("computers.dialog.agent")}>
            {(props) => (
              <Select
                {...props}
                value={agentId}
                onChange={(event) => setAgentId(event.target.value)}
                triggerClassName="h-control touch:h-touch"
                options={agentOptions(t, agentChoices(agents, computers, computer.id))}
              />
            )}
          </Field>
        )}
      </form>
    </Dialog>
  );
}
