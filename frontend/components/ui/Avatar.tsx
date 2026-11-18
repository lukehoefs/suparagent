"use client";

import { MessageSquare, Monitor, MonitorOff } from "lucide-react";
import { cn } from "@/lib/cn";
import { identityVar, initialsOf } from "@/lib/identity";
import { useAgentPicture } from "./AvatarPictures";

// Two-letter initials, so the type sits a step smaller than the circle would suggest.
const SIZES = { xs: "size-5 text-[9px]", sm: "size-6 text-[10px]", md: "size-8 text-[12px]", row: "size-[34px] text-[12px]", lg: "size-11 text-[15px]", xl: "size-12 text-base" } as const;
const ICONS = { xs: 10, sm: 12, md: 16, row: 16, lg: 22, xl: 22 } as const;
// The computer badge (design: Main.html): 18 px on the grid's large faces, 16 px on smaller ones.
const BADGE = { xs: "size-4", sm: "size-4", md: "size-4", row: "size-4", lg: "size-[18px]", xl: "size-[18px]" } as const;
const BADGE_ICON = { xs: 10, sm: 10, md: 10, row: 10, lg: 12, xl: 12 } as const;

// What an agent is doing, as the bottom-right dot: blue working, amber (the amber line colour) waiting for you.
export type AvatarActivity = "working" | "waiting" | null;
// Its computer, as the bottom-left badge: a monitor, green while on, grey and slashed while off.
// null: it has none.
export type AvatarComputer = "on" | "off" | null;

// An agent's picture: the picture an admin uploaded or generated for it when it has one (see
// AvatarPictures.ts), else its initials on a colour derived from its id. With no agent (a plain
// chat) it shows a neutral chat glyph. Decorative: the name is always printed beside it, and the
// badges are restated in words (labels and status lines) wherever they appear. With
// `computerLabel` ("Computer on") the computer badge is an image with that name and hint.
export function Avatar({
  agentId,
  name,
  size = "md",
  activity = null,
  computer = null,
  computerLabel,
  className,
}: {
  agentId: number | null;
  name?: string | null;
  size?: keyof typeof SIZES;
  activity?: AvatarActivity;
  computer?: AvatarComputer;
  computerLabel?: string;
  className?: string;
}) {
  const picture = useAgentPicture(agentId);
  const base = "inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold";
  if (agentId === null) {
    return (
      <span aria-hidden="true" className={cn(base, "bg-inset text-muted", SIZES[size], className)}>
        <MessageSquare size={ICONS[size]} />
      </span>
    );
  }
  const own = !activity && !computer ? className : undefined;
  const face = picture ? (
    // A local object URL (the bytes sit behind the session), so next/image has nothing to optimise.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={picture} alt="" aria-hidden="true" draggable={false} className={cn("shrink-0 select-none rounded-full bg-inset object-cover", SIZES[size], own)} />
  ) : (
    <span aria-hidden="true" style={{ backgroundColor: identityVar(agentId) }} className={cn(base, "text-white", SIZES[size], own)}>
      {initialsOf(name)}
    </span>
  );
  if (!activity && !computer) return face;
  const labelled = Boolean(computer && computerLabel);
  return (
    <span aria-hidden={labelled ? undefined : "true"} className={cn("relative inline-flex shrink-0", className)}>
      {face}
      {activity && (
        <span
          aria-hidden="true"
          className={cn(
            "absolute -bottom-0.5 -right-0.5 size-3 rounded-full ring-2 ring-app",
            activity === "working" ? "animate-pulse bg-running" : "bg-warning-line",
          )}
        />
      )}
      {computer && (
        <span
          {...(labelled ? { role: "img", "aria-label": computerLabel, title: computerLabel } : {})}
          className={cn(
            "absolute -bottom-1 -left-1 inline-flex items-center justify-center rounded-full bg-app",
            BADGE[size],
            computer === "on" ? "text-success" : "text-faint",
          )}
        >
          {computer === "on"
            ? <Monitor size={BADGE_ICON[size]} strokeWidth={1.9} aria-hidden="true" />
            : <MonitorOff size={BADGE_ICON[size]} strokeWidth={1.9} aria-hidden="true" />}
        </span>
      )}
    </span>
  );
}
