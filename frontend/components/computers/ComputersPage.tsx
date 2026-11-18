"use client";

// The Computers page (design: Computers.html), inside the app shell: every agent's cloud computer
// as a card, then the live view of the one you opened. Owner and admin only, like its routes.
import { Monitor, Plus } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  checkRemoteComputer,
  createChangeClock,
  deleteRemoteComputer,
  handBack,
  listRemoteComputers,
  remoteComputersUnsupported,
  remoteFailureKey,
  replaceComputer,
  takeControl,
  updateRemoteComputer,
  type RemoteComputer,
} from "@/lib/remote-computers";
import { useT } from "@/lib/use-i18n";
import { useAppShell } from "@/components/shell/AppShell";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { Card } from "@/components/ui/Surface";
import { useToast } from "@/components/ui/Toast";
import { AddComputerDialog, EditComputerDialog } from "./ComputerDialogs";
import { ComputerCard } from "./ComputerCard";
import { LiveViewSection } from "./LiveViewSection";

// The backend caches each gateway's health for about 30 s; reading more often shows nothing new.
const LIST_EVERY_MS = 30_000;
const GRID = "grid grid-cols-[repeat(auto-fill,minmax(min(260px,100%),1fr))] gap-4";

type Phase = "loading" | "ready" | "unsupported" | "failed";

export function ComputersPage() {
  const t = useT();
  const { isAdmin } = useAppShell();
  return (
    <div className="flex flex-col gap-6 px-4 pb-10 pt-5 sm:px-8 sm:pt-7">
      {isAdmin ? <Computers /> : (
        <>
          <Header />
          <Card><EmptyState icon={<Monitor size={24} />} title={t("computers.adminOnly.title")} description={t("computers.adminOnly.body")} /></Card>
        </>
      )}
    </div>
  );
}

function Header({ action }: { action?: ReactNode }) {
  const t = useT();
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-h1 font-semibold tracking-[-0.02em] text-ink">{t("computers.title")}</h1>
        <p className="mt-1 text-body text-muted">{t("computers.subtitle")}</p>
      </div>
      {action ? <div className="flex flex-wrap items-center gap-2">{action}</div> : null}
    </header>
  );
}

function Computers() {
  const t = useT();
  const toast = useToast();
  const { agents, refreshAgents } = useAppShell();
  const [computers, setComputers] = useState<RemoteComputer[] | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<{ id: number; field: "agent" | "name" } | null>(null);
  const [removing, setRemoving] = useState<RemoteComputer | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  const liveHeading = useRef<HTMLHeadingElement>(null);
  // Set by Open live view and Take control: once the section shows, it is scrolled to and focused.
  const reveal = useRef(false);
  // A list read that overlaps a change made here is dropped: it may carry the state from before it.
  const [clock] = useState(createChangeClock);

  const refresh = useCallback(() => setTick((n) => n + 1), []);

  // The list, again every 30 s while the tab is visible and at once when it shows again.
  useEffect(() => {
    let alive = true;
    const read = () => {
      if (document.hidden) return;
      const stamp = clock.stamp();
      listRemoteComputers()
        .then((list) => { if (alive && clock.current(stamp)) { setComputers(list); setPhase("ready"); setLoadError(null); } })
        .catch((err: unknown) => {
          if (!alive) return;
          if (remoteComputersUnsupported(err)) setPhase("unsupported");
          else { setLoadError(t(remoteFailureKey(err, "computers.loadFailed"))); setPhase((current) => (current === "ready" ? current : "failed")); }
        });
    };
    read();
    const timer = window.setInterval(read, LIST_EVERY_MS);
    document.addEventListener("visibilitychange", read);
    return () => { alive = false; window.clearInterval(timer); document.removeEventListener("visibilitychange", read); };
  }, [tick, t, clock]);

  const selected = computers?.find((computer) => computer.id === selectedId) ?? null;

  useEffect(() => {
    if (!selected || !reveal.current) return;
    reveal.current = false;
    liveHeading.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    liveHeading.current?.focus({ preventScroll: true });
  }, [selected]);

  const put = useCallback((next: RemoteComputer) => setComputers((list) => (list ? replaceComputer(list, next) : list)), []);

  const act = async (computer: RemoteComputer, work: () => Promise<RemoteComputer | void>, after?: (next: RemoteComputer | void) => void) => {
    setBusyId(computer.id);
    setActionError(null);
    try {
      const next = await clock.change(work);
      if (next) put(next);
      after?.(next);
    } catch (err) {
      setActionError(t(remoteFailureKey(err)));
    } finally {
      setBusyId(null);
    }
  };

  const open = (computer: RemoteComputer) => {
    // Already open: nothing re-renders, so go to it now.
    if (selectedId === computer.id && liveHeading.current) {
      liveHeading.current.scrollIntoView({ behavior: "smooth", block: "start" });
      liveHeading.current.focus({ preventScroll: true });
      return;
    }
    reveal.current = true;
    setSelectedId(computer.id);
  };

  const confirmRemove = async () => {
    if (!removing) return;
    const computer = removing;
    setRemoveBusy(true);
    try {
      await clock.change(() => deleteRemoteComputer(computer.id));
      setComputers((list) => list?.filter((item) => item.id !== computer.id) ?? list);
      if (selectedId === computer.id) setSelectedId(null);
      if (computer.agent_id !== null) refreshAgents();
      toast(t("computers.toast.removed", { name: computer.name }));
    } catch (err) {
      setActionError(t(remoteFailureKey(err)));
    } finally {
      setRemoveBusy(false);
      setRemoving(null);
    }
  };

  const editingComputer = editing ? computers?.find((computer) => computer.id === editing.id) ?? null : null;
  const empty = phase === "ready" && computers !== null && computers.length === 0;
  const addButton = phase === "ready" && !empty
    ? <Button icon={<Plus size={15} aria-hidden="true" />} onClick={() => setAdding(true)}>{t("computers.add")}</Button>
    : undefined;

  let content;
  if (phase === "loading") {
    content = (
      <div role="status" className={GRID}>
        <span className="sr-only">{t("computers.loading")}</span>
        {[0, 1, 2].map((key) => (
          <Card key={key} className="flex flex-col gap-3 p-3.5">
            <Skeleton className="h-[150px] w-full rounded-field" />
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-9 w-48" />
          </Card>
        ))}
      </div>
    );
  } else if (phase === "unsupported") {
    content = <Card><EmptyState icon={<Monitor size={24} />} title={t("computers.unsupported.title")} description={t("computers.unsupported.body")} /></Card>;
  } else if (phase === "failed") {
    content = null;
  } else if (empty) {
    content = (
      <Card>
        <EmptyState
          icon={<Monitor size={24} />}
          title={t("computers.empty.title")}
          description={t("computers.empty.body")}
          action={<Button variant="primary" icon={<Plus size={15} aria-hidden="true" />} onClick={() => setAdding(true)}>{t("computers.add")}</Button>}
        />
      </Card>
    );
  } else {
    content = (
      <ul aria-label={t("computers.list")} className={GRID}>
        {(computers ?? []).map((computer) => (
          <li key={computer.id} className="min-w-0">
            <ComputerCard
              computer={computer}
              busy={busyId === computer.id}
              actions={{
                onOpen: () => open(computer),
                onTakeControl: () => void act(computer, () => takeControl(computer.id), () => open(computer)),
                onHandBack: () => void act(computer, () => handBack(computer.id)),
                onLink: () => setEditing({ id: computer.id, field: "agent" }),
                onUnlink: () => void act(computer, () => updateRemoteComputer(computer.id, { agent_id: null }), () => refreshAgents()),
                onRename: () => setEditing({ id: computer.id, field: "name" }),
                onCheck: () => void act(computer, () => checkRemoteComputer(computer.id)),
                onRemove: () => setRemoving(computer),
              }}
            />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <>
      <Header action={addButton} />
      {loadError && (
        <Banner tone="danger" onDismiss={phase === "ready" ? () => setLoadError(null) : undefined} action={<Button size="sm" onClick={refresh}>{t("computers.retry")}</Button>}>
          {loadError}
        </Banner>
      )}
      {actionError && <Banner tone="danger" onDismiss={() => setActionError(null)}>{actionError}</Banner>}
      {content}
      {selected && (
        <LiveViewSection
          key={selected.id}
          ref={liveHeading}
          computer={selected}
          change={clock.change}
          onChange={put}
          onRefresh={refresh}
          onClose={() => setSelectedId(null)}
        />
      )}

      {adding && computers && (
        <AddComputerDialog
          computers={computers}
          agents={agents}
          onClose={() => setAdding(false)}
          onAdded={(computer) => {
            clock.mark();
            setComputers((list) => [...(list ?? []), computer]);
            setAdding(false);
            if (computer.agent_id !== null) refreshAgents();
            toast(t("computers.toast.added", { name: computer.name }));
          }}
        />
      )}
      {editing && editingComputer && computers && (
        <EditComputerDialog
          computer={editingComputer}
          field={editing.field}
          computers={computers}
          agents={agents}
          onClose={() => setEditing(null)}
          onSaved={(next) => {
            clock.mark();
            put(next);
            setEditing(null);
            if (editing.field === "agent") refreshAgents();
          }}
        />
      )}
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(value) => { if (!value && !removeBusy) setRemoving(null); }}
        title={removing ? t("computers.remove.title", { name: removing.name }) : ""}
        description={t("computers.remove.body")}
        confirmLabel={t("computers.remove.confirm")}
        cancelLabel={t("common.cancel")}
        danger
        loading={removeBusy}
        onConfirm={() => void confirmRemove()}
      />
    </>
  );
}
