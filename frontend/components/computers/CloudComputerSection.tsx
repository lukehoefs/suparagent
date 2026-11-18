"use client";

// Agent settings, Computer tab: which cloud computer the agent works on, and linking or unlinking
// one. The computers themselves are added and removed on the Computers page.
import { Monitor } from "lucide-react";
import { useCallback, useEffect, useId, useState } from "react";
import type { Agent } from "@/lib/api";
import {
  computerForAgent,
  COMPUTERS_HREF,
  freeComputers,
  isLinkConflict,
  listRemoteComputers,
  remoteComputersUnsupported,
  replaceComputer,
  updateRemoteComputer,
  type RemoteComputer,
} from "@/lib/remote-computers";
import { useT } from "@/lib/use-i18n";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Input";
import { LinkButton } from "@/components/ui/LinkButton";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatusText } from "@/components/ui/StatusPill";
import { Card } from "@/components/ui/Surface";
import { RemoteStatusPill } from "./RemoteScreen";

export function CloudComputerSection({ agent, onChanged }: { agent: Agent; onChanged: () => void }) {
  const t = useT();
  const headingId = useId();
  // undefined while loading; null when this server has no cloud computers.
  const [computers, setComputers] = useState<RemoteComputer[] | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [choice, setChoice] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    listRemoteComputers()
      .then((list) => { if (alive) { setComputers(list); setLoadError(null); } })
      .catch((err: unknown) => {
        if (!alive) return;
        if (remoteComputersUnsupported(err)) setComputers(null);
        else setLoadError(err instanceof Error && err.message ? err.message : t("computers.settings.loadFailed"));
      });
    return () => { alive = false; };
  }, [tick, t]);

  const link = useCallback(async (computerId: number, agentId: number | null) => {
    setBusy(true);
    setError(null);
    try {
      const next = await updateRemoteComputer(computerId, { agent_id: agentId });
      setComputers((list) => (list ? replaceComputer(list, next) : list));
      setChoice("");
      onChanged();
    } catch (err) {
      setError(isLinkConflict(err) ? t("computers.error.conflict") : err instanceof Error && err.message ? err.message : t("computers.error.generic"));
    } finally {
      setBusy(false);
    }
  }, [onChanged, t]);

  if (computers === null) return null;

  const linked = computers ? computerForAgent(computers, agent.id) : null;
  const free = computers ? freeComputers(computers) : [];

  let body;
  if (computers === undefined) {
    body = loadError
      ? <Banner tone="danger" action={<Button size="sm" onClick={() => { setLoadError(null); setTick((n) => n + 1); }}>{t("computers.retry")}</Button>}>{loadError}</Banner>
      : <Skeleton className="h-20 w-full rounded-card" />;
  } else if (linked) {
    body = (
      <Card className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span aria-hidden="true" className="inline-flex size-8 shrink-0 items-center justify-center rounded-field bg-inset text-muted"><Monitor size={16} /></span>
            <div className="min-w-0">
              <p className="truncate font-medium text-ink">{linked.name}</p>
              <p className="truncate text-small text-muted">{linked.connection_name}</p>
            </div>
          </div>
          <RemoteStatusPill state={linked.state} />
        </div>
        {linked.human_control && <StatusText status="waiting">{t("computers.live.paused", { agent: agent.name })}</StatusText>}
        <div className="flex flex-wrap gap-2">
          <LinkButton href={COMPUTERS_HREF}>{t("computers.settings.open")}</LinkButton>
          <Button variant="ghost" loading={busy} onClick={() => void link(linked.id, null)}>{t("computers.settings.unlink")}</Button>
        </div>
      </Card>
    );
  } else if (free.length > 0) {
    body = (
      <div className="flex flex-col gap-2">
        <p className="text-small text-muted">{t("computers.settings.none", { name: agent.name })}</p>
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(event) => { event.preventDefault(); if (choice) void link(Number(choice), agent.id); }}
        >
          <Select
            aria-label={t("computers.settings.choose")}
            value={choice}
            placeholder={t("computers.settings.choose")}
            onChange={(event) => setChoice(event.target.value)}
            options={free.map((computer) => ({ value: String(computer.id), label: computer.name }))}
            className="w-64 max-w-full"
            triggerClassName="h-control touch:h-touch"
          />
          <Button type="submit" disabled={!choice} loading={busy}>{t("computers.settings.link")}</Button>
        </form>
      </div>
    );
  } else {
    body = (
      <div className="flex flex-col items-start gap-2">
        <p className="text-small text-muted">{computers.length === 0 ? t("computers.settings.noneYet") : t("computers.settings.noFree")}</p>
        <LinkButton href={COMPUTERS_HREF}>{t("computers.settings.open")}</LinkButton>
      </div>
    );
  }

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <div>
        <h3 id={headingId} className="text-body font-semibold text-ink">{t("computers.settings.cloudTitle")}</h3>
        <p className="mt-0.5 text-small text-muted">{t("computers.settings.cloudBody", { name: agent.name })}</p>
      </div>
      {error && <Banner tone="danger" onDismiss={() => setError(null)}>{error}</Banner>}
      {body}
    </section>
  );
}
