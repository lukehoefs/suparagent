"use client";

// The Routines page (design: Routines.html), inside the app shell: every routine as a card (agent,
// schedule, how the last run went, the next runs, Run now and the on/off switch) and, beside the
// list, the panel of the one you opened: its settings, its runs and its webhook. On a narrow
// page the panel is a sheet (RoutinePanel: the same element, so nothing in it is lost when the
// width crosses over). Owner and admin only, like the routines API. The address says what is open
// (?id=, ?tab=, ?new=1&agent=), so a link can open a routine or the new-routine form.
import { CalendarClock, Plus } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { api, type Agent, type Routine } from "@/lib/api";
import { activeAgents } from "@/lib/agents";
import { newAgentHref } from "@/lib/agent-pages";
import { pollAfterSettle, replyOrder } from "@/lib/agent-automation";
import {
  anyActiveRun,
  cardIndexAfterRemoval,
  markBusy,
  parseRoutinesView,
  replaceRoutine,
  routinesHref,
  samePanel,
  sortRoutines,
  type CardAction,
  type RoutineTab,
  type RoutinesView,
} from "@/lib/routines-page";
import { useT } from "@/lib/use-i18n";
import { cn } from "@/lib/cn";
import { useAppShell, useLeaveGuard } from "@/components/shell/AppShell";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EMPTY_PAGE_CARD, EmptyState } from "@/components/ui/EmptyState";
import { LinkButton } from "@/components/ui/LinkButton";
import { Skeleton, SkeletonList } from "@/components/ui/Skeleton";
import { Card } from "@/components/ui/Surface";
import { Tab, TabList, TabPanel, Tabs } from "@/components/ui/Tabs";
import { useToast } from "@/components/ui/Toast";
import { RoutineCard } from "./RoutineCard";
import { RoutineEditor } from "./RoutineEditor";
import { RoutinePanel } from "./RoutinePanel";
import { RoutineRuns } from "./RoutineRuns";
import { RoutineWebhook } from "./RoutineWebhook";
import { useErrorText, useWidth } from "./shared";

// While a run is queued, running or waiting the list is read every 5 s (as the old dialog did);
// otherwise every 30 s, for the next dates and runs started elsewhere.
const ACTIVE_EVERY_MS = 5_000;
const IDLE_EVERY_MS = 30_000;
// The panel sits beside the list from this content width (list 480 + gap 24 + panel 340, as the
// design wraps them); below it, it opens as a sheet.
const PANEL_BESIDE_PX = 860;

export function RoutinesPage() {
  const t = useT();
  const { isAdmin } = useAppShell();
  return (
    <div className="flex flex-col gap-6 px-4 pb-10 pt-5 sm:px-8 sm:pt-7">
      {isAdmin ? <Routines /> : (
        <>
          <Header />
          <Card className={EMPTY_PAGE_CARD}><EmptyState icon={<CalendarClock size={24} strokeWidth={1.7} />} title={t("routines.adminOnly.title")} description={t("routines.adminOnly.body")} /></Card>
        </>
      )}
    </div>
  );
}

function Header({ action, headingRef, inert }: { action?: ReactNode; headingRef?: RefObject<HTMLHeadingElement | null>; inert?: boolean }) {
  const t = useT();
  return (
    <header inert={inert} className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 ref={headingRef} tabIndex={headingRef ? -1 : undefined} className="text-h1 font-semibold tracking-[-0.02em] text-ink outline-none">{t("routines.title")}</h1>
        <p className="mt-1 text-body text-muted">{t("routines.subtitle")}</p>
      </div>
      {action ? <div className="flex flex-wrap items-center gap-2">{action}</div> : null}
    </header>
  );
}

function Routines() {
  const t = useT();
  const toast = useToast();
  const errorText = useErrorText();
  const router = useRouter();
  const params = useSearchParams();
  const { agents, loadError: agentsError } = useAppShell();
  const view = parseRoutinesView(params);
  const [routines, setRoutines] = useState<Routine[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  // Each card's own action in flight (Run now or the switch), so one card's reply never frees another.
  const [busy, setBusy] = useState<ReadonlyMap<number, CardAction>>(() => new Map());
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState<RoutinesView | null>(null);
  const [deleting, setDeleting] = useState<Routine | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // Reads overlap (the poll, a retry, the read after an action): a reply shows unless a later one is shown.
  const order = useRef(replyOrder());
  const page = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const pageHeading = useRef<HTMLHeadingElement>(null);
  // What had focus when the panel opened, to go back to when it closes.
  const opener = useRef<HTMLElement | null>(null);
  // Where the deleted routine's card sat in the list, so focus goes to the card now in its place.
  const deletedAt = useRef<number | null>(null);
  const width = useWidth(page);
  const beside = width === null || width >= PANEL_BESIDE_PX;
  useLeaveGuard(dirty);

  const read = useCallback(async () => {
    if (document.hidden) return;
    const id = order.current.start();
    try {
      const list = await api.listRoutines();
      if (order.current.settle(id)) { setRoutines(list); setLoadError(null); }
    } catch (err) {
      if (order.current.settle(id)) setLoadError(errorText(err, "routines.loadFailed"));
    }
  }, [errorText]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void read();
    const onShow = () => { if (!document.hidden) void read(); };
    document.addEventListener("visibilitychange", onShow);
    return () => document.removeEventListener("visibilitychange", onShow);
  }, [read]);
  const active = anyActiveRun(routines);
  useEffect(() => pollAfterSettle(read, active ? ACTIVE_EVERY_MS : IDLE_EVERY_MS), [read, active]);

  // A routine the server just answered with: shown at once, and newer than any read still on its way.
  const show = useCallback((next: Routine) => {
    if (order.current.settle(order.current.start())) setRoutines((list) => replaceRoutine(list ?? [], next));
  }, []);

  const navigate = useCallback((next: RoutinesView) => {
    if (next.kind !== "list" && view.kind === "list" && document.activeElement instanceof HTMLElement) opener.current = document.activeElement;
    router.replace(routinesHref(next), { scroll: false });
  }, [router, view.kind]);

  // Moving to another panel while the editor holds changes asks first.
  const go = (next: RoutinesView) => {
    if (dirty && !samePanel(view, next)) { setPending(next); return; }
    navigate(next);
  };

  const panelKey = view.kind === "routine" ? `routine-${view.id}` : view.kind;
  const panelOpen = view.kind !== "list";
  // Shown once the page has been measured: beside the list when there is room, else as a sheet.
  const panelShown = panelOpen && width !== null;
  const sheet = panelShown && !beside;
  // Opening the panel (or another routine in it) moves focus to its heading; closing it moves focus
  // back to what opened it, or after a delete to the card now in the deleted one's place (else the
  // New routine button, else the page heading).
  useEffect(() => {
    if (panelShown) { heading.current?.focus({ preventScroll: true }); return; }
    if (panelOpen) return;
    const removed = deletedAt.current;
    deletedAt.current = null;
    if (removed !== null) {
      const cards = [...(page.current?.querySelectorAll<HTMLElement>("[data-routine-open]") ?? [])];
      const at = cardIndexAfterRemoval(removed, cards.length);
      const target = (at === null ? null : cards[at]) ?? page.current?.querySelector<HTMLElement>("[data-routines-new]:not(:disabled)") ?? pageHeading.current;
      target?.focus();
    } else if (opener.current?.isConnected) {
      opener.current.focus({ preventScroll: true });
    }
    opener.current = null;
  }, [panelKey, panelOpen, panelShown]);

  const act = async (routine: Routine, action: CardAction, work: () => Promise<unknown>, doneKey: string) => {
    setBusy((current) => markBusy(current, routine.id, action));
    setActionError(null);
    try {
      const result = await work();
      // Pause and Resume answer with the routine itself.
      if (result && typeof result === "object" && "schedule_kind" in result) show(result as Routine);
      toast(t(doneKey, { name: routine.name }));
    } catch (err) {
      setActionError(t("agentAutomation.routines.actionFailed", { name: routine.name, reason: errorText(err) }));
    } finally {
      setBusy((current) => markBusy(current, routine.id, null));
      void read();
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    const routine = deleting;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await api.deleteRoutine(routine.id);
      order.current.settle(order.current.start());
      deletedAt.current = sortRoutines(routines ?? []).findIndex((item) => item.id === routine.id);
      setRoutines((list) => list?.filter((item) => item.id !== routine.id) ?? list);
      setDirty(false);
      setDeleting(null);
      navigate({ kind: "list" });
      toast(t("routines.toast.deleted", { name: routine.name }));
    } catch (err) {
      // The dialog stays open and says why, where it is seen (the page's banner can be behind a sheet).
      setDeleteError(errorText(err, "routines.delete.failed"));
    } finally {
      setDeleteBusy(false);
    }
  };

  const live = activeAgents(agents);
  const noAgents = agents !== null && live.length === 0;
  const sorted = routines ? sortRoutines(routines) : null;
  const empty = sorted !== null && sorted.length === 0;
  const selectedId = view.kind === "routine" ? view.id : null;
  const openNew = () => go({ kind: "new", agentId: null });
  // Secondary, as the design draws it: the editor's Save is the view's one primary button.
  const newButton = empty ? undefined : (
    <Button
      icon={<Plus size={15} strokeWidth={1.7} aria-hidden="true" />}
      onClick={openNew}
      data-routines-new=""
      disabled={agents === null || noAgents}
      title={noAgents ? t("routines.noAgents.title") : undefined}
    >
      {t("routines.new")}
    </Button>
  );

  let list: ReactNode;
  if (sorted === null) {
    list = loadError ? null : (
      <div role="status" aria-busy="true" className="flex flex-col gap-3">
        <span className="sr-only">{t("routines.loading")}</span>
        {[0, 1, 2].map((key) => (
          <Card key={key} className="flex items-center gap-3.5 px-4 py-3.5">
            <Skeleton className="size-8 rounded-full" />
            <div className="flex flex-1 flex-col gap-2"><Skeleton className="h-4 w-48" /><Skeleton className="h-3 w-64 max-w-full" /></div>
            <Skeleton className="h-9 w-24" />
          </Card>
        ))}
      </div>
    );
  } else if (empty) {
    list = noAgents ? (
      <Card className={EMPTY_PAGE_CARD}>
        <EmptyState
          icon={<CalendarClock size={24} strokeWidth={1.7} />}
          title={t("routines.noAgents.title")}
          description={t("routines.noAgents.body")}
          action={<LinkButton variant="primary" href={newAgentHref()} icon={<Plus size={15} strokeWidth={1.7} aria-hidden="true" />}>{t("routines.noAgents.action")}</LinkButton>}
        />
      </Card>
    ) : (
      <Card className={EMPTY_PAGE_CARD}>
        <EmptyState
          icon={<CalendarClock size={24} strokeWidth={1.7} />}
          title={t("routines.empty.title")}
          description={t("routines.empty.body")}
          action={panelOpen ? undefined : (
            <Button variant="primary" icon={<Plus size={15} strokeWidth={1.7} aria-hidden="true" />} onClick={openNew} data-routines-new="" disabled={agents === null}>{t("routines.new")}</Button>
          )}
        />
      </Card>
    );
  } else {
    list = (
      <ul aria-label={t("routines.list")} className="flex flex-col gap-3">
        {sorted.map((routine) => (
          <li key={routine.id} className="min-w-0">
            <RoutineCard
              routine={routine}
              agents={agents}
              selected={selectedId === routine.id}
              busy={busy.get(routine.id) ?? null}
              onOpen={() => go(selectedId === routine.id ? { kind: "list" } : { kind: "routine", id: routine.id, tab: "settings" })}
              onRunNow={() => void act(routine, "run", () => api.runRoutineNow(routine.id), "routines.toast.started")}
              onToggle={(on) => void act(
                routine,
                "toggle",
                () => (on ? api.resumeRoutine(routine.id) : api.pauseRoutine(routine.id)),
                on ? "routines.toast.resumed" : "routines.toast.paused",
              )}
            />
          </li>
        ))}
      </ul>
    );
  }

  const panelRoutine = view.kind === "routine" ? routines?.find((routine) => routine.id === view.id) ?? null : null;
  const close = () => go({ kind: "list" });
  const title = view.kind === "new" ? t("routines.panel.new") : t("routines.panel.edit");
  const body = panelOpen ? (
    <PanelBody
      view={view}
      routines={routines}
      routine={panelRoutine}
      agents={agents}
      agentsError={agentsError}
      noAgents={noAgents}
      onTab={(tab) => { if (view.kind === "routine") go({ kind: "routine", id: view.id, tab }); }}
      onSaved={(saved, created) => {
        show(saved);
        setDirty(false);
        toast(t(created ? "routines.toast.created" : "routines.toast.saved", { name: saved.name }));
        if (created) navigate({ kind: "routine", id: saved.id, tab: "settings" });
      }}
      onCancel={() => { setDirty(false); navigate({ kind: "list" }); }}
      onDelete={panelRoutine ? () => { setDeleteError(null); setDeleting(panelRoutine); } : undefined}
      onDirtyChange={setDirty}
      onChange={show}
      onClose={close}
    />
  ) : null;

  return (
    <div ref={page} className="flex flex-col gap-6">
      {/* Behind a sheet the page is out of reach (the sheet is modal); beside the list it is not. */}
      <Header action={newButton} headingRef={pageHeading} inert={sheet || undefined} />
      {loadError && (
        <Banner
          tone="danger"
          onDismiss={routines !== null ? () => setLoadError(null) : undefined}
          action={<Button onClick={() => { setLoadError(null); void read(); }}>{t("routines.retry")}</Button>}
        >
          {loadError}
        </Banner>
      )}
      {actionError && <Banner tone="danger" onDismiss={() => setActionError(null)}>{actionError}</Banner>}

      <div className={cn("flex gap-6", panelShown && !sheet ? "flex-row items-start" : "flex-col")}>
        <div inert={sheet || undefined} className="flex min-w-0 flex-1 flex-col gap-3">{list}</div>
        {/* One panel at one place in the tree whatever the width, so what is in it stays mounted. */}
        {panelShown && (
          <RoutinePanel
            sheet={sheet}
            title={title}
            subtitle={panelRoutine?.name}
            closeLabel={t("routines.panel.close")}
            headingRef={heading}
            onClose={close}
          >
            {body}
          </RoutinePanel>
        )}
      </div>

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => { if (!open) setPending(null); }}
        title={t("routines.discard.title")}
        description={t("routines.discard.body")}
        confirmLabel={t("routines.discard.confirm")}
        cancelLabel={t("routines.discard.keep")}
        danger
        onConfirm={() => {
          const next = pending;
          setPending(null);
          setDirty(false);
          if (next) navigate(next);
        }}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => { if (!open && !deleteBusy) { setDeleting(null); setDeleteError(null); } }}
        title={deleting ? t("routines.delete.title", { name: deleting.name }) : ""}
        description={t("routines.delete.body")}
        confirmLabel={t("routines.delete.confirm")}
        cancelLabel={t("routines.cancel")}
        danger
        loading={deleteBusy}
        onConfirm={() => void confirmDelete()}
      >
        {deleteError && <Banner tone="danger">{deleteError}</Banner>}
      </ConfirmDialog>
    </div>
  );
}

function PanelBody({
  view,
  routines,
  routine,
  agents,
  agentsError,
  noAgents,
  onTab,
  onSaved,
  onCancel,
  onDelete,
  onDirtyChange,
  onChange,
  onClose,
}: {
  view: RoutinesView;
  routines: Routine[] | null;
  routine: Routine | null;
  agents: Agent[] | null;
  // Why the shell could not load the agents; the editor needs them to name and choose one.
  agentsError: string | null;
  noAgents: boolean;
  onTab: (tab: RoutineTab) => void;
  onSaved: (routine: Routine, created: boolean) => void;
  onCancel: () => void;
  onDelete?: () => void;
  onDirtyChange: (dirty: boolean) => void;
  onChange: (routine: Routine) => void;
  onClose: () => void;
}) {
  const t = useT();
  if (agents === null && agentsError) return <Banner tone="danger">{agentsError}</Banner>;
  if (view.kind === "new") {
    if (agents === null) return <SkeletonList rows={5} />;
    if (noAgents) {
      return (
        <EmptyState
          compact
          title={t("routines.noAgents.title")}
          description={t("routines.noAgents.body")}
          action={<LinkButton href={newAgentHref()} icon={<Plus size={15} strokeWidth={1.7} aria-hidden="true" />}>{t("routines.noAgents.action")}</LinkButton>}
        />
      );
    }
    return (
      <RoutineEditor
        key="new"
        routine={null}
        agents={agents}
        agentId={view.agentId}
        onSaved={onSaved}
        onCancel={onCancel}
        onDirtyChange={onDirtyChange}
      />
    );
  }
  if (view.kind !== "routine") return null;
  if (routines === null || agents === null) return <SkeletonList rows={5} />;
  if (!routine) {
    return (
      <EmptyState
        compact
        title={t("routines.panel.missingTitle")}
        description={t("routines.panel.missingBody")}
        action={<Button onClick={onClose}>{t("routines.panel.close")}</Button>}
      />
    );
  }
  return (
    <Tabs value={view.tab} onValueChange={(tab) => onTab(tab as RoutineTab)}>
      {/* The design has no tab strip; it sits 8 px closer under the title (its tabs' own padding
          keeps their words 14 px clear), and each tab's content starts 14 px below it, so the
          settings form keeps the design's spacing and fits beside the list. */}
      <div className="-mt-2">
        <TabList label={t("routines.panel.tabs")}>
          <Tab value="settings">{t("routines.tab.settings")}</Tab>
          <Tab value="runs">{t("routines.tab.runs")}</Tab>
          <Tab value="webhook">{t("routines.tab.webhook")}</Tab>
        </TabList>
      </div>
      {/* Settings and Webhook stay mounted while another tab shows: the draft and a secret just made are kept. */}
      <TabPanel value="settings" forceMount className="pt-3.5 data-[state=inactive]:hidden">
        <RoutineEditor
          key={routine.id}
          routine={routine}
          agents={agents}
          agentId={null}
          onSaved={onSaved}
          onCancel={onCancel}
          onDelete={onDelete}
          onDirtyChange={onDirtyChange}
        />
      </TabPanel>
      <TabPanel value="runs" className="pt-3.5">
        <RoutineRuns routine={routine} />
      </TabPanel>
      <TabPanel value="webhook" forceMount className="pt-3.5 data-[state=inactive]:hidden">
        <RoutineWebhook key={routine.id} routine={routine} onChange={onChange} />
      </TabPanel>
    </Tabs>
  );
}
