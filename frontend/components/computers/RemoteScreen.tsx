"use client";

// Pieces every cloud computer view shares: the status pill, the neutral placeholder, and the
// screen itself (the live view when there is one, else the last picture or the placeholder).
import { Monitor } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { pictureKey, remoteComputerStatus, remoteStateKey, type RemoteComputer, type RemoteComputerState } from "@/lib/remote-computers";
import { useT } from "@/lib/use-i18n";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { StatusPill } from "@/components/ui/StatusPill";
import { RfbCanvas } from "./RfbCanvas";
import type { useRemoteViewer } from "./useRemoteViewer";

export function RemoteStatusPill({ state, className }: { state: RemoteComputerState; className?: string }) {
  const t = useT();
  return <StatusPill status={remoteComputerStatus(state)} className={className}>{t(remoteStateKey(state))}</StatusPill>;
}

// No picture: a quiet box that says why, never a made-up desktop (design: States, "Computer:
// stopped": a plain block on the selection grey with a 28 px monitor, no frame). The line under the
// monitor is the reason, so it is there for everyone, not only a screen reader.
export function ScreenPlaceholder({ state, children }: { state: RemoteComputerState; children?: ReactNode }) {
  const t = useT();
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-hover p-4 text-center text-small text-muted">
      <Monitor size={28} strokeWidth={1.7} aria-hidden="true" />
      <span>{t(pictureKey(state))}</span>
      {children}
    </div>
  );
}

type Viewer = ReturnType<typeof useRemoteViewer>;

// The live view inside `className`'s box: the canvas fills it (letterboxed), and while it is not
// showing a picture a small floating note says so (and why, when the backend said). In control the
// canvas keeps its focus and every key while the stream reconnects, so typing meant for the desktop
// never lands on the page. Without a live view: `picture` or the placeholder.
export function RemoteScreen({
  computer,
  viewer,
  interactive,
  label,
  picture,
  className,
  style,
}: {
  computer: Pick<RemoteComputer, "state" | "live_view" | "name">;
  viewer: Viewer;
  interactive: boolean;
  label: string;
  // A screenshot to show when the live view is not available or failed.
  picture?: string | null;
  className?: string;
  style?: CSSProperties;
}) {
  const t = useT();
  const still = picture ? (
    // A local object URL (the bytes sit behind the session), so next/image has nothing to optimise.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={picture} alt={label} className="absolute inset-0 h-full w-full object-contain" />
  ) : null;
  if (!computer.live_view) {
    // A picture keeps its hairline frame; the placeholder is a plain block (ScreenPlaceholder).
    return (
      <div className={cn("relative overflow-hidden rounded-field", still ? "border border-line bg-inset" : "bg-hover", className)} style={style}>
        {still ?? <ScreenPlaceholder state={computer.state} />}
      </div>
    );
  }
  const broken = viewer.status === "failed" || viewer.status === "lost";
  return (
    <div className={cn("relative overflow-hidden rounded-field border border-line bg-black", className)} style={style}>
      {broken && still}
      <RfbCanvas
        canvasRef={viewer.canvasRef}
        client={viewer.client}
        interactive={interactive}
        sending={viewer.status === "live"}
        label={label}
        className={cn("absolute inset-0 h-full w-full", broken && still && "invisible")}
      />
      {viewer.status !== "live" && (
        <div className="absolute inset-0 flex items-center justify-center p-3">
          <div role="status" className="flex max-w-full flex-col items-center gap-2 rounded-card bg-raised px-4 py-3 text-center text-small text-ink shadow-float">
            {broken ? (
              <>
                <span>{t(viewer.status === "lost" ? "computers.live.lost" : "computers.live.failed")}</span>
                {viewer.reason && <span className="text-muted">{t(viewer.reason)}</span>}
                <Button size="sm" onClick={viewer.reconnect}>{t("computers.live.reconnect")}</Button>
              </>
            ) : (
              <span className="inline-flex items-center gap-2">
                <Spinner size={14} label="" />
                {t("computers.live.connecting")}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
