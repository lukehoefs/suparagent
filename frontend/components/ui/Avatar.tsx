"use client";

import { MessageSquare, Monitor, MonitorOff } from "lucide-react";
import { cn } from "@/lib/cn";
import { identityVar, initialsOf } from "@/lib/identity";
import { useAgentPicture } from "./AvatarPictures";

// Two-letter initials, so the type sits a step smaller than the circle would suggest.
const SIZES = { xs: "size-5 text-[9px]", sm: "size-6 text-[10px]", md: "size-8 text-[12px]", row: "size-[34px] text-[12px]", lg: "size-11 text-[15px]", xl: "size-12 text-base" } as const;
const ICONS = { xs: 10, sm: 12, md: 16, row: 16, lg: 22, xl: 22 } as const;

// What an agent is doing, as the bottom-right dot: blue working, amber waiting for you.
export type AvatarActivity = "working" | "waiting" | null;
// Its computer, as the bottom-left badge: on (green) or off (grey, slashed). null: it has none.
export type AvatarComputer = "on" | "off" | null;

// An agent's picture: the picture an admin uploaded or generated for it when it has one (see
// AvatarPictures.ts), else its initials on a colour derived from its id. With no agent (a plain
// chat) it shows a neutral chat glyph. Decorative: the name is always printed beside it, and the
// badges are restated in words (labels and status lines) wherever they appear.
export function Avatar({
  agentId,
  name,
  size = "md",
  activity = null,
  computer = null,
  className,
}: {
  agentId: number | null;
  name?: string | null;
  size?: keyof typeof SIZES;
  activity?: AvatarActivity;
  computer?: AvatarComputer;
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
  return (
    <span aria-hidden="true" className={cn("relative inline-flex shrink-0", className)}>
      {face}
      {activity && (
        <span
          className={cn(
            "absolute -bottom-0.5 -right-0.5 size-3 rounded-full ring-2 ring-app",
            activity === "working" ? "animate-pulse bg-running" : "bg-warning",
          )}
        />
      )}
      {computer && (
        <span
          className={cn(
            "absolute -bottom-1 -left-1 inline-flex size-4 items-center justify-center rounded-full ring-2 ring-app",
            computer === "on" ? "bg-success-bg text-success-on" : "bg-hover text-faint",
          )}
        >
          {computer === "on" ? <Monitor size={9} strokeWidth={2.2} /> : <MonitorOff size={9} strokeWidth={2.2} />}
        </span>
      )}
    </span>
  );
}
