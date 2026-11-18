"use client";

// One computer on the Computers page (design: Computers.html): its screen, refreshed while the card
// is on screen, the linked agent, the status, and what you can do with it.
import Link from "next/link";
import { Ellipsis, Monitor } from "lucide-react";
import { useRef } from "react";
import { MCP_SERVERS_HREF, type RemoteComputer } from "@/lib/remote-computers";
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
  onRemove: () => void;
};

export function ComputerCard({ computer, busy, actions }: { computer: RemoteComputer; busy: boolean; actions: ComputerCardActions }) {
  const t = useT();
  const preview = useRef<HTMLDivElement>(null);
  const picture = useRemoteScreenshot(computer.id, computer.state === "online", preview);
  const agent = computer.agent_id !== null ? computer.agent_name ?? t("computers.card.agentFallback", { id: computer.agent_id }) : null;
  return (
    <Card className="flex h-full flex-col gap-3 p-3.5">
      <div ref={preview} className="relative h-[150px] overflow-hidden rounded-field border border-line bg-inset">
        {picture ? (
          // A local object URL (the bytes sit behind the session), so next/image has nothing to optimise.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={picture} alt={t("computers.card.preview", { name: computer.name })} className="h-full w-full object-cover object-top" />
        ) : (
          <ScreenPlaceholder state={computer.state} />
        )}
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 font-medium text-ink">
          {computer.agent_id !== null ? (
            <Avatar agentId={computer.agent_id} name={agent} size="sm" />
          ) : (
            <span aria-hidden="true" className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-inset text-faint">
              <Monitor size={12} />
            </span>
          )}
          <span className={agent ? "truncate" : "truncate font-normal text-muted"}>{agent ?? t("computers.card.notLinked")}</span>
        </div>
        <RemoteStatusPill state={computer.state} />
      </div>
      <p className="-mt-1 truncate text-small text-muted" title={`${computer.name} · ${computer.connection_name}`}>
        {computer.name} · {computer.connection_name}
      </p>
      {computer.state === "needs_key" && (
        <p className="-mt-1 text-small text-muted">
          {t("computers.card.needsKeyHint")}{" "}
          <Link href={MCP_SERVERS_HREF} className="text-accent-text underline underline-offset-2 hover:opacity-80">{t("computers.card.addKey")}</Link>
        </p>
      )}
      {computer.state === "offline" && computer.last_error && (
        <p className="-mt-1 line-clamp-2 text-small text-muted" title={computer.last_error}>{computer.last_error}</p>
      )}
      {computer.human_control && (
        <StatusText status="waiting" className="-mt-1">
          {agent ? t("computers.live.paused", { agent }) : t("computers.live.pausedNoAgent")}
        </StatusText>
      )}
      <div className="mt-auto flex flex-wrap items-center gap-1.5">
        <Button disabled={busy || !computer.live_view} onClick={actions.onOpen}>{t("computers.card.openLive")}</Button>
        {computer.human_control ? (
          <Button variant="ghost" className="text-muted hover:text-ink" disabled={busy} onClick={actions.onHandBack}>{t("computers.live.handBack")}</Button>
        ) : (
          <Button variant="ghost" className="text-muted hover:text-ink" disabled={busy || !computer.live_view} onClick={actions.onTakeControl}>{t("computers.card.takeControl")}</Button>
        )}
        <span className="ml-auto">
          <Menu trigger={<IconButton label={t("computers.card.more", { name: computer.name })} disabled={busy}><Ellipsis size={18} aria-hidden="true" /></IconButton>}>
            <MenuItem onSelect={actions.onLink}>{t(agent ? "computers.card.changeAgent" : "computers.card.link")}</MenuItem>
            {agent && <MenuItem onSelect={actions.onUnlink}>{t("computers.card.unlink", { agent })}</MenuItem>}
            <MenuItem onSelect={actions.onRename}>{t("computers.card.rename")}</MenuItem>
            <MenuItem onSelect={actions.onCheck}>{t("computers.card.check")}</MenuItem>
            <MenuSeparator />
            <MenuItem danger onSelect={actions.onRemove}>{t("computers.card.remove")}</MenuItem>
          </Menu>
        </span>
      </div>
    </Card>
  );
}
