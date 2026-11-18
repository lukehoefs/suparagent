"use client";

// The Computer tab: the cloud computer the agent works on (link or unlink one; they are added on
// the Computers page), then the computers this install makes itself (create, start, stop, live
// view, limits, remove) where it offers them (lib/computers.ts localComputerSection).
// Mounted only while the tab is open, so the live views and the control lease end when you leave.
import { useEffect, useId, useState } from "react";
import { api, ApiError, type Agent, type ComputerHealth, type Engine } from "@/lib/api";
import { computersUnsupported, localComputerSection } from "@/lib/computers";
import { useT } from "@/lib/use-i18n";
import { ComputerView } from "@/components/chat/ComputerPanel";
import { CloudComputerSection } from "@/components/computers/CloudComputerSection";

export function ComputerTab({ agent, engines, onChanged }: { agent: Agent; engines: Engine[] | null; onChanged: () => void }) {
  const t = useT();
  const headingId = useId();
  const localHeadingId = useId();
  const engine = engines?.find((item) => item.id === agent.provider);
  // undefined while the health check runs.
  const [health, setHealth] = useState<ComputerHealth | "unsupported" | "unknown" | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    api.computersHealth()
      .then((value) => { if (alive) setHealth(value); })
      .catch((err: unknown) => {
        if (!alive) return;
        setHealth(err instanceof ApiError && computersUnsupported(err.status, err.code) ? "unsupported" : "unknown");
      });
    return () => { alive = false; };
  }, []);

  const hasComputer = agent.computer_id != null || agent.computer != null;
  const local = health === undefined ? null : localComputerSection(health, hasComputer);

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-6">
      <div className="min-w-0">
        <h2 id={headingId} className="text-h3 font-semibold text-ink">{t("agentSettings.computer.title")}</h2>
        <p className="mt-0.5 text-small text-muted">{t("agentSettings.computer.subtitle", { name: agent.name })}</p>
      </div>
      <CloudComputerSection agent={agent} onChanged={onChanged} />
      {local && (
        <section aria-labelledby={localHeadingId} className="flex flex-col gap-3 border-t border-line pt-5">
          <h3 id={localHeadingId} className="text-body font-semibold text-ink">
            {t(local === "browser" ? "computers.settings.browserTitle" : "computers.settings.localTitle")}
          </h3>
          <ComputerView
            agent={agent}
            onChanged={onChanged}
            engineSupportsComputers={engine?.capabilities.computers}
            engineLabel={engine?.label ?? agent.provider}
          />
        </section>
      )}
    </section>
  );
}
