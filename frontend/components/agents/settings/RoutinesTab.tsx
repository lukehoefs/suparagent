"use client";

// The Routines tab (admin only): what the agent does on its own. Its routines (state, last run,
// Pause/Resume and Run now; editing and creating stay in the Routines view), the commands always
// allowed for it, and the rooms it is in with the Hold switch. Nothing here is a draft: every
// control saves at once, so the tab reports no unsaved work.
import type { Agent } from "@/lib/api";
import { AgentRoomsSection } from "./routines/AgentRoomsSection";
import { AgentRoutinesSection } from "./routines/AgentRoutinesSection";
import { AlwaysAllowedSection } from "./routines/AlwaysAllowedSection";

export function RoutinesTab({ agent }: { agent: Agent }) {
  return (
    <div className="flex flex-col gap-10">
      <AgentRoutinesSection agent={agent} />
      <AlwaysAllowedSection agent={agent} />
      <AgentRoomsSection agent={agent} />
    </div>
  );
}
