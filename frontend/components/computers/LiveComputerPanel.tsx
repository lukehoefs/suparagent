"use client";

// The chat page's right-hand "Live computer" panel (design: Chat.html): the agent's cloud computer,
// watched live (or its last picture when the live view cannot be shown), its status, and Take
// control, which pauses the agent and turns the same view into control until you hand back.
// Renders nothing when the agent has no cloud computer. `onControlChange` hears whether a person
// holds the computer, so the chat can still say so (and offer Hand back) once the panel is hidden.
import Link from "next/link";
import { Info, Maximize2, Minimize2, Monitor, PanelRight } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import {
  checkRemoteComputer,
  computerForAgent,
  createChangeClock,
  handBack,
  listRemoteComputers,
  MCP_SERVERS_HREF,
  remoteComputersUnsupported,
  remoteFailureKey,
  takeControl,
  viewerMode,
  type ChangeClock,
  type RemoteComputer,
} from "@/lib/remote-computers";
import { useT } from "@/lib/use-i18n";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Skeleton } from "@/components/ui/Skeleton";
import { RemoteScreen, RemoteStatusPill } from "./RemoteScreen";
import { useFullscreen } from "./useFullscreen";
import { useRemoteScreenshot } from "./useRemoteScreenshot";
import { useRemoteViewer } from "./useRemoteViewer";

const LIST_EVERY_MS = 30_000;
const FRAME = "flex w-[360px] max-w-full shrink-0 flex-col gap-3.5 overflow-y-auto border-l border-line bg-app p-5";

export function LiveComputerPanel({
  agentId,
  agentName,
  onClose,
  onControlChange,
  className,
}: {
  agentId: number;
  agentName: string;
  onClose: () => void;
  onControlChange?: (held: boolean) => void;
  className?: string;
}) {
  const t = useT();
  // undefined while loading; null when the agent has no cloud computer (or this server has none).
  const [computer, setComputer] = useState<RemoteComputer | null | undefined>(undefined);
  const [loadFailed, setLoadFailed] = useState(false);
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((n) => n + 1), []);
  // A list read that overlaps Take control or Hand back is dropped: it may carry the state from before.
  const [clock] = useState(createChangeClock);
  const held = computer ? computer.human_control : null;
  const heard = useRef(onControlChange);
  useEffect(() => { heard.current = onControlChange; }, [onControlChange]);
  useEffect(() => { if (held !== null) heard.current?.(held); }, [held]);

  useEffect(() => {
    let alive = true;
    const read = () => {
      if (document.hidden) return;
      const stamp = clock.stamp();
      listRemoteComputers()
        .then((list) => { if (alive && clock.current(stamp)) { setComputer(computerForAgent(list, agentId)); setLoadFailed(false); } })
        .catch((err: unknown) => {
          if (!alive) return;
          if (remoteComputersUnsupported(err)) setComputer(null);
          else setLoadFailed(true);
        });
    };
    read();
    const timer = window.setInterval(read, LIST_EVERY_MS);
    document.addEventListener("visibilitychange", read);
    return () => { alive = false; window.clearInterval(timer); document.removeEventListener("visibilitychange", read); };
  }, [agentId, tick, clock]);

  if (computer === null) return null;

  const header = (extra?: ReactNode) => (
    <div className="flex items-center justify-between gap-2">
      <h2 className="text-label font-semibold text-ink">{t("computers.panel.title")}</h2>
      <span className="inline-flex items-center gap-1">
        {extra}
        <IconButton label={t("computers.panel.hide")} onClick={onClose}><PanelRight size={16} strokeWidth={1.7} aria-hidden="true" /></IconButton>
      </span>
    </div>
  );

  if (computer === undefined) {
    return (
      <aside aria-label={t("computers.panel.title")} className={cn(FRAME, className)}>
        {header()}
        {loadFailed ? (
          <Banner tone="danger" action={<Button size="sm" onClick={refresh}>{t("computers.retry")}</Button>}>{t("computers.panel.loadFailed")}</Banner>
        ) : (
          <div role="status" className="flex flex-col gap-3.5">
            <span className="sr-only">{t("computers.loading")}</span>
            <Skeleton className="aspect-[16/10] w-full rounded-field" />
            <Skeleton className="h-6 w-32 rounded-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        )}
      </aside>
    );
  }

  return <Loaded key={computer.id} computer={computer} agentName={agentName} className={className} header={header} clock={clock} onChange={setComputer} onRefresh={refresh} />;
}

function Loaded({
  computer,
  agentName,
  className,
  header,
  clock,
  onChange,
  onRefresh,
}: {
  computer: RemoteComputer;
  agentName: string;
  className?: string;
  header: (extra?: ReactNode) => ReactNode;
  clock: ChangeClock;
  onChange: (computer: RemoteComputer) => void;
  onRefresh: () => void;
}) {
  const t = useT();
  const mode = viewerMode(computer);
  const inControl = mode === "control";
  const online = computer.state === "online";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const viewer = useRemoteViewer({ computerId: computer.id, mode, enabled: computer.live_view, onControlLost: onRefresh });
  const broken = viewer.status === "failed" || viewer.status === "lost";
  // The last picture stands in while the live view cannot be shown.
  const picture = useRemoteScreenshot(computer.id, online && (!computer.live_view || broken));
  const screen = useRef<HTMLDivElement>(null);
  const fullscreen = useFullscreen(screen);

  const run = async (work: () => Promise<RemoteComputer>) => {
    setBusy(true);
    setError(null);
    try { onChange(await clock.change(work)); }
    catch (err) { setError(t(remoteFailureKey(err))); }
    finally { setBusy(false); }
  };

  const label = inControl ? t("computers.live.canvasControl", { name: computer.name }) : t("computers.live.canvasWatching", { name: computer.name });
  const fullscreenButton = computer.live_view && !fullscreen.active
    ? <IconButton label={t("computers.live.fullscreen")} onClick={fullscreen.toggle}><Maximize2 size={16} strokeWidth={1.7} aria-hidden="true" /></IconButton>
    : null;

  return (
    <aside aria-label={t("computers.panel.title")} className={cn(FRAME, className)}>
      {header(fullscreenButton)}
      <div ref={screen} className={cn("flex flex-col", fullscreen.active && "gap-2 bg-app p-3", fullscreen.overlay && "fixed inset-0 z-50")}>
        {fullscreen.active && (
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-label font-medium text-ink">{computer.name}</span>
            <IconButton label={t("computers.live.exitFullscreen")} onClick={fullscreen.exit}><Minimize2 size={16} strokeWidth={1.7} aria-hidden="true" /></IconButton>
          </div>
        )}
        <RemoteScreen
          computer={computer}
          viewer={viewer}
          interactive={inControl}
          label={label}
          picture={picture}
          className={fullscreen.active ? "min-h-0 flex-1" : "w-full"}
          style={fullscreen.active ? undefined : { aspectRatio: viewer.frame ? `${viewer.frame.width} / ${viewer.frame.height}` : "16 / 10" }}
        />
      </div>
      <div className="flex items-center justify-between gap-2">
        <RemoteStatusPill state={computer.state} />
        <span className="truncate text-small text-muted" title={computer.name}>{computer.name}</span>
      </div>
      {computer.state === "needs_key" && (
        <p className="text-small text-muted">
          {t("computers.card.needsKeyHint")}{" "}
          <Link href={MCP_SERVERS_HREF} className="text-accent-text underline underline-offset-2 hover:opacity-80">{t("computers.card.addKey")}</Link>
        </p>
      )}
      {computer.state === "offline" && (
        // -ml-3 cancels the ghost button's padding, so its label lines up with the pill and the note.
        <Button variant="ghost" className="-ml-3 self-start text-muted hover:text-ink" loading={busy} onClick={() => void run(() => checkRemoteComputer(computer.id))}>
          {t("computers.panel.checkAgain")}
        </Button>
      )}
      {error && <Banner tone="danger" onDismiss={() => setError(null)}>{error}</Banner>}
      {inControl ? (
        <>
          <Button icon={<Monitor size={15} strokeWidth={1.7} aria-hidden="true" />} loading={busy} onClick={() => void run(() => handBack(computer.id))}>
            {t("computers.live.handBack")}
          </Button>
          <p role="status" className="flex items-start gap-2 rounded-field bg-warning-bg px-3 py-2 text-small font-medium text-warning-on">
            <Info size={14} strokeWidth={1.7} aria-hidden="true" className="mt-0.5 shrink-0" />
            {t("computers.live.paused", { agent: agentName })}
          </p>
        </>
      ) : (
        <>
          <Button icon={<Monitor size={15} strokeWidth={1.7} aria-hidden="true" />} loading={busy} disabled={!computer.live_view} onClick={() => void run(() => takeControl(computer.id))}>
            {t("computers.card.takeControl")}
          </Button>
          <p className="text-small text-muted">{t("computers.panel.note", { agent: agentName })}</p>
        </>
      )}
    </aside>
  );
}
