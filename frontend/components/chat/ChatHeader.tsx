"use client";

import { BarChart3, CalendarDays, Folder, Link2, Menu as MenuIcon, Monitor, MoreHorizontal, ShieldCheck, Undo2 } from "lucide-react";
import type { ReactNode } from "react";
import type { Agent } from "@/lib/api";
import type { ChatState } from "@/lib/chat-state";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/use-i18n";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Menu, MenuItem } from "@/components/ui/Menu";
import { Select } from "@/components/ui/Select";
import { StatusPill } from "@/components/ui/StatusPill";

const STATE_PILL = { waiting: "waiting", working: "running", idle: "idle" } as const;

// The strip above a conversation (design: Chat.html). Who it is with (avatar, name, engine and the
// state pill that always agrees with the composer button), the agent's role and approval mode under
// it, then the agent's computer, skills and settings. The rest (approvals, files, usage, today, copy
// link, undo) sits in one More menu.
export function ChatHeader({
  title,
  agent,
  subtitle,
  onOpenSidebar,
  agentChoice,
  engine,
  state,
  computer,
  approvalMode,
  onSkills,
  onSettings,
  onApprovals,
  onFiles,
  onUsage,
  onToday,
  onCopyLink,
  onUndo,
  usageHint,
  trailing,
  status,
}: {
  title: string;
  // The conversation's agent, for the avatar and name; null for a plain chat or a room.
  agent: Pick<Agent, "id" | "name"> | null;
  // The agent's role line ("Chief of staff"), and the conversation title when it differs.
  subtitle?: string | null;
  // Present when the sidebar is a drawer: the button that opens it.
  onOpenSidebar?: () => void;
  // Only on a new chat: pick the agent it starts with.
  agentChoice?: { agents: Agent[]; value: number | null; onChange: (id: number | null) => void };
  // The engine and model this chat uses, as a quiet pill. The composer has the switcher.
  engine?: { label: string };
  // Shown once the conversation exists.
  state?: ChatState;
  computer?: { text: string; hint: string; onClick: () => void };
  approvalMode?: { label: string; hint: string };
  onSkills?: () => void;
  onSettings?: () => void;
  onApprovals?: () => void;
  onFiles?: () => void;
  onUsage?: () => void;
  onToday?: () => void;
  // Copies a link that opens this chat or room again.
  onCopyLink?: () => void;
  // Opens the "undo this task's file changes" confirmation; absent while a task runs.
  onUndo?: () => void;
  usageHint?: string;
  // The notification bell and anything else that sits at the far right.
  trailing?: ReactNode;
  // Short text such as "Reconnecting…" or the engine's version.
  status?: { text: string; warn?: boolean } | null;
}) {
  const t = useT();
  type Action = { key: string; label: string; icon: ReactNode; run: () => void; hint?: string };
  const more: Action[] = [];
  if (onApprovals) more.push({ key: "approvals", label: t("header.approvals"), icon: <ShieldCheck size={16} />, run: onApprovals });
  if (onFiles) more.push({ key: "files", label: t("header.files"), icon: <Folder size={16} />, run: onFiles });
  if (onUsage) more.push({ key: "usage", label: t("header.usage"), icon: <BarChart3 size={16} />, run: onUsage, hint: usageHint });
  if (onToday) more.push({ key: "today", label: t("header.today"), icon: <CalendarDays size={16} />, run: onToday, hint: t("header.todayHint") });
  if (onCopyLink) more.push({ key: "copyLink", label: t("header.copyLink"), icon: <Link2 size={16} />, run: onCopyLink });
  if (onUndo) more.push({ key: "undo", label: t("header.undo"), icon: <Undo2 size={16} />, run: onUndo });
  const stateLabel = state === "waiting" ? t("status.waiting") : state === "working" ? t("status.working") : t("chat.idle");
  const second = [subtitle, approvalMode?.label].filter(Boolean).join(" · ");

  return (
    <header className="flex min-h-16 shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-surface px-3 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-6">
      {onOpenSidebar && (
        <IconButton label={t("shell.openSidebar")} onClick={onOpenSidebar} className="-ml-1">
          <MenuIcon size={20} />
        </IconButton>
      )}

      <div className="flex min-w-0 flex-1 items-center gap-3">
        {agentChoice ? (
          <>
            <Avatar agentId={agentChoice.value} name={agentChoice.agents.find((a) => a.id === agentChoice.value)?.name} size="md" className="size-9" />
            <Select
              value={agentChoice.value ?? ""}
              onChange={(e) => agentChoice.onChange(e.target.value === "" ? null : Number(e.target.value))}
              aria-label={t("header.agentForChat")}
              className="h-control min-w-0 max-w-56 cursor-pointer truncate rounded-field border border-line bg-raised px-2.5 text-body font-semibold touch:h-touch"
            >
              <option value="">{t("header.noAgent")}</option>
              {agentChoice.agents.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </Select>
            {engine && <span className="hidden h-6 shrink-0 items-center rounded-full bg-hover px-2.5 text-small font-medium text-gray-on sm:inline-flex">{engine.label}</span>}
          </>
        ) : (
          <>
            <Avatar agentId={agent?.id ?? null} name={agent?.name} size="md" className="size-9" />
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <h1 className="min-w-0 truncate text-[16px] font-semibold leading-6">{agent?.name ?? title}</h1>
                {engine && <span className="hidden h-6 max-w-64 shrink-0 items-center truncate rounded-full bg-hover px-2.5 text-small font-medium text-gray-on sm:inline-flex">{engine.label}</span>}
                {state && <StatusPill status={STATE_PILL[state]}>{stateLabel}</StatusPill>}
              </div>
              {second && (
                <p className="truncate text-small text-muted" title={approvalMode?.hint}>
                  {second}
                </p>
              )}
            </div>
          </>
        )}
      </div>

      {status ? <span className={cn("shrink-0 text-small", status.warn ? "text-warning" : "hidden text-muted xl:inline")}>{status.text}</span> : null}

      <div className="flex shrink-0 items-center gap-1.5">
        {computer && (
          <Button onClick={computer.onClick} title={computer.hint} icon={<Monitor size={15} aria-hidden="true" />} className="hidden lg:inline-flex">
            {t("header.computer")}
          </Button>
        )}
        {onSkills && (
          <Button variant="ghost" onClick={onSkills} className="hidden text-muted lg:inline-flex">
            {t("header.skills")}
          </Button>
        )}
        {onSettings && (
          <Button variant="ghost" onClick={onSettings} className="hidden text-muted lg:inline-flex">
            {t("sidebar.settings")}
          </Button>
        )}
        {(more.length > 0 || computer || onSkills || onSettings) && (
          // Hidden on a wide window when only the three bar buttons would be in it.
          <div className={cn(more.length === 0 && "lg:hidden")}>
          <Menu
            trigger={
              <IconButton label={t("header.more")}>
                <MoreHorizontal size={18} />
              </IconButton>
            }
          >
            {/* On a narrow window these three buttons fold in here; on a wide one they are in the bar. */}
            {computer && <MenuItem onSelect={computer.onClick} icon={<Monitor size={16} />} className="lg:hidden">{t("header.computer")}</MenuItem>}
            {onSkills && <MenuItem onSelect={onSkills} className="lg:hidden">{t("header.skills")}</MenuItem>}
            {onSettings && <MenuItem onSelect={onSettings} className="lg:hidden">{t("sidebar.settings")}</MenuItem>}
            {more.map((item) => (
              <MenuItem key={item.key} onSelect={item.run} icon={item.icon}>{item.label}</MenuItem>
            ))}
          </Menu>
          </div>
        )}
        {trailing}
      </div>
    </header>
  );
}
