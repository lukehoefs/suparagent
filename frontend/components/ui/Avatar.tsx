"use client";

import { MessageSquare, Monitor, MonitorOff } from "lucide-react";
import { cn } from "@/lib/cn";
import { identityVar, initialsOf } from "@/lib/identity";
import { useAgentPicture } from "./AvatarPictures";

// Two-letter initials, so the type sits a step smaller than the circle would suggest.
// xxs is the 16 px face on a meta line (Results); xl the 48 px faces in the pinned grid and trays.
const SIZES = { xxs: "size-4 text-[10px]", xs: "size-5 text-[9px]", sm: "size-6 text-[10px]", md: "size-8 text-[12px]", row: "size-[34px] text-[12px]", lg: "size-11 text-[15px]", xl: "size-12 text-[18px]" } as const;
const ICONS = { xxs: 9, xs: 10, sm: 12, md: 16, row: 16, lg: 22, xl: 22 } as const;
// The computer badge (design: Main.html): 18 px on the grid's large faces, 16 px on smaller ones.
const BADGE = { xxs: "size-4", xs: "size-4", sm: "size-4", md: "size-4", row: "size-4", lg: "size-[18px]", xl: "size-[18px]" } as const;
const BADGE_ICON = { xxs: 10, xs: 10, sm: 10, md: 10, row: 10, lg: 12, xl: 12 } as const;

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
// `edge` is the colour the avatar sits on, which the badge's disc and the dot's ring take so they
// look cut out of it: the sidebar ("app"), a selected row or open group tray ("hover"), or the
// phone menu sheet ("surface").
export function Avatar({
  agentId,
  name,
  size = "md",
  activity = null,
  computer = null,
  computerLabel,
  edge = "app",
  className,
}: {
  agentId: number | null;
  name?: string | null;
  size?: keyof typeof SIZES;
  activity?: AvatarActivity;
  computer?: AvatarComputer;
  computerLabel?: string;
  edge?: "app" | "hover" | "surface";
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
  // The dot is 12 px in all: an 8 px fill inside a 2 px border in the edge colour (design: Main.html).
  const edgeBorder = edge === "hover" ? "border-hover" : edge === "surface" ? "border-surface" : "border-app";
  const edgeFill = edge === "hover" ? "bg-hover" : edge === "surface" ? "bg-surface" : "bg-app";
  return (
    <span aria-hidden={labelled ? undefined : "true"} className={cn("relative inline-flex shrink-0", className)}>
      {face}
      {activity && (
        <span
          aria-hidden="true"
          className={cn(
            "absolute bottom-0 right-0 box-border size-3 rounded-full border-2",
            edgeBorder,
            activity === "working" ? "animate-pulse bg-running" : "bg-warning-line",
          )}
        />
      )}
      {computer && (
        <span
          {...(labelled ? { role: "img", "aria-label": computerLabel, title: computerLabel } : {})}
          className={cn(
            "absolute -bottom-1 -left-1 inline-flex items-center justify-center rounded-full",
            edgeFill,
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
