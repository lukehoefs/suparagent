"use client";

import { Archive, ArchiveRestore, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import type { Thread } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/use-i18n";
import { relativeTime } from "@/lib/relative-time";
import { rowStatus, type RowStatus } from "@/lib/sidebar";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Menu, MenuItem, MenuSeparator } from "@/components/ui/Menu";
import { StatusText } from "@/components/ui/StatusPill";
import type { AvatarComputer } from "@/components/ui/Avatar";

function whenLabel(iso: string, translate: (key: string, params?: Record<string, string | number>) => string): string {
  const rel = relativeTime(iso);
  if (rel === null) return "";
  return "date" in rel ? rel.date : translate(rel.key, "n" in rel ? { n: rel.n } : undefined);
}

export type RowActions = {
  onRename: (id: number, title: string) => void;
  onArchive: (id: number, archived: boolean) => void;
  onDelete: (id: number) => void;
};

// One conversation in the Recent list: the agent's avatar, the title, when it last moved, and
// a menu to rename, archive or delete it. Rename and the delete question happen in place.
export function ThreadRow({
  thread,
  selected,
  agentName,
  status,
  unread = false,
  waitingLine,
  computer = null,
  actions,
  onNavigate,
}: {
  thread: Thread;
  selected: boolean;
  agentName?: string;
  // Live state, known only for the open conversation until the list carries it.
  status: { working?: boolean; waiting?: boolean };
  // The conversation moved since it was last opened here.
  unread?: boolean;
  // What the conversation waits on, from the needs-you card ("Atlas wants to use fetch").
  waitingLine?: string;
  // The agent's computer, as the avatar badge.
  computer?: AvatarComputer;
  actions: RowActions;
  onNavigate?: () => void;
}) {
  const t = useT();
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // The rename field takes focus itself; the menu must not pull it back to its button.
  const keepFocus = useRef(false);
  const archived = thread.archived_at !== null;
  const shown: RowStatus = rowStatus({ ...status, unread, brokenSession: thread.session_state === "broken" });

  const startRename = () => {
    setDraft(thread.title ?? "");
    keepFocus.current = true;
    setRenaming(true);
  };

  const saveRename = () => {
    const title = draft.trim();
    setRenaming(false);
    if (title && title !== thread.title) actions.onRename(thread.id, title);
  };

  if (confirming) {
    return (
      <li className="space-y-2 rounded-field border border-danger/50 bg-raised p-3 text-sm">
        <p className="font-medium">{t("sidebar.deleteTitle")}</p>
        <p className="text-xs text-muted">{t("sidebar.deleteBody")}</p>
        <div className="flex gap-2">
          <Button size="sm" variant="danger" onClick={() => { setConfirming(false); actions.onDelete(thread.id); }}>
            {t("common.delete")}
          </Button>
          <Button size="sm" onClick={() => setConfirming(false)}>{t("common.cancel")}</Button>
        </div>
      </li>
    );
  }

  if (renaming) {
    return (
      <li className="px-1">
        <input
          autoFocus
          value={draft}
          maxLength={200}
          aria-label={t("sidebar.renameLabel")}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) saveRename();
            if (e.key === "Escape") setRenaming(false);
          }}
          onBlur={() => setRenaming(false)}
          className="w-full rounded-field border border-line bg-raised px-2 py-1.5 text-sm"
        />
        <p className="px-1 pt-1 text-xs text-muted">{t("sidebar.renameHint")}</p>
      </li>
    );
  }

  return (
    <li
      className="group relative"
      // Right-click and the ContextMenu key / Shift+F10 open the same menu as the "…" button.
      onContextMenu={(event) => { event.preventDefault(); setMenuOpen(true); }}
    >
      <Link
        href={`/chat?thread=${thread.id}`}
        onClick={onNavigate}
        aria-current={selected ? "page" : undefined}
        className={cn(
          "flex items-center gap-2.5 rounded-field py-2 pl-2.5 pr-10 transition-colors duration-(--dur-fast) touch:py-2.5",
          selected ? "bg-hover" : "hover:bg-hover/60",
          archived && "opacity-60",
        )}
      >
        <Avatar
          agentId={thread.agent_id ?? null}
          name={agentName}
          size="row"
          computer={computer}
          computerLabel={computer === "on" ? t("chatPage.computerOn") : computer === "off" ? t("chatPage.computerOff") : undefined}
        />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className={cn("truncate text-label", unread ? "font-semibold" : "font-medium")}>{thread.title || t("sidebar.untitled")}</span>
          {shown === "waiting" ? (
            <StatusText status="waiting">{waitingLine ?? t("status.waiting")}</StatusText>
          ) : shown === "working" ? (
            <StatusText status="running">{t("status.working")}</StatusText>
          ) : shown === "reset" ? (
            <StatusText status="denied">{t("status.reset")}</StatusText>
          ) : (
            <span className="truncate text-small text-muted">
              {[whenLabel(thread.updated_at, t), agentName, archived ? t("sidebar.archivedTag") : null].filter(Boolean).join(" · ")}
            </span>
          )}
        </span>
        {unread && <span role="img" aria-label={t("status.unread")} className="size-2 shrink-0 rounded-full bg-accent" />}
      </Link>

      <div className={cn("absolute right-1 top-1/2 -translate-y-1/2", !selected && !menuOpen && "opacity-0 focus-within:opacity-100 group-hover:opacity-100 touch:opacity-100")}>
        <Menu
          open={menuOpen}
          onOpenChange={setMenuOpen}
          trigger={
            <button
              type="button"
              aria-label={t("sidebar.rowActions")}
              className="inline-flex size-8 cursor-pointer items-center justify-center rounded-field text-muted hover:bg-hover hover:text-ink touch:size-10"
            >
              <MoreHorizontal size={16} aria-hidden="true" />
            </button>
          }
          onCloseAutoFocus={(event) => {
            if (keepFocus.current) {
              event.preventDefault();
              keepFocus.current = false;
            }
          }}
        >
          <MenuItem onSelect={startRename} icon={<Pencil size={14} />}>{t("sidebar.rename")}</MenuItem>
          <MenuItem
            onSelect={() => actions.onArchive(thread.id, !archived)}
            icon={archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
          >
            {archived ? t("sidebar.unarchive") : t("sidebar.archive")}
          </MenuItem>
          <MenuSeparator />
          <MenuItem onSelect={() => setConfirming(true)} danger icon={<Trash2 size={14} />}>{t("sidebar.deleteAsk")}</MenuItem>
        </Menu>
      </div>
    </li>
  );
}
