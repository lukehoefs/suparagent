"use client";

// Agent permissions (design: Permissions.html): grant tools, apps and skills to many agents at once.
// Reads every source (load.ts), keeps the edits as a second state beside the saved one, and saves them
// together through the existing routes (save.ts): a failure marks its own cells and keeps them pending,
// the rest saves. Every tool use still asks for approval; a grant only makes the tool available.
import { KeyRound, SearchX, Users } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { supportsToolGrants } from "@/lib/new-agent";
import type { Level } from "@/lib/connected-apps";
import {
  MAX_AGENT_SKILLS, SKILLS_GROUP, agentsInClient, changeKey, changeTally, changesStillShown, diff, overSkillLimit, planSave, raiseEntries,
  raisesConfirmed, raisesToWrite, reapply, runSave, setAppAccount, setAppLevel, skillCount, toggleKeys, visibleSources,
  type MatrixState, type SourceType,
} from "@/lib/permissions-matrix";
import { SIDEBAR_INLINE, useMediaQuery } from "@/lib/use-media-query";
import { useT } from "@/lib/use-i18n";
import { useLeaveGuard } from "@/components/shell/AppShell";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { LinkButton } from "@/components/ui/LinkButton";
import { Skeleton } from "@/components/ui/Skeleton";
import { Card } from "@/components/ui/Surface";
import { useToast } from "@/components/ui/Toast";
import { ChangesBar } from "./ChangesBar";
import { FiltersPanel } from "./FiltersPanel";
import { MatrixGrid } from "./MatrixGrid";
import { MatrixList } from "./MatrixList";
import { ReviewSheet } from "./ReviewSheet";
import { SourceNotes } from "./SourceNotes";
import { loadSnapshot, type Snapshot } from "./load";
import { saveDeps, saveErrorText } from "./save";
import { usePlural, useSectionLabel, useSourceLabel, type MatrixView } from "./shared";

const EMPTY: MatrixState = { grants: new Set(), apps: new Map() };
const ALL_TYPES: readonly SourceType[] = ["tool", "skill"];

export function PermissionsMatrix() {
  const t = useT();
  const plural = usePlural();
  const toast = useToast();
  const labelOf = useSourceLabel();
  const sectionLabel = useSectionLabel();
  // The grid needs room for its columns; a phone gets the one-column list.
  const wide = useMediaQuery(SIDEBAR_INLINE);
  const reviewId = useId();

  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [phase, setPhase] = useState<"loading" | "ready" | "failed">("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [desired, setDesired] = useState<MatrixState>(EMPTY);
  const [query, setQuery] = useState("");
  const [types, setTypes] = useState<Set<SourceType>>(() => new Set(ALL_TYPES));
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const [clientId, setClientId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  // The raises (raiseEntries) shown when the person ticked to confirm: a tick never covers raises made after it.
  const [confirmedFor, setConfirmedFor] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);
  // Why each change that did not save failed, by change key.
  const [failed, setFailed] = useState<ReadonlyMap<string, string>>(new Map());
  // Failed changes whose tool or agent was gone after the save.
  const [dropped, setDropped] = useState(0);

  const changes = useMemo(() => (snapshot ? diff(snapshot.saved, desired) : []), [snapshot, desired]);
  // Edits survive a reload ("Try again"): they are put back on whatever the server says now.
  const changesRef = useRef(changes);
  useEffect(() => { changesRef.current = changes; }, [changes]);
  // The first source opens on the first load only; after that, open and closed are the person's.
  const firstLoad = useRef(true);
  // Where focus goes when the bar it was on goes away (after a save or a discard).
  const rootRef = useRef<HTMLDivElement>(null);
  // Every read (this effect's and a save's own) takes a number; only the latest may replace the snapshot,
  // so a read that started before a save finished never overwrites what the save read back.
  const loadSeq = useRef(0);

  useEffect(() => {
    let live = true;
    loadSeq.current += 1;
    const seq = loadSeq.current;
    const current = () => live && seq === loadSeq.current;
    loadSnapshot()
      .then((next) => {
        if (!current()) return;
        const kept = changesStillShown(changesRef.current, next.sources, next.agents.map((agent) => agent.id));
        setSnapshot(next);
        setDesired(reapply(next.saved, kept));
        if (firstLoad.current) {
          firstLoad.current = false;
          setExpanded(next.sources[0]?.id ?? null);
        }
        setPhase("ready");
      })
      .catch((err: unknown) => {
        if (!current()) return;
        setLoadError(err instanceof Error && err.message ? err.message : null);
        setPhase("failed");
      });
    return () => { live = false; };
  }, [tick]);

  const reload = useCallback(() => {
    setPhase("loading");
    setLoadError(null);
    setTick((n) => n + 1);
  }, []);

  const dirty = changes.length > 0;
  // Leaving asks before unsaved changes are lost: in-app links, the sidebar, the command palette and
  // Back/Forward get the shell's leave dialog; reload and close get the browser's own prompt.
  useLeaveGuard(dirty || saving);

  // Review focus: the heading when opened, the confirm tick when Save needs it, the button when closed.
  const reviewButton = useRef<HTMLButtonElement>(null);
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);
  const focusOnOpen = useRef<"heading" | "confirm" | null>(null);
  useEffect(() => {
    if (!reviewOpen) return;
    const target = focusOnOpen.current;
    focusOnOpen.current = null;
    if (target === "confirm") confirmRef.current?.focus();
    else if (target === "heading") reviewHeading.current?.focus();
  }, [reviewOpen]);
  const openReview = (focus: "heading" | "confirm") => {
    if (reviewOpen) {
      (focus === "confirm" ? confirmRef.current : reviewHeading.current)?.focus();
      return;
    }
    focusOnOpen.current = focus;
    setReviewOpen(true);
  };
  const closeReview = () => {
    setReviewOpen(false);
    reviewButton.current?.focus();
  };

  if (!snapshot || phase === "loading") {
    if (phase === "failed") {
      return (
        <Banner tone="danger" title={t("permissions.loadFailed")} action={<Button size="sm" onClick={reload}>{t("permissions.retry")}</Button>}>
          {loadError}
        </Banner>
      );
    }
    return (
      <div role="status" aria-busy="true" className="flex flex-col gap-3">
        <span className="sr-only">{t("permissions.loading")}</span>
        <Skeleton className="h-10" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const agentIds = snapshot.agents.map((agent) => agent.id);
  const pendingKeys = new Set(changes.map(changeKey));
  const failedNow = new Map([...failed].filter(([key]) => pendingKeys.has(key)));
  const shownAgents = agentsInClient(snapshot.agents, snapshot.clients, clientId);
  const visible = visibleSources(snapshot.sources, { query, types, hidden }, labelOf, sectionLabel);
  const typed = snapshot.sources.filter((source) => types.has(source.type));
  const skillCounts = new Map(agentIds.map((id) => [id, skillCount(desired.grants, snapshot.otherSkills, id)]));
  // Only agents whose skills this edit adds are held back: the limit is the backend's, per agent.
  const adding = new Set(changes.filter((c) => c.kind === "grant" && c.group === SKILLS_GROUP && c.grant).map((c) => c.agentId));
  const over = new Set(overSkillLimit(desired.grants, snapshot.otherSkills, agentIds).filter((id) => adding.has(id)));
  const raises = raisesToWrite(changes);
  const confirmed = raisesConfirmed(confirmedFor, raises);
  const tally = changeTally(changes);
  // An open source the filters now hide hands over to the first one shown while searching; a source the
  // person closed stays closed.
  const expandedShown = expanded === null ? null
    : visible.some((source) => source.id === expanded) ? expanded
      : query.trim() ? visible[0]?.id ?? null : null;
  const overNames = snapshot.agents.filter((agent) => over.has(agent.id)).map((agent) => agent.name);

  const view: MatrixView = {
    sources: visible,
    agents: shownAgents,
    saved: snapshot.saved,
    desired,
    locks: snapshot.locks,
    failed: new Set(failedNow.keys()),
    over,
    skillCounts,
    noTools: new Set(snapshot.agents.filter((agent) => !supportsToolGrants(agent.provider)).map((agent) => agent.id)),
    accounts: snapshot.accounts,
    disabled: saving,
    expanded: expandedShown,
    labelOf,
    sectionLabel,
    onExpand: setExpanded,
    onToggle: (keys) => setDesired((d) => ({ ...d, grants: toggleKeys(d.grants, keys) })),
    onLevel: (agentId: number, slug: string, level: Level) => setDesired((d) => ({ ...d, apps: setAppLevel(d.apps, agentId, slug, level) })),
    onAccount: (agentId, slug, accountId, allowed) => setDesired((d) => ({ ...d, apps: setAppAccount(d.apps, agentId, slug, accountId, allowed) })),
  };

  const discard = () => {
    setDesired(snapshot.saved);
    setFailed(new Map());
    setConfirmedFor(null);
    setReviewOpen(false);
    rootRef.current?.focus({ preventScroll: true });
  };

  const save = async () => {
    if (saving || !dirty || over.size > 0) return;
    if (raises.length > 0 && !confirmed) {
      openReview("confirm");
      return;
    }
    const current = snapshot;
    const pending = changes;
    setSaving(true);
    // A read still running from before this save is stale once the save writes; this save's own read wins.
    loadSeq.current += 1;
    try {
      const providerOf = (id: number) => current.agents.find((agent) => agent.id === id)?.provider ?? "";
      const result = await runSave(planSave(pending, desired, providerOf), saveDeps(current));
      const failedChanges = pending.filter((change) => result.failed.has(changeKey(change)));
      let fresh: Snapshot;
      try {
        fresh = await loadSnapshot();
      } catch {
        // The saves stand; without a fresh read, what saved is applied to what was there.
        fresh = { ...current, saved: reapply(current.saved, pending.filter((change) => !result.failed.has(changeKey(change)))) };
      }
      const kept = changesStillShown(failedChanges, fresh.sources, fresh.agents.map((agent) => agent.id));
      setSnapshot(fresh);
      setDesired(reapply(fresh.saved, kept));
      setFailed(new Map(kept.map((change) => [changeKey(change), saveErrorText(result.failed.get(changeKey(change)), t)])));
      setDropped(failedChanges.length - kept.length);
      if (failedChanges.length === 0) {
        toast(plural("permissions.saved", result.saved.length));
        setConfirmedFor(null);
        setReviewOpen(false);
        rootRef.current?.focus({ preventScroll: true });
      } else {
        setReviewOpen(true);
      }
    } finally {
      setSaving(false);
    }
  };

  const clearFilters = () => {
    setQuery("");
    setTypes(new Set(ALL_TYPES));
    setHidden(new Set());
    setClientId(null);
  };

  const hasToolSources = snapshot.sources.some((source) => source.kind === "server" || source.kind === "plugin");
  const hasApps = snapshot.sources.some((source) => source.kind === "apps");

  if (snapshot.agents.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<Users size={24} />}
          title={t("permissions.noAgents.title")}
          description={t("permissions.noAgents.body")}
          action={<LinkButton href="/agents/new/" variant="primary">{t("permissions.noAgents.create")}</LinkButton>}
        />
      </Card>
    );
  }

  return (
    <div ref={rootRef} className="@container flex flex-col gap-6 outline-none" data-setting-root data-setting-container tabIndex={-1}>
      {/* A neutral note with the design's 14 px sides. The design draws it blue, but blue means running (README rule 1). */}
      <Banner tone="info" className="px-3.5">{t("permissions.banner")}</Banner>
      {phase === "failed" ? (
        <Banner tone="danger" title={t("permissions.loadFailed")} action={<Button size="sm" disabled={saving} onClick={reload}>{t("permissions.retry")}</Button>}>
          {loadError}
        </Banner>
      ) : null}
      {snapshot.problems.map((problem) => (
        <Banner key={problem} tone="danger" title={t(`permissions.problem.${problem}`)} action={<Button size="sm" disabled={saving} onClick={reload}>{t("permissions.retry")}</Button>} />
      ))}
      {dropped > 0 ? <Banner tone="warning" onDismiss={() => setDropped(0)}>{plural("permissions.dropped", dropped)}</Banner> : null}

      <div className="flex flex-col gap-6 @3xl:flex-row @3xl:items-start">
        <FiltersPanel
          className="@3xl:w-[200px] @3xl:shrink-0"
          query={query}
          onQuery={setQuery}
          types={types}
          onTypes={setTypes}
          sources={typed}
          hidden={hidden}
          onHidden={setHidden}
          labelOf={labelOf}
          clients={snapshot.clients}
          clientId={clientId}
          onClient={setClientId}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          {shownAgents.length === 0 ? (
            <Card>
              <EmptyState icon={<Users size={24} />} title={t("permissions.noClientAgents.title")} description={t("permissions.noClientAgents.body")}
                action={<Button onClick={() => setClientId(null)}>{t("permissions.filters.allClients")}</Button>} />
            </Card>
          ) : visible.length === 0 ? (
            <Card>
              <EmptyState icon={<SearchX size={24} />} title={t("permissions.noMatch.title")} description={t("permissions.noMatch.body")}
                action={<Button onClick={clearFilters}>{t("permissions.noMatch.clear")}</Button>} />
            </Card>
          ) : wide ? (
            <MatrixGrid view={view} onRetry={reload} />
          ) : (
            <MatrixList view={view} onRetry={reload} />
          )}
          <SourceNotes notes={snapshot.notes} />
          {!hasToolSources && snapshot.notes.length === 0 && !snapshot.problems.includes("servers") && !snapshot.problems.includes("plugins") ? (
            <p className="text-small text-muted">
              {t("permissions.hint.noServers")}{" "}
              <Link href="/apps/?add=server" className="text-accent-text underline underline-offset-2">{t("permissions.hint.addServer")}</Link>
            </p>
          ) : null}
          {snapshot.appsNotSetUp && !hasApps ? (
            <p className="flex items-center gap-2 text-small text-muted">
              <KeyRound size={14} aria-hidden="true" className="shrink-0" />
              <span>
                {t("permissions.hint.noApps")}{" "}
                <Link href="/apps/" className="text-accent-text underline underline-offset-2">{t("permissions.notes.openApps")}</Link>
              </span>
            </p>
          ) : null}
        </div>
      </div>

      {dirty || saving ? (
        <div
          className="pointer-events-none sticky bottom-4 z-20 flex flex-col items-center gap-2 pb-[env(safe-area-inset-bottom)]"
          onKeyDown={(event) => { if (event.key === "Escape" && reviewOpen) { event.stopPropagation(); closeReview(); } }}
        >
          {reviewOpen ? (
            <ReviewSheet
              id={reviewId}
              changes={changes}
              failed={failedNow}
              agents={snapshot.agents}
              sources={snapshot.sources}
              labelOf={labelOf}
              over={over}
              raises={raises}
              confirmed={confirmed}
              onConfirm={(yes) => setConfirmedFor(yes ? raiseEntries(raises) : null)}
              confirmRef={confirmRef}
              headingRef={reviewHeading}
              onClose={closeReview}
            />
          ) : null}
          <ChangesBar
            ref={reviewButton}
            changes={tally.changes}
            agents={tally.agents}
            failed={failedNow.size}
            overLimit={overNames.length ? plural("permissions.bar.overLimit", overNames.length, { names: overNames.join(", "), max: MAX_AGENT_SKILLS }) : null}
            saving={saving}
            reviewOpen={reviewOpen}
            reviewId={reviewId}
            onDiscard={discard}
            onReview={() => (reviewOpen ? closeReview() : openReview("heading"))}
            onSave={() => void save()}
          />
        </div>
      ) : null}
    </div>
  );
}
