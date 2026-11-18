"use client";

// One computer on the Computers page (design: Computers.html): its screen, refreshed while the card
// is on screen, the linked agent, the status, and what you can do with it. An Offline computer offers
// Check now and a Stopped one Start (its MCP server back on), in place of a live view it cannot open.
import Link from "next/link";
import { Ellipsis, Monitor, Play } from "lucide-react";
import { useRef } from "react";
import { lastErrorKey, MCP_SERVERS_HREF, type RemoteComputer } from "@/lib/remote-computers";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/use-i18n";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Menu, MenuItem, MenuSeparator } from "@/components/ui/Menu";
import { StatusText } from "@/components/ui/StatusPill";
import { Card } from "@/components/ui/Surface";
import { RemoteStatusPill, ScreenPlaceholder } from "./RemoteScreen";
import { useRemoteScreenshot } from "./useRemoteScreenshot";

export type ComputerCardActions = {
  onOpen: () => void;
  onTakeControl: () => void;
  onHandBack: () => void;
  onLink: () => void;
  onUnlink: () => void;
  onRename: () => void;
  onCheck: () => void;
  // Start: switch its MCP server back on (state "disabled", shown as Stopped).
  onTurnOn: () => void;
  onRemove: () => void;
};

export function ComputerCard({ computer, busy, actions }: { computer: RemoteComputer; busy: boolean; actions: ComputerCardActions }) {
  const t = useT();
  const lastError = lastErrorKey(computer.last_error);
  const preview = useRef<HTMLDivElement>(null);
  const picture = useRemoteScreenshot(computer.id, computer.state === "online", preview);
  const agent = computer.agent_id !== null ? computer.agent_name ?? t("computers.card.agentFallback", { id: computer.agent_id }) : null;
  // No live view to open: the card's first button is the way back instead.
  // Start keeps the secondary style: several computers can be stopped at once, and a view has one
  // primary button.
  const recover = computer.state === "offline" ? { label: t("computers.card.check"), run: actions.onCheck, icon: undefined }
    : computer.state === "disabled" ? { label: t("computers.card.turnOn"), run: actions.onTurnOn, icon: <Play size={15} strokeWidth={1.7} aria-hidden="true" /> }
    : null;
  return (
    <Card className="flex h-full flex-col gap-3 p-3.5">
      {/* A picture sits in a hairline frame (design: Computers); the placeholder is a plain block
          without one (design: States, "Computer: stopped"). */}
      <div ref={preview} className={cn("relative h-[150px] overflow-hidden rounded-field", picture ? "border border-line bg-inset" : "bg-hover")}>
        {picture ? (
          // A local object URL (the bytes sit behind the session), so next/image has nothing to optimise.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={picture} alt={t("computers.card.preview", { name: computer.name })} className="h-full w-full object-cover object-top" />
        ) : (
          <ScreenPlaceholder state={computer.state} />
        )}
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 text-body font-medium text-ink">
          {computer.agent_id !== null ? (
            <Avatar agentId={computer.agent_id} name={agent} size="sm" />
          ) : (
            <span aria-hidden="true" className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-inset text-faint">
              <Monitor size={12} strokeWidth={1.7} />
            </span>
          )}
          <span className={agent ? "truncate" : "truncate font-normal text-muted"}>{agent ?? t("computers.card.notLinked")}</span>
        </div>
        <RemoteStatusPill state={computer.state} />
      </div>
      <p className="truncate text-small text-muted" title={`${computer.name} · ${computer.connection_name}`}>
        {computer.name} · {computer.connection_name}
      </p>
      {computer.state === "needs_key" && (
        <p className="-mt-1 text-small text-muted">
          {t("computers.card.needsKeyHint")}{" "}
          <Link href={MCP_SERVERS_HREF} className="text-accent-text underline underline-offset-2 hover:opacity-80">{t("computers.card.addKey")}</Link>
        </p>
      )}
      {computer.state === "offline" && lastError && (
        <p className="-mt-1 line-clamp-2 text-small text-muted">{t(lastError)}</p>
      )}
      {computer.human_control && (
        <StatusText status="waiting" className="-mt-1">
          {agent ? t("computers.live.paused", { agent }) : t("computers.live.pausedNoAgent")}
        </StatusText>
      )}
      <div className="mt-auto flex flex-wrap items-center gap-1.5">
        {recover ? (
          <Button disabled={busy} icon={recover.icon} onClick={recover.run}>{recover.label}</Button>
        ) : (
          <Button disabled={busy || !computer.live_view} onClick={actions.onOpen}>{t("computers.card.openLive")}</Button>
        )}
        {computer.human_control ? (
          <Button variant="ghost" className="text-muted hover:text-ink" disabled={busy} onClick={actions.onHandBack}>{t("computers.live.handBack")}</Button>
        ) : !recover && (
          <Button variant="ghost" className="text-muted hover:text-ink" disabled={busy || !computer.live_view} onClick={actions.onTakeControl}>{t("computers.card.takeControl")}</Button>
        )}
        <span className="ml-auto">
          <Menu trigger={<IconButton label={t("computers.card.more", { name: computer.name })} disabled={busy}><Ellipsis size={18} strokeWidth={1.7} aria-hidden="true" /></IconButton>}>
            <MenuItem onSelect={actions.onLink}>{t(agent ? "computers.card.changeAgent" : "computers.card.link")}</MenuItem>
            {agent && <MenuItem onSelect={actions.onUnlink}>{t("computers.card.unlink", { agent })}</MenuItem>}
            <MenuItem onSelect={actions.onRename}>{t("computers.card.rename")}</MenuItem>
            {computer.state !== "offline" && <MenuItem onSelect={actions.onCheck}>{t("computers.card.check")}</MenuItem>}
            <MenuSeparator />
            <MenuItem danger onSelect={actions.onRemove}>{t("computers.card.remove")}</MenuItem>
          </Menu>
        </span>
      </div>
    </Card>
  );
}
