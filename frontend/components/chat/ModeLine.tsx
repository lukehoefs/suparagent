"use client";

// The one line under the chat header that says how the agent works (design: Chat.html):
// "Conversational: Atlas talks through the plan and asks a question or two before major tool calls."
// It is a status region, so a switch of mode is read out.
import type { Agent } from "@/lib/api";
import { modeLine, modeOf } from "@/lib/agent-mode";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/use-i18n";
import { ModeIcon } from "./ModeSwitch";

export function ModeLine({ agent, className }: { agent: Pick<Agent, "name" | "conversational_mode">; className?: string }) {
  const t = useT();
  return (
    <p
      role="status"
      className={cn("flex items-center gap-2 border-b border-line bg-surface px-3 py-2 text-small text-muted sm:px-6", className)}
    >
      <ModeIcon mode={modeOf(agent)} />
      <span className="min-w-0">{modeLine(t, agent)}</span>
    </p>
  );
}
