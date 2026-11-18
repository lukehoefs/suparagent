"use client";

import { Check, Info, LoaderCircle, TriangleAlert, X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/use-i18n";

// Colour means status only: danger = denied or failed, warning = needs you or degraded (offline),
// success = done, running = working. info is a neutral note and carries no status colour.
export type BannerTone = "info" | "success" | "warning" | "danger" | "running";

type ToneStyle = {
  // The box: an error is a resting card (full red hairline on the surface, no fill); the other
  // tones are a filled note with no border (design: States, "Anywhere: offline", "already answered").
  box: string;
  icon: string;
  // The first line when there is a title, and the lone line when there is none.
  title: string;
  lone: string;
  // The detail under a title.
  body: string;
  Icon: typeof Info;
  spin?: boolean;
};

const TONES: Record<BannerTone, ToneStyle> = {
  danger: {
    box: "gap-2.5 rounded-card border border-danger bg-raised px-4 py-3.5 text-body text-ink",
    icon: "text-danger",
    title: "font-medium text-danger",
    // A message on its own is usually the server's detail, so it reads in ink beside the red icon.
    lone: "",
    body: "text-label text-muted",
    Icon: TriangleAlert,
  },
  warning: {
    box: "gap-2 rounded-field bg-warning-bg px-3.5 py-2.5 text-label text-warning-on",
    icon: "",
    title: "font-medium",
    lone: "font-medium",
    body: "",
    Icon: Info,
  },
  success: {
    box: "gap-2 rounded-field bg-success-bg px-3.5 py-2.5 text-label text-success-on",
    icon: "",
    title: "font-medium",
    lone: "font-medium",
    body: "",
    Icon: Check,
  },
  running: {
    box: "gap-2 rounded-field bg-running-bg px-3.5 py-2.5 text-label text-running-on",
    icon: "",
    title: "font-medium",
    lone: "font-medium",
    body: "",
    Icon: LoaderCircle,
    spin: true,
  },
  info: {
    box: "gap-2 rounded-field bg-inset px-3 py-2.5 text-label text-muted",
    icon: "",
    title: "font-medium text-ink",
    lone: "",
    body: "",
    Icon: Info,
  },
};

// An inline notice. Danger and warning announce themselves (role=alert); the rest are polite status.
// With a title, the title sits beside the icon and the children go underneath; without one, the
// children are the line beside the icon. Actions sit on their own row, start-aligned.
export function Banner({
  tone = "info",
  title,
  children,
  action,
  onDismiss,
  icon,
  className,
}: {
  tone?: BannerTone;
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
  onDismiss?: () => void;
  // Replaces the tone's icon (for example a tick on "Allowed on another device"); null hides it.
  icon?: ReactNode;
  className?: string;
}) {
  const t = useT();
  const style = TONES[tone];
  const { Icon } = style;
  const head = title ? title : children;
  const shownIcon = icon === undefined
    ? <Icon size={tone === "danger" ? 16 : 15} strokeWidth={1.7} className={cn(style.spin && "animate-spin")} />
    : icon;
  return (
    <div role={tone === "danger" || tone === "warning" ? "alert" : "status"} className={cn("flex flex-col", style.box, className)}>
      <div className="flex items-start gap-2">
        {/* One line tall, so the icon centres on the first line however the text wraps. */}
        {shownIcon !== null ? <span aria-hidden="true" className={cn("flex h-[1lh] shrink-0 items-center", style.icon)}>{shownIcon}</span> : null}
        <div className={cn("min-w-0 flex-1 break-words", title ? style.title : style.lone)}>{head}</div>
        {onDismiss ? (
          <button
            type="button"
            onClick={onDismiss}
            aria-label={t("common.close")}
            className={cn(
              "-my-1.5 -mr-1.5 inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-field transition-colors duration-(--dur-fast) hover:bg-current/10 touch:-my-2.5 touch:-mr-2.5 touch:size-11",
              tone === "danger" || tone === "info" ? "text-muted hover:text-ink" : "text-current",
            )}
          >
            <X size={14} aria-hidden="true" />
          </button>
        ) : null}
      </div>
      {title && children ? <div className={cn("min-w-0 break-words", style.body)}>{children}</div> : null}
      {action ? <div className="flex flex-wrap items-center gap-2">{action}</div> : null}
    </div>
  );
}
