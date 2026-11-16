"use client";

// The Computer tab: the agent's own computer (create, start, stop, live view, limits, remove).
// Mounted only while the tab is open, so the live view and its control lease end when you leave.
import { useId } from "react";
import type { Agent, Engine } from "@/lib/api";
import { useT } from "@/lib/use-i18n";
import { ComputerView } from "@/components/chat/ComputerPanel";

export function ComputerTab({ agent, engines, onChanged }: { agent: Agent; engines: Engine[] | null; onChanged: () => void }) {
  const t = useT();
  const headingId = useId();
  const engine = engines?.find((item) => item.id === agent.provider);
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <div className="min-w-0">
        <h2 id={headingId} className="text-h3 font-semibold text-ink">{t("agentSettings.computer.title")}</h2>
        <p className="mt-0.5 text-small text-muted">{t("agentSettings.computer.subtitle", { name: agent.name })}</p>
      </div>
      <ComputerView
        agent={agent}
        onChanged={onChanged}
        engineSupportsComputers={engine?.capabilities.computers}
        engineLabel={engine?.label ?? agent.provider}
      />
    </section>
  );
}
