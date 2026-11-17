"use client";

import { Avatar } from "@/components/ui/Avatar";

// An agent's picture: its picture when it has one, else the letter avatar. Read through the page's
// one picture store (components/ui/AvatarPictures.ts), so it changes with every other avatar of
// the agent when a picture is set or removed.
export function AgentImage({ agentId, name, size = "md" }: { agentId: number; name: string; size?: "sm" | "md" | "lg" }) {
  return <Avatar agentId={agentId} name={name} size={size} />;
}
