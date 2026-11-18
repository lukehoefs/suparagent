"use client";

import { Monitor, MoreHorizontal } from "lucide-react";
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
import { Tooltip } from "@/components/ui/Tooltip";
import { MenuGlyph } from "@/components/ui/MenuGlyph";

const STATE_PILL = { waiting: "waiting", working: "running", idle: "idle" } as const;

// Below this width the header is one row (design: MobileChat.html): the mode switch, Computer,
// Skills, Soul and Settings move into the More menu, and the second line keeps only the mode.
const WIDE = "(min-width: 768px)";
// Below Tailwind's sm the message box hides its model switch; the More menu offers it instead.
const PHONE = "(max-width: 639px)";

// Something done to or about the open conversation, offered in the More menu.
export type ConversationAction = { key: string; label: string; icon?: ReactNode; onSelect: () => void; hint?: string };

// The strip above a conversation (design: Chat.html). Left: the agent's avatar and name, the
// engine and model as a quiet pill (its readiness, version and approval mode are the pill's hint;
// an unavailable engine also says so as a word and a dot), the state pill (it always agrees with
// the status line and the composer button), and under them only the agent's role and how it works.
// Right: Task or Conversational, "You have control" with Hand back while a person holds the agent's
// cloud computer and its panel is hidden, the agent's cloud computer, Skills, Soul, Settings, and
// More: everything else about the conversation (approvals, files, usage, today, copy link, undo).
export function ChatHeader({
  title,
  agent,
  subtitle,
  onOpenSidebar,
  agentChoice,
  engine,
  state,
  reconnecting = false,
  modeSwitch,
  onSwitchMode,
  modelLabel,
  onModel,
  computer,
  control,
  onSkills,
  onSoul,
  onSettings,
  actions = [],
}: {
  // The conversation's (or room's) title: the heading of a plain chat or a room, and the More
  // menu's name.
  title: string;
  // Who it is with, for the avatar, name and mode; null for a plain chat or a room.
  agent: Pick<Agent, "id" | "name" | "conversational_mode"> | null;
  // The agent's role ("Chief of staff").
  subtitle?: string | null;
  // Present when the sidebar is a drawer: the button that opens it.
  onOpenSidebar?: () => void;
  // Only on a new chat: pick the agent it starts with.
  agentChoice?: { agents: Agent[]; value: number | null; onChange: (id: number | null) => void };
  // The engine and model this chat uses ("OpenRouter · Claude Opus 4"), with its readiness, version
  // and approval mode as the hint ("2.1.3 · Ask first"), and whether it can run. The composer has
  // the switcher.
  engine?: { label: string; note?: string | null; available?: boolean };
  // Shown once the conversation exists.
  state?: ChatState;
  // The live stream dropped and is being opened again.
  reconnecting?: boolean;
  // The Task / Conversational switch (components/chat/ModeSwitch.tsx), shown on a wide window.
  modeSwitch?: ReactNode;
  // The same switch as a More menu item on a narrow window ("Switch to Task").
  onSwitchMode?: { label: string; onSelect: () => void };
  // The model and effort ("Opus · High") and the dialog that changes them: a More menu item on a
  // phone, where the message box has no room for its switch. No label: not changeable now.
  modelLabel?: string;
  onModel?: () => void;
  // The agent's cloud computer: the button opens and closes the live computer panel.
  computer?: { open: boolean; onToggle: () => void };
  // A person holds the agent's cloud computer (the agent is paused): say so and offer Hand back.
  control?: { busy: boolean; onHandBack: () => void };
  onSkills?: () => void;
  onSoul?: () => void;
  onSettings?: () => void;
  actions?: ConversationAction[];
}) {
  const t = useT();
  const wide = useMediaQuery(WIDE);
  const phone = useMediaQuery(PHONE, false);
  const stateLabel = state === "waiting" ? t("status.waiting") : state === "working" ? t("status.working") : t("chat.idle");
  // Role · mode; on a narrow window only the mode (design: MobileChat.html).
  const second = [wide ? subtitle : null, agent ? modeSubtitle(t, agent) : null].filter(Boolean).join(" · ");
  const unavailable = engine?.available === false;
  // The narrow bar's icon buttons (design: MobileChat.html): ink, not muted, and 44px on a phone
  // whatever the pointer, so the avatar and name start where the design puts them.
  const barButton = wide ? undefined : "text-ink max-sm:size-11";

  // On a narrow window the bar's own buttons fold into the More menu.
  const folded: ConversationAction[] = wide ? [] : [
    onSwitchMode && { key: "mode", label: onSwitchMode.label, onSelect: onSwitchMode.onSelect },
    phone && modelLabel && onModel && { key: "model", label: t("composer.model", { label: modelLabel }), onSelect: onModel },
    control && { key: "handBack", label: t("computers.chip.handBack"), icon: <Monitor size={16} strokeWidth={1.7} />, onSelect: control.onHandBack, hint: t("computers.live.control") },
    computer && { key: "computer", label: computer.open ? t("chatPage.computerHide") : t("chatPage.computerShow"), icon: <Monitor size={16} strokeWidth={1.7} />, onSelect: computer.onToggle },
    onSkills && { key: "skills", label: t("header.skills"), onSelect: onSkills },
    onSoul && { key: "soul", label: t("chatPage.soul"), onSelect: onSoul },
    onSettings && { key: "settings", label: t("sidebar.settings"), onSelect: onSettings },
  ].filter(Boolean) as ConversationAction[];

  return (
    // Frosted chrome (glass-chrome) over the page, keeping its hairline as the separator. The blur
    // makes the header a stacking context, so z-1 keeps what opens in place below it (the mode
    // switch's error note) over the transcript, while the sidebar's resize handle (z-10) stays
    // above the header. Menus, selects and tooltips are portaled.
    <header
      className={cn(
        "z-1 flex shrink-0 items-center justify-between border-b border-line glass-chrome",
        wide
          ? "min-h-16 flex-wrap gap-x-3 gap-y-2 px-6 py-3.5 pt-[max(0.875rem,env(safe-area-inset-top))]"
          : "min-h-14 gap-2 px-2 py-1.5 pt-[max(0.375rem,env(safe-area-inset-top))]",
      )}
    >
      <div className={cn("flex min-w-0 items-center", wide ? "flex-[1_1_20rem] gap-3" : "flex-1 gap-2")}>
        {onOpenSidebar && (
          <IconButton label={t("sidebarMenu.openMenu")} aria-haspopup="dialog" onClick={onOpenSidebar} className={cn(wide && "-ml-1", barButton)}>
            <MenuGlyph size={20} />
          </IconButton>
        )}
        <Avatar agentId={agentChoice ? agentChoice.value : agent?.id ?? null} name={agent?.name} size="md" className={cn(wide && "size-9")} />
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
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
            ) : (
              <h1 className={cn("min-w-0 truncate font-semibold", wide ? "text-[16px] leading-6" : "text-body")}>{agent ? agent.name : title}</h1>
            )}
            {engine && (
              <Tooltip content={engine.note ? `${engine.label} · ${engine.note}` : engine.label}>
                {/* Focusable, so the hint opens from the keyboard too; a screen reader hears it in the name. */}
                <span tabIndex={0} className="hidden h-6 max-w-64 shrink-0 items-center truncate rounded-full bg-hover px-2 text-small font-medium text-gray-on sm:inline-flex">
                  {engine.label}
                  {engine.note && <span className="sr-only">{` · ${engine.note}`}</span>}
                </span>
              </Tooltip>
            )}
            {unavailable && <StatusText status="denied" className="shrink-0">{t("header.unavailable")}</StatusText>}
            {state && <StatusPill status={STATE_PILL[state]} className="shrink-0">{stateLabel}</StatusPill>}
            {/* Narrow: Hand back is in the More menu, so the state itself stays in view. */}
            {!wide && control && <StatusPill status="waiting" className="shrink-0">{t("computers.live.control")}</StatusPill>}
            {reconnecting && <StatusText status="idle" className="shrink-0">{t("header.reconnecting")}</StatusText>}
          </div>
          {second && <p className="min-w-0 truncate text-small text-muted">{second}</p>}
        </div>
      </div>

      <div className={cn("flex shrink-0 items-center gap-1.5", wide && "flex-wrap")}>
        {wide && modeSwitch}
        {wide && control && (
          <span className="inline-flex items-center gap-1">
            <StatusPill status="waiting">{t("computers.live.control")}</StatusPill>
            <Button variant="ghost" loading={control.busy} onClick={control.onHandBack} icon={<Monitor size={15} strokeWidth={1.7} aria-hidden="true" />}>
              {t("computers.chip.handBack")}
            </Button>
          </span>
        )}
        {wide && computer && (
          <Button
            onClick={computer.onToggle}
            aria-pressed={computer.open}
            title={computer.open ? t("chatPage.computerHide") : t("chatPage.computerShow")}
            icon={<Monitor size={15} strokeWidth={1.7} aria-hidden="true" />}
          >
            {t("header.computer")}
          </Button>
        )}
        {wide && onSkills && <Button variant="ghost" onClick={onSkills} className="text-muted hover:text-ink">{t("header.skills")}</Button>}
        {wide && onSoul && <Button variant="ghost" onClick={onSoul} className="text-muted hover:text-ink">{t("chatPage.soul")}</Button>}
        {wide && onSettings && <Button variant="ghost" onClick={onSettings} className="text-muted hover:text-ink">{t("sidebar.settings")}</Button>}
        <ConversationMenu title={title} groups={[folded, actions]} className={barButton} />
      </div>
    </header>
  );
}

// More: everything about the open conversation that the bar does not show, behind one icon button
// named after the conversation. With nothing to offer there is no button.
function ConversationMenu({ title, groups, className }: { title: string; groups: ConversationAction[][]; className?: string }) {
  const t = useT();
  const filled = groups.filter((group) => group.length > 0);
  if (filled.length === 0) return null;
  return (
    <Menu
      align="end"
      trigger={
        <IconButton label={t("chatPage.conversationMenu", { title })} className={className}>
          <MoreHorizontal size={18} strokeWidth={1.7} aria-hidden="true" />
        </IconButton>
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
