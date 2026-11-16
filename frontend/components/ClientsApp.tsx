"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, Monitor, Plus, RotateCw, Smartphone, Tablet, Trash2, Users } from "lucide-react";
import { api, type Agent, type ClientsResponse, type PortalClient } from "@/lib/api";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/Badge";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input, Textarea } from "@/components/ui/Input";
import { SkeletonList } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";

type Device = "desktop" | "tablet" | "phone";
const DEVICES: { id: Device; label: string; width: string; icon: typeof Monitor }[] = [
  { id: "desktop", label: "Desktop", width: "100%", icon: Monitor },
  { id: "tablet", label: "Tablet", width: "820px", icon: Tablet },
  { id: "phone", label: "Phone", width: "390px", icon: Smartphone },
];
const SWATCHES = ["#4f46e5", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#64748b"];

const blank = (): PortalClient => ({
  id: Math.random().toString(16).slice(2, 14), name: "New client", portal_path: "/", contact: "", notes: "", agent_ids: [], color: SWATCHES[0],
});
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";

// Clients: who has a branded portal, which agents work for them, and a live "client view" of that portal.
export function ClientsApp() {
  const [data, setData] = useState<ClientsResponse | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [draft, setDraft] = useState<PortalClient[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  useEffect(() => {
    api.getClients().then((res) => { setData(res); setDraft(res.clients); setSelected(res.clients[0]?.id ?? null); })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load clients."));
    api.listAgents().then(setAgents).catch(() => setAgents([]));
  }, []);

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(data?.clients ?? []), [draft, data]);
  const current = draft.find((c) => c.id === selected) ?? null;
  const patch = useCallback((id: string, change: Partial<PortalClient>) =>
    setDraft((list) => list.map((c) => (c.id === id ? { ...c, ...change } : c))), []);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await api.saveClients(draft);
      setData(res);
      setDraft(res.clients);
      toast("Clients saved.");
    } catch (err) {
      setError(err instanceof Error ? `Not saved. ${err.message}` : "Not saved.");
    } finally {
      setSaving(false);
    }
  };

  const add = () => { const c = blank(); setDraft((list) => [...list, c]); setSelected(c.id); };
  const remove = (id: string) => {
    setDraft((list) => list.filter((c) => c.id !== id));
    setSelected((cur) => (cur === id ? draft.find((c) => c.id !== id)?.id ?? null : cur));
  };

  return <div className="flex min-h-dvh flex-col">
    <header className="flex h-12 shrink-0 items-center gap-4 border-b border-line px-4">
      <Link href="/chat/" className="text-sm text-muted hover:underline">← Chat</Link>
      <h1 className="text-sm font-semibold">Clients</h1>
      <div className="ml-auto flex items-center gap-2">
        {dirty && <span className="text-xs text-muted">Unsaved changes</span>}
        <Button variant="primary" size="sm" onClick={save} loading={saving} disabled={!dirty}>Save</Button>
      </div>
    </header>
    {error && <div className="px-4 pt-3"><Banner tone="danger">{error}</Banner></div>}
    {!data && !error ? <div className="p-6"><SkeletonList /></div> : (
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[260px_1fr]">
        <aside className="border-b border-line p-3 lg:border-b-0 lg:border-r">
          <div className="mb-2 flex items-center justify-between px-1">
            <span className="text-xs font-medium uppercase tracking-wide text-muted">{draft.length} client{draft.length === 1 ? "" : "s"}</span>
            <Button size="sm" variant="ghost" icon={<Plus size={14} />} onClick={add}>Add</Button>
          </div>
          <ul className="space-y-0.5">
            {draft.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => setSelected(c.id)}
                  className={cn("flex w-full items-center gap-2.5 rounded-field px-2 py-1.5 text-left text-sm transition-colors", c.id === selected ? "bg-hover font-medium" : "hover:bg-hover/60")}>
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold text-white" style={{ background: c.color }}>{initials(c.name)}</span>
                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
                  {c.agent_ids.length > 0 && <span className="text-xs text-muted">{c.agent_ids.length}</span>}
                </button>
              </li>
            ))}
          </ul>
        </aside>
        <main className="min-w-0">
          {!current ? (
            <div className="p-10"><EmptyState icon={<Users size={20} />} title="No client selected"
              description="Add a client to give them a branded portal and see exactly what they see."
              action={<Button variant="primary" icon={<Plus size={14} />} onClick={add}>Add a client</Button>} /></div>
          ) : (
            <ClientDetail key={current.id} client={current} agents={agents} origins={data!}
              onChange={(change) => patch(current.id, change)} onRemove={() => remove(current.id)} />
          )}
        </main>
      </div>
    )}
  </div>;
}

function ClientDetail({ client, agents, origins, onChange, onRemove }: {
  client: PortalClient; agents: Agent[]; origins: ClientsResponse;
  onChange: (change: Partial<PortalClient>) => void; onRemove: () => void;
}) {
  const [device, setDevice] = useState<Device>("desktop");
  const [reload, setReload] = useState(0);
  const [tab, setTab] = useState<"view" | "details">("view");
  const path = client.portal_path.startsWith("/") ? client.portal_path : "/";
  const previewUrl = `${origins.preview_origin}${path}`;
  const portalUrl = `${origins.portal_origin}${path}`;
  const width = DEVICES.find((d) => d.id === device)!.width;
  const toggleAgent = (id: number) =>
    onChange({ agent_ids: client.agent_ids.includes(id) ? client.agent_ids.filter((a) => a !== id) : [...client.agent_ids, id] });

  return <div className="flex h-full flex-col">
    <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3">
      <span className="flex size-9 items-center justify-center rounded-lg text-sm font-semibold text-white shadow-sm" style={{ background: client.color }}>{initials(client.name)}</span>
      <div className="min-w-0">
        <h2 className="truncate text-base font-semibold">{client.name}</h2>
        <p className="truncate text-xs text-muted">{portalUrl}</p>
      </div>
      <div className="ml-auto inline-flex rounded-field border border-line p-0.5 text-sm" role="tablist">
        {(["view", "details"] as const).map((id) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
            className={cn("rounded-[calc(var(--radius-field)-2px)] px-3 py-1 transition-colors", tab === id ? "bg-ink text-surface" : "text-muted hover:text-ink")}>
            {id === "view" ? "Client view" : "Details"}
          </button>
        ))}
      </div>
    </div>

    {tab === "view" ? (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-2 px-5 py-2.5">
          <Badge tone="neutral">Signed in as the preview account</Badge>
          <div className="ml-auto inline-flex rounded-field border border-line p-0.5">
            {DEVICES.map(({ id, label, icon: Icon }) => (
              <button key={id} type="button" title={label} aria-label={label} aria-pressed={device === id} onClick={() => setDevice(id)}
                className={cn("rounded-[calc(var(--radius-field)-2px)] p-1.5 transition-colors", device === id ? "bg-hover text-ink" : "text-muted hover:text-ink")}>
                <Icon size={15} />
              </button>
            ))}
          </div>
          <Button size="sm" variant="ghost" icon={<RotateCw size={14} />} onClick={() => setReload((n) => n + 1)}>Refresh</Button>
          <a href={portalUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-accent hover:underline">
            Open portal <ExternalLink size={13} />
          </a>
        </div>
        <div className="min-h-0 flex-1 bg-inset/60 p-4">
          <div className="mx-auto flex h-full min-h-[560px] flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-lg transition-[max-width] duration-300" style={{ maxWidth: width }}>
            <div className="flex h-8 shrink-0 items-center gap-1.5 border-b border-line px-3">
              <span className="size-2.5 rounded-full bg-[#ff5f57]" /><span className="size-2.5 rounded-full bg-[#febc2e]" /><span className="size-2.5 rounded-full bg-[#28c840]" />
              <span className="mx-auto truncate rounded-md bg-inset px-3 py-0.5 text-[11px] text-muted">{portalUrl.replace("https://", "")}</span>
            </div>
            <iframe key={`${previewUrl}-${reload}`} src={previewUrl} title={`${client.name} portal (client view)`}
              className="min-h-0 w-full flex-1 bg-white" referrerPolicy="no-referrer" />
          </div>
        </div>
        <p className="px-5 pb-3 text-xs text-muted">
          The client view frames {origins.preview_origin.replace("https://", "")}, which keeps its own sign-in. Sign in there once with a
          preview account that has this client&apos;s role (a guest or member in their workspace), and the view shows exactly what they see.
        </p>
      </div>
    ) : (
      <div className="mx-auto w-full max-w-2xl space-y-5 px-5 py-6">
        <label className="block space-y-1.5"><span className="text-sm font-medium">Name</span>
          <Input value={client.name} maxLength={120} onChange={(e) => onChange({ name: e.target.value })} /></label>
        <label className="block space-y-1.5"><span className="text-sm font-medium">Portal workspace path</span>
          <Input value={client.portal_path} maxLength={300} placeholder="/w/acme" onChange={(e) => onChange({ portal_path: e.target.value })} />
          <span className="block text-xs text-muted">The part after portal.lthops.tech, or paste the full portal address.</span></label>
        <label className="block space-y-1.5"><span className="text-sm font-medium">Main contact</span>
          <Input value={client.contact} maxLength={200} placeholder="Name, email" onChange={(e) => onChange({ contact: e.target.value })} /></label>
        <div className="space-y-1.5"><span className="text-sm font-medium">Colour</span>
          <div className="flex gap-2">{SWATCHES.map((s) => (
            <button key={s} type="button" aria-label={`Colour ${s}`} onClick={() => onChange({ color: s })}
              className={cn("size-6 rounded-full ring-offset-2 ring-offset-surface transition", client.color === s && "ring-2 ring-ink")} style={{ background: s }} />
          ))}</div></div>
        <div className="space-y-1.5"><span className="text-sm font-medium">Agents working for this client</span>
          {agents.length === 0 ? <p className="text-sm text-muted">No agents yet.</p> : (
            <div className="flex flex-wrap gap-1.5">{agents.map((a) => {
              const on = client.agent_ids.includes(a.id);
              return <button key={a.id} type="button" aria-pressed={on} onClick={() => toggleAgent(a.id)}
                className={cn("rounded-full border px-3 py-1 text-sm transition-colors", on ? "border-ink bg-ink text-surface" : "border-line hover:bg-hover")}>{a.name}</button>;
            })}</div>
          )}</div>
        <label className="block space-y-1.5"><span className="text-sm font-medium">Notes</span>
          <Textarea rows={5} value={client.notes} maxLength={4000} onChange={(e) => onChange({ notes: e.target.value })} /></label>
        <div className="flex justify-between border-t border-line pt-4">
          <Button variant="danger" size="sm" icon={<Trash2 size={14} />} onClick={onRemove}>Remove client</Button>
          <span className="self-center text-xs text-muted">Removing only takes them off this list; their portal workspace stays.</span>
        </div>
      </div>
    )}
  </div>;
}
