"use client";

// Pieces every cloud computer view shares: the status pill, the neutral placeholder, and the
// screen itself (the live view when there is one, else the last picture or the placeholder).
import { Monitor, MonitorOff } from "lucide-react";
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

// No picture: a quiet box that says why, never a made-up desktop.
export function ScreenPlaceholder({ state, children }: { state: RemoteComputerState; children?: ReactNode }) {
  const t = useT();
  const Icon = state === "online" ? Monitor : MonitorOff;
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-inset p-4 text-center text-small text-muted">
      <Icon size={22} aria-hidden="true" className="text-faint" />
      <span>{t(pictureKey(state))}</span>
      {children}
    </div>
  );
}

type Viewer = ReturnType<typeof useRemoteViewer>;

// The live view inside `className`'s box: the canvas fills it (letterboxed), and while it is not
// showing a picture a small floating note says so. Without a live view: `picture` or the placeholder.
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
    return (
      <div className={cn("relative overflow-hidden rounded-field border border-line bg-inset", className)} style={style}>
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
        interactive={interactive && viewer.status === "live"}
        label={label}
        className={cn("absolute inset-0 h-full w-full", broken && still && "invisible")}
      />
      {viewer.status !== "live" && (
        <div className="absolute inset-0 flex items-center justify-center p-3">
          <div role="status" className="flex max-w-full flex-col items-center gap-2 rounded-card bg-raised px-4 py-3 text-center text-small text-ink shadow-float">
            {broken ? (
              <>
                <span>{t(viewer.status === "lost" ? "computers.live.lost" : "computers.live.failed")}</span>
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
