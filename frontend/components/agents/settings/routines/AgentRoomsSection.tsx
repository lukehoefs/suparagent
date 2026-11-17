"use client";

// The rooms this agent is a member of, each with the Hold switch (PATCH /rooms/{id}/members/{agent})
// and a link to open the room. Holding keeps the agent in the room but stops it answering there
// until it is resumed; adding or removing members stays in the room's own settings.
import Link from "next/link";
import { Users } from "lucide-react";
import { useEffect, useId, useState } from "react";
import type { Agent } from "@/lib/api";
import { agentRooms } from "@/lib/agent-automation";
import { pluralForm } from "@/lib/blueprint-browse";
import { collaboration, type Room } from "@/lib/collaboration";
import { roomHref } from "@/lib/rooms";
import { useT } from "@/lib/use-i18n";
import { Banner } from "@/components/ui/Banner";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonList } from "@/components/ui/Skeleton";
import { StatusText } from "@/components/ui/StatusPill";
import { Card } from "@/components/ui/Surface";
import { Switch } from "@/components/ui/Switch";
import { LoadFailed, SectionHeader, useErrorText, useLocale } from "./shared";

export function AgentRoomsSection({ agent }: { agent: Agent }) {
  const t = useT();
  const headingId = useId();
  const errorText = useErrorText();
  const locale = useLocale();
  const [rooms, setRooms] = useState<Room[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pending, setPending] = useState<number | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let live = true;
    collaboration.rooms()
      .then((list) => { if (live) { setRooms(list); setLoadError(null); } })
      .catch((err: unknown) => { if (live) setLoadError(errorText(err)); });
    return () => { live = false; };
  }, [tick, errorText]);

  const setHeld = (room: Room, held: boolean) => (current: Room[] | null) =>
    current?.map((item) => (item.id !== room.id ? item : {
      ...item,
      members: item.members.map((member) => (member.agent_id === agent.id ? { ...member, held } : member)),
    })) ?? current;

  // Shows the new state at once and goes back if the save fails.
  const hold = async (room: Room, held: boolean) => {
    setPending(room.id);
    setActionError(null);
    setRooms(setHeld(room, held));
    try {
      await collaboration.holdMember(room.id, agent.id, held);
    } catch (err) {
      setRooms(setHeld(room, !held));
      setActionError(t("agentAutomation.rooms.holdFailed", { room: room.name, reason: errorText(err) }));
    } finally {
      setPending(null);
      setTick((n) => n + 1);
    }
  };

  const mine = rooms === null ? null : agentRooms(rooms, agent.id);

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <SectionHeader
        id={headingId}
        title={t("agentAutomation.rooms.title", { name: agent.name })}
        subtitle={t("agentAutomation.rooms.subtitle", { name: agent.name })}
      />
      {actionError && <Banner tone="danger" onDismiss={() => setActionError(null)}>{actionError}</Banner>}
      {loadError && <LoadFailed message={loadError} onRetry={() => { setLoadError(null); setTick((n) => n + 1); }} />}
      {mine === null ? (
        !loadError && <SkeletonList rows={2} />
      ) : mine.length === 0 ? (
        <Card className="p-0">
          <EmptyState
            icon={<Users size={22} />}
            title={t("agentAutomation.rooms.emptyTitle", { name: agent.name })}
            description={t("agentAutomation.rooms.emptyBody", { name: agent.name })}
          />
        </Card>
      ) : (
        <Card className="p-0">
          <ul className="divide-y divide-line">
            {mine.map(({ room, held }) => (
              <li key={room.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <Link href={roomHref(room.id)} className="block truncate text-label font-medium text-ink underline-offset-2 hover:underline">
                    {room.name}
                  </Link>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-small text-muted">
                    <StatusText status={held ? "idle" : "done"}>
                      {held ? t("agentAutomation.rooms.held") : t("agentAutomation.rooms.taking")}
                    </StatusText>
                    <span>{t(`agentAutomation.rooms.members.${pluralForm(locale, room.members.length)}`, { n: room.members.length })}</span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span aria-hidden="true" className="text-small text-muted">{t("agentAutomation.rooms.hold")}</span>
                  <Switch
                    checked={held}
                    disabled={pending !== null}
                    onChange={(next) => void hold(room, next)}
                    label={t("agentAutomation.rooms.holdLabel", { name: agent.name, room: room.name })}
                  />
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </section>
  );
}
