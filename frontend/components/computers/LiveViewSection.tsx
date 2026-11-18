"use client";

// The live view under the Computers grid (design: Computers.html): Watching or You have control,
// Hand back to agent while in control, Save picture, Full screen. Watching opens a view-only
// stream; taking control asks the backend first, then reconnects in control mode.
import { Camera, Maximize2, Minimize2, Monitor, Info, X } from "lucide-react";
import { forwardRef, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { handBack, remoteFailureKey, takeControl, viewerMode, type ChangeClock, type RemoteComputer, type ViewerMode } from "@/lib/remote-computers";
import { useT } from "@/lib/use-i18n";
import { Avatar } from "@/components/ui/Avatar";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Input } from "@/components/ui/Input";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { useToast } from "@/components/ui/Toast";
import { RemoteScreen } from "./RemoteScreen";
import { savePicture } from "./save-picture";
import { useFullscreen } from "./useFullscreen";
import { useRemoteViewer } from "./useRemoteViewer";

export const LiveViewSection = forwardRef<HTMLHeadingElement, {
  computer: RemoteComputer;
  // Runs take control and hand back, so the page's list reads are ordered against them.
  change: ChangeClock["change"];
  onChange: (computer: RemoteComputer) => void;
  // Read the list again: control may have been handed back somewhere else.
  onRefresh: () => void;
  onClose: () => void;
}>(function LiveViewSection({ computer, change, onChange, onRefresh, onClose }, heading) {
  const t = useT();
  const toast = useToast();
  const mode = viewerMode(computer);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const viewer = useRemoteViewer({ computerId: computer.id, mode, enabled: computer.live_view, onControlLost: onRefresh });
  const screen = useRef<HTMLDivElement>(null);
  const fullscreen = useFullscreen(screen);
  const agent = computer.agent_id !== null ? computer.agent_name ?? t("computers.card.agentFallback", { id: computer.agent_id }) : null;
  const inControl = mode === "control";
  const online = computer.state === "online";

  const switchMode = async (next: ViewerMode) => {
    if (next === mode || busy) return;
    setBusy(true);
    setError(null);
    try {
      onChange(await change(() => (next === "control" ? takeControl(computer.id) : handBack(computer.id))));
    } catch (err) {
      setError(t(remoteFailureKey(err)));
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    const saved = await savePicture(computer, viewer.status === "live" ? viewer.canvasRef.current : null);
    if (!saved) toast(t("computers.live.saveFailed"), "danger");
  };

  const label = inControl ? t("computers.live.canvasControl", { name: computer.name }) : t("computers.live.canvasWatching", { name: computer.name });

  return (
    <section aria-label={t("computers.live.label", { name: computer.name })} className="overflow-hidden rounded-card border border-line bg-raised">
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-3.5 py-2.5">
        <h2 ref={heading} tabIndex={-1} className="flex min-w-0 items-center gap-2 font-medium text-ink focus-visible:outline-none">
          {computer.agent_id !== null ? (
            <Avatar agentId={computer.agent_id} name={agent} size="sm" />
          ) : (
            <span aria-hidden="true" className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-inset text-faint"><Monitor size={12} /></span>
          )}
          <span className="truncate">{computer.name}</span>
        </h2>
        {/* Only while it answers: an offline computer can be handed back, not taken. */}
        {online && (
          <SegmentedControl<ViewerMode>
            label={t("computers.live.mode")}
            value={mode}
            onChange={(next) => void switchMode(next)}
            options={[{ value: "view", label: t("computers.live.watching") }, { value: "control", label: t("computers.live.control") }]}
            className={cn(busy && "pointer-events-none opacity-60")}
          />
        )}
        <span className="ml-auto inline-flex flex-wrap items-center gap-1">
          {inControl && <Button variant="primary" loading={busy} onClick={() => void switchMode("view")}>{t("computers.live.handBack")}</Button>}
          <IconButton label={t("computers.live.save")} disabled={!online} onClick={() => void save()}><Camera size={16} aria-hidden="true" /></IconButton>
          <IconButton label={t("computers.live.fullscreen")} disabled={!computer.live_view} onClick={fullscreen.toggle}><Maximize2 size={16} aria-hidden="true" /></IconButton>
          <IconButton label={t("computers.live.close")} onClick={onClose}><X size={16} aria-hidden="true" /></IconButton>
        </span>
      </div>
      {inControl && (
        <p role="status" className="flex items-center gap-2 bg-warning-bg px-3.5 py-2.5 text-label font-medium text-warning-on">
          <Info size={15} aria-hidden="true" className="shrink-0" />
          {agent ? t("computers.live.paused", { agent }) : t("computers.live.pausedNoAgent")}
        </p>
      )}
      {error && <Banner tone="danger" className="m-4 mb-0" onDismiss={() => setError(null)}>{error}</Banner>}
      <div className="flex flex-col gap-3 p-4">
        <div
          ref={screen}
          className={cn("flex flex-col", fullscreen.active && "gap-2 bg-app p-3", fullscreen.overlay && "fixed inset-0 z-50")}
        >
          {fullscreen.active && (
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-label font-medium text-ink">{computer.name}</span>
              <IconButton label={t("computers.live.exitFullscreen")} onClick={fullscreen.exit}><Minimize2 size={16} aria-hidden="true" /></IconButton>
            </div>
          )}
          <RemoteScreen
            computer={computer}
            viewer={viewer}
            interactive={inControl}
            label={label}
            className={fullscreen.active ? "min-h-0 flex-1" : "aspect-[4/3] w-full sm:aspect-auto sm:h-[460px] sm:max-h-[70vh]"}
          />
        </div>
        {inControl && viewer.status === "live" && (
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(event) => { event.preventDefault(); if (text) { viewer.client.current?.text(text); setText(""); } }}
          >
            <Input aria-label={t("computers.live.typeLabel")} maxLength={2000} value={text} onChange={(event) => setText(event.target.value)} className="min-w-0 flex-1" />
            <Button type="submit" disabled={!text}>{t("computers.live.type")}</Button>
          </form>
        )}
      </div>
    </section>
  );
});
