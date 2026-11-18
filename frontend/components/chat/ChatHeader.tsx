"use client";

import { ChevronDown, Menu as MenuIcon, Monitor } from "lucide-react";
import { Fragment, type ReactNode } from "react";
import type { Agent } from "@/lib/api";
import { modeSubtitle } from "@/lib/agent-mode";
import type { ChatState } from "@/lib/chat-state";
import { cn } from "@/lib/cn";
import { useMediaQuery } from "@/lib/use-media-query";
import { useT } from "@/lib/use-i18n";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Menu, MenuItem, MenuSeparator } from "@/components/ui/Menu";
import { Select } from "@/components/ui/Select";
import { StatusPill, StatusText } from "@/components/ui/StatusPill";

const STATE_PILL = { waiting: "waiting", working: "running", idle: "idle" } as const;

// Below this width the header keeps only the mode switch; Computer, Skills, Soul and Settings
// move into the conversation's menu.
const WIDE = "(min-width: 768px)";

// Something done to or about the open conversation, offered in the menu on its title.
export type ConversationAction = { key: string; label: string; icon?: ReactNode; onSelect: () => void; hint?: string };

// The strip above a conversation (design: Chat.html). Left: the agent's avatar and name, the
// engine and model as a quiet pill, the state pill (it always agrees with the status line and the
// composer button), and under them the agent's role and how it works, then the conversation's
// title, which opens a menu with everything else (approvals, files, usage, today, copy link,
// undo). Right: Task or Conversational, the agent's cloud computer, Skills, Soul and Settings.
export function ChatHeader({
  title,
  agent,
  subtitle,
  onOpenSidebar,
  agentChoice,
  engine,
  state,
  stateNote,
  reconnecting = false,
  modeSwitch,
  computer,
  onSkills,
  onSoul,
  onSettings,
  actions = [],
}: {
  // The conversation's (or room's) title.
  title: string;
  // Who it is with, for the avatar, name and mode; null for a plain chat or a room.
  agent: Pick<Agent, "id" | "name" | "conversational_mode"> | null;
  // The agent's role ("Chief of staff").
  subtitle?: string | null;
  // Present when the sidebar is a drawer: the button that opens it.
  onOpenSidebar?: () => void;
  // Only on a new chat: pick the agent it starts with.
  agentChoice?: { agents: Agent[]; value: number | null; onChange: (id: number | null) => void };
  // The engine and model this chat uses ("OpenRouter · Claude Opus 4"). The composer has the switcher.
  engine?: { label: string };
  // Shown once the conversation exists.
  state?: ChatState;
  // The engine's version or readiness, "chat only", and how the agent asks: the state pill's hint.
  stateNote?: string | null;
  // The live stream dropped and is being opened again.
  reconnecting?: boolean;
  // The Task / Conversational switch (components/chat/ModeSwitch.tsx).
  modeSwitch?: ReactNode;
  // The agent's cloud computer: the button opens and closes the live computer panel.
  computer?: { open: boolean; onToggle: () => void };
  onSkills?: () => void;
  onSoul?: () => void;
  onSettings?: () => void;
  actions?: ConversationAction[];
}) {
  const t = useT();
  const wide = useMediaQuery(WIDE);
  const stateLabel = state === "waiting" ? t("status.waiting") : state === "working" ? t("status.working") : t("chat.idle");
  const second = [subtitle, agent ? modeSubtitle(t, agent) : null].filter(Boolean).join(" · ");

  // On a narrow window the bar's own buttons fold into the conversation's menu.
  const folded: ConversationAction[] = wide ? [] : [
    computer && { key: "computer", label: computer.open ? t("chatPage.computerHide") : t("chatPage.computerShow"), icon: <Monitor size={16} />, onSelect: computer.onToggle },
    onSkills && { key: "skills", label: t("header.skills"), onSelect: onSkills },
    onSoul && { key: "soul", label: t("chatPage.soul"), onSelect: onSoul },
    onSettings && { key: "settings", label: t("sidebar.settings"), onSelect: onSettings },
  ].filter(Boolean) as ConversationAction[];

  const menu = (heading: boolean) => (
    <ConversationMenu title={title} heading={heading} groups={[folded, actions]} />
  );

  return (
    <header className="flex min-h-16 shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-line bg-surface px-3 py-3.5 pt-[max(0.875rem,env(safe-area-inset-top))] sm:px-6">
      <div className="flex min-w-0 flex-[1_1_20rem] items-center gap-3">
        {onOpenSidebar && (
          <IconButton label={t("shell.openSidebar")} onClick={onOpenSidebar} className="-ml-1">
            <MenuIcon size={20} />
          </IconButton>
        )}
        <Avatar agentId={agentChoice ? agentChoice.value : agent?.id ?? null} name={agent?.name} size="md" className="size-9" />
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {agentChoice ? (
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
            ) : agent ? (
              <h1 className="min-w-0 truncate text-[16px] font-semibold leading-6">{agent.name}</h1>
            ) : (
              <h1 className="min-w-0 text-[16px] font-semibold leading-6">{menu(true)}</h1>
            )}
            {engine && (
              <span className="hidden h-6 max-w-64 shrink-0 items-center truncate rounded-full bg-hover px-2 text-small font-medium text-gray-on sm:inline-flex">
                {engine.label}
              </span>
            )}
            {state && (
              <span className="inline-flex shrink-0" title={stateNote ?? undefined}>
                <StatusPill status={STATE_PILL[state]}>{stateLabel}</StatusPill>
                {stateNote && <span className="sr-only">{`, ${stateNote}`}</span>}
              </span>
            )}
            {reconnecting && <StatusText status="idle" className="shrink-0">{t("header.reconnecting")}</StatusText>}
          </div>
          {(agent || agentChoice) && (
            <div className="flex min-w-0 items-center gap-1 text-small text-muted">
              {second && <span className="min-w-0 shrink truncate">{second}</span>}
              {second && <span aria-hidden="true">·</span>}
              {menu(false)}
            </div>
          )}
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
        {modeSwitch}
        {wide && computer && (
          <Button
            onClick={computer.onToggle}
            aria-pressed={computer.open}
            title={computer.open ? t("chatPage.computerHide") : t("chatPage.computerShow")}
            icon={<Monitor size={15} aria-hidden="true" />}
            className={cn(computer.open && "bg-hover")}
          >
            {t("header.computer")}
          </Button>
        )}
        {wide && onSkills && <Button variant="ghost" onClick={onSkills} className="text-muted hover:text-ink">{t("header.skills")}</Button>}
        {wide && onSoul && <Button variant="ghost" onClick={onSoul} className="text-muted hover:text-ink">{t("chatPage.soul")}</Button>}
        {wide && onSettings && <Button variant="ghost" onClick={onSettings} className="text-muted hover:text-ink">{t("sidebar.settings")}</Button>}
      </div>
    </header>
  );
}

// The conversation's title, which opens its menu. As the heading (a plain chat, a room) it reads
// at heading size; under an agent's name it is quiet text. With nothing to offer it is plain text.
function ConversationMenu({ title, heading, groups }: { title: string; heading: boolean; groups: ConversationAction[][] }) {
  const t = useT();
  const filled = groups.filter((group) => group.length > 0);
  if (filled.length === 0) return <span className="block min-w-0 truncate">{title}</span>;
  return (
    <Menu
      align="start"
      trigger={
        <button
          type="button"
          aria-label={t("chatPage.conversationMenu", { title })}
          className={cn(
            "inline-flex min-w-0 cursor-pointer items-center gap-1 rounded-inner transition-colors duration-(--dur-fast) hover:bg-hover hover:text-ink touch:min-h-touch",
            heading ? "-mx-1.5 max-w-72 px-1.5 text-ink" : "-mx-1 max-w-64 shrink-[0.3] px-1",
          )}
        >
          <span className="min-w-0 truncate">{title}</span>
          <ChevronDown size={heading ? 16 : 14} aria-hidden="true" className="shrink-0 text-muted" />
        </button>
      }
    >
      {filled.map((group, index) => (
        <Fragment key={index}>
          {index > 0 && <MenuSeparator />}
          {group.map((item) => (
            <MenuItem key={item.key} onSelect={item.onSelect} icon={item.icon}>
              <span className="flex min-w-0 flex-col">
                <span>{item.label}</span>
                {item.hint && <span className="text-small text-muted">{item.hint}</span>}
              </span>
            </MenuItem>
          ))}
        </Fragment>
      ))}
    </Menu>
  );
}
