"use client";

import * as RadixDialog from "@radix-ui/react-dialog";
import {
  AlertTriangle,
  Archive,
  ArrowRightLeft,
  BookOpen,
  Building2,
  FileText,
  Gauge,
  GitBranch,
  Hash,
  KeyRound,
  LayoutGrid,
  MessageSquare,
  Monitor,
  Plus,
  Repeat,
  Search,
  Server,
  SquareCheck,
  Sun,
  Users,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { api, type Agent, type Thread } from "@/lib/api";
import { collaboration, type Room } from "@/lib/collaboration";
import { cn } from "@/lib/cn";
import { SlidersIcon } from "@/components/ui/SlidersIcon";
import type { NeedsYouRow } from "@/lib/needs-you";
import {
  archivedThreads,
  arrangePalette,
  isApplePlatform,
  isNewChatKey,
  isPaletteShortcut,
  keysAllowedAt,
  NEW_CHAT_KEY,
  nextSequence,
  palettePages,
  pressedLetter,
  recentThreads,
  waitingBrowse,
  waitingEntries,
  wouldAskBeforeLeaving,
  type PaletteEntry,
  type PaletteGroup,
  type PalettePageId,
} from "@/lib/palette";
import { BASE_PATH, SIGN_IN_URL, withBase } from "@/lib/paths";
import { formatMessageTime } from "@/lib/relative-time";
import { roomHref } from "@/lib/rooms";
import { routinesHref } from "@/lib/routines-page";
import { SETTINGS_PAGES } from "@/lib/settings-nav";
import { SETTINGS_REGISTRY, settingsEntryHref } from "@/lib/settings-registry";
import { TODAY_HREF } from "@/lib/shell-nav";
import { sidebarAgents, threadName } from "@/lib/sidebar";
import { useT } from "@/lib/use-i18n";
import { lastPage, noteRecent, recentWorkspaces, setWorkspaceScope } from "@/lib/workspace-scope";
import { arrange, listWorkspaces, selectWorkspace, type Workspace, type WorkspaceRole } from "@/lib/workspaces";
import { useSession } from "@/components/AuthGate";
import { Avatar } from "@/components/ui/Avatar";
import { Kbd } from "@/components/ui/Kbd";
import { requestTeamPanel, useTeamPanelAvailable } from "./teamPanel";
import { useWaiting } from "./useWaiting";

type Command = PaletteEntry & {
  icon: ReactNode;
  // A shortcut that really works for the row (G T, Ctrl ,), shown beside it.
  keys?: readonly string[];
  // true: the palette stays open while it runs (switching workspace says how it went there).
  stays?: boolean;
  run: () => void;
};

const OPEN_EVENT = "lukethomas:command-palette";
// The sidebar reads the same rows every minute; opening the palette again soon reuses the last answer.
const ATTENTION_FRESH_MS = 15_000;

const PAGE_LABELS: Record<PalettePageId, string> = {
  today: "sidebar.today",
  agents: "sidebar.agents",
  tasks: "sidebar.tasks",
  // The sidebar's name for the page (Sidebar.tsx), so both say the same.
  results: "results.nav",
  routines: "sidebar.routines",
  apps: "sidebar.apps",
  computers: "sidebarNav.computers",
  settings: "sidebar.settings",
  workflows: "sidebarMenu.workflows",
  clients: "sidebarMenu.clients",
  "mcp-servers": "settingsNav.mcpServers",
  docs: "settingsNav.docs",
};

// The design's icons are drawn at a 1.7 stroke.
const STROKE = 1.7;

// The sidebar's icons (Sidebar.tsx), so a page looks the same in both places.
const PAGE_ICONS: Record<PalettePageId, ReactNode> = {
  today: <Sun size={16} strokeWidth={STROKE} />,
  agents: <Users size={16} strokeWidth={STROKE} />,
  tasks: <SquareCheck size={16} strokeWidth={STROKE} />,
  results: <FileText size={16} strokeWidth={STROKE} />,
  routines: <Repeat size={16} strokeWidth={STROKE} />,
  apps: <LayoutGrid size={16} strokeWidth={STROKE} />,
  computers: <Monitor size={16} strokeWidth={STROKE} />,
  settings: <SlidersIcon size={16} />,
  workflows: <GitBranch size={16} strokeWidth={STROKE} />,
  clients: <Building2 size={16} strokeWidth={STROKE} />,
  "mcp-servers": <Server size={16} strokeWidth={STROKE} />,
  docs: <BookOpen size={16} strokeWidth={STROKE} />,
};

const GROUP_LABELS: Record<PaletteGroup, string> = {
  waiting: "status.waiting",
  recent: "sidebar.recent",
  agents: "palette.groupAgents",
  goto: "palette.title",
  actions: "palette.groupActions",
};

// A waiting row with no agent behind it (an engine signed out, a routine to fix) shows what it is,
// as Today's row does (components/today/WaitingSection.tsx), not an empty face.
const WAITING_ICONS: Record<string, ReactNode> = {
  signed_out: <KeyRound size={16} strokeWidth={STROKE} />,
  out_of_credit: <Gauge size={16} strokeWidth={STROKE} />,
  usage_limit: <Gauge size={16} strokeWidth={STROKE} />,
  routine: <Repeat size={16} strokeWidth={STROKE} />,
  approval: <MessageSquare size={16} strokeWidth={STROKE} />,
  question: <MessageSquare size={16} strokeWidth={STROKE} />,
};

// The design's faces in a palette row: 22 px, in the 22 px icon slot.
const FACE = "size-[22px]";

const ROLE_LABELS: Record<WorkspaceRole, string> = { owner: "palette.roleOwner", admin: "palette.roleAdmin", member: "palette.roleMember", viewer: "palette.roleViewer" };

// The design's key caps: outlined in the text colour, Inter, 18 px.
const KEY_CAP = "h-[18px] min-w-[18px] rounded-[5px] border-current bg-transparent px-1 font-sans font-medium text-current opacity-75";

// Another dialog owns the keyboard while it is open (the same test as the Settings shortcut's).
function otherDialogOpen(): boolean {
  return document.querySelector('dialog[open], [role="dialog"]:not([aria-hidden="true"]):not([data-state="closed"]), [role="alertdialog"], [aria-modal="true"]') !== null;
}

/** Opens the palette from anywhere on the page (a click, not only Ctrl/Cmd+K). */
export function openCommandPalette(): void {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

/**
 * The command palette (design: CommandPalette.html), opened with Ctrl/Cmd+K or the sidebar's
 * "Search or jump to" field. One search over what waits for you, recent conversations, agents,
 * the app's pages and settings, the team and rooms, and a few actions; arrows move, Enter runs,
 * Esc closes. While it is closed, G then T opens Today, G then K opens Tasks, and G then C starts
 * a new chat (no single-letter shortcut). Mounted once by the app shell and by the chat page.
 */
export function CommandPalette({
  agents,
  threads,
  onNewChat,
  navigate,
  attention,
}: {
  agents: Agent[] | null;
  threads: Thread[] | null;
  onNewChat: (agentId?: number) => void;
  // How a command changes page; a host with a leave guard passes its own. Default: the router.
  navigate?: (href: string) => void;
  // The needs-you rows when the host already reads them (AppShell's `attention`); left out, the
  // palette reads them itself when it opens (owner and admin only, like the endpoint). The Waiting
  // group is Today's list (components/shell/useWaiting.ts); these count by its rule only while the
  // Today brief cannot be read.
  attention?: NeedsYouRow[] | null;
}) {
  const t = useT();
  const router = useRouter();
  const { session } = useSession();
  const admin = session === null || session.scopes.includes("admin");
  // Only a hosted deployment has more than one workspace (lib/workspaces.ts).
  const hosted = SIGN_IN_URL !== "";
  const push = useMemo(() => navigate ?? ((href: string) => router.push(href)), [navigate, router]);
  const [apple] = useState(() => typeof navigator !== "undefined" && isApplePlatform(navigator.platform));
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  // The row under the cursor, by id, so a list refresh while open does not move it.
  const [activeId, setActiveId] = useState<string | null>(null);
  const [fetched, setFetched] = useState<NeedsYouRow[] | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[] | null>(null);
  // The rooms (GET /rooms), read when the palette opens; null where the backend has none.
  const [rooms, setRooms] = useState<Room[] | null>(null);
  // Every conversation with the archived ones (GET /threads?include_archived=true), read when a
  // search starts, so an archived chat is found here too (Recent leaves them out).
  const [withArchived, setWithArchived] = useState<Thread[] | null>(null);
  const teamPanel = useTeamPanelAvailable();
  // "selecting": the account service is moving the selection; "reloading": the page was told to
  // reload into the other workspace. Either way the rows wait.
  const [switchPhase, setSwitchPhase] = useState<"idle" | "selecting" | "reloading">("idle");
  const switching = switchPhase !== "idle";
  const [switchError, setSwitchError] = useState<string | null>(null);
  const listId = useId();
  const inputId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  // Set when a row ran: focus then stays where that command put it, not back on the opener.
  const ran = useRef(false);
  const openRef = useRef(false);
  const pendingG = useRef<number | null>(null);
  const attentionReadAt = useRef(0);
  const sequences = useRef<Map<string, () => void>>(new Map());
  const newChatRef = useRef(onNewChat);

  useEffect(() => {
    openRef.current = open;
  }, [open]);
  useEffect(() => {
    newChatRef.current = onNewChat;
  }, [onNewChat]);

  // The go-to keys follow the pages this person may open.
  useEffect(() => {
    sequences.current = new Map(palettePages(admin).flatMap((page) => (page.sequence ? [[page.sequence, () => push(page.href)] as const] : [])));
  }, [admin, push]);

  useEffect(() => {
    const reset = () => {
      setQuery("");
      setActiveId(null);
      setSwitchError(null);
      // A reload that was called off (the browser asked, the person stayed) leaves this page on
      // screen: its rows work again once the palette reopens.
      setSwitchPhase((phase) => (phase === "reloading" ? "idle" : phase));
    };
    const onKey = (event: KeyboardEvent) => {
      if (isPaletteShortcut(event)) {
        event.preventDefault();
        reset();
        setOpen((on) => !on);
        return;
      }
      if (openRef.current || event.defaultPrevented) return;
      if (!keysAllowedAt(event.target instanceof HTMLElement ? event.target : null) || otherDialogOpen()) {
        pendingG.current = null;
        return;
      }
      const letter = pressedLetter(event);
      const now = Date.now();
      // G then C starts a new chat (the key caps on the "New chat" row); C alone does nothing.
      if (isNewChatKey(pendingG.current, letter, now)) {
        pendingG.current = null;
        event.preventDefault();
        newChatRef.current();
        return;
      }
      const step = nextSequence(pendingG.current, letter, now, new Set(sequences.current.keys()));
      pendingG.current = step.pending;
      const go = step.fire ? sequences.current.get(step.fire) : undefined;
      if (go) {
        event.preventDefault();
        go();
      }
    };
    // The sidebar's "Search or jump to" field opens it too (openCommandPalette above).
    const onOpen = () => {
      reset();
      setOpen(true);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_EVENT, onOpen);
    };
  }, []);

  // What waits for the person, read when the palette opens (at most every ATTENTION_FRESH_MS)
  // unless the host hands it over. The last answer stays while the next is read.
  const ownAttention = attention === undefined;
  useEffect(() => {
    if (!open || !admin || !ownAttention) return;
    if (Date.now() - attentionReadAt.current < ATTENTION_FRESH_MS) return;
    attentionReadAt.current = Date.now();
    // An answer that lands after closing still counts: it is the newest, and the palette stays mounted.
    api.peekNeedsYou()
      .then((card) => setFetched(card.items))
      .catch(() => {
        attentionReadAt.current = 0;
        setFetched(null);
      });
  }, [open, admin, ownAttention]);
  const attentionRows = ownAttention ? (admin ? fetched : null) : attention;
  // What waits, as Today lists it and the sidebar's band counts it (owner and admin): the same
  // reads, so every count on the page agrees. The needs-you rows count only while the brief is out.
  const waiting = useWaiting(open && admin, attentionRows ?? null);

  // The workspaces to switch to, read once on the first opening (hosted only).
  useEffect(() => {
    if (!open || !hosted || workspaces !== null) return;
    let alive = true;
    listWorkspaces()
      .then((list) => { if (alive) setWorkspaces(list); })
      .catch(() => { if (alive) setWorkspaces([]); });
    return () => { alive = false; };
  }, [open, hosted, workspaces]);

  // The rooms, read again each time the palette opens (the sidebar no longer lists them).
  useEffect(() => {
    if (!open) return;
    let alive = true;
    collaboration.rooms()
      .then((list) => { if (alive) setRooms(list); })
      .catch(() => { if (alive) setRooms(null); });
    return () => { alive = false; };
  }, [open]);

  // The archived conversations, read each time a search starts while the palette is open.
  const searching = open && query.trim() !== "";
  useEffect(() => {
    if (!searching) return;
    let alive = true;
    api.listThreads(true)
      .then((list) => { if (alive) setWithArchived(list); })
      .catch(() => {});
    return () => { alive = false; };
  }, [searching]);

  // As the sidebar's switcher does it (WorkspaceSwitcher.tsx): the account service moves the
  // selection, and the page reloads into that workspace where it was left.
  // Unsaved work on this page is checked first: the reload would lose it, or its prompt could call
  // the reload off after the account service had already moved to the other workspace.
  const switchTo = useCallback(async (target: Workspace) => {
    if (wouldAskBeforeLeaving(window)) {
      setSwitchError(t("palette.switchUnsaved"));
      return;
    }
    setSwitchPhase("selecting");
    setSwitchError(null);
    try {
      await selectWorkspace(target.id);
      setWorkspaceScope(target.id);
      noteRecent(target.id);
      setSwitchPhase("reloading");
      window.location.assign(lastPage(target.id, BASE_PATH || "/") ?? withBase("/"));
    } catch {
      setSwitchPhase("idle");
      setSwitchError(t("palette.switchFailed"));
    }
  }, [t]);

  const ctrl = apple ? "⌘" : t("palette.keyCtrl");

  // Every row closes the palette before it runs (runAt below), except those marked `stays`.
  const commands = useMemo<Command[]>(() => {
    const names = new Map((agents ?? []).map((agent) => [agent.id, agent.name]));
    const settingsWord = t("sidebar.settings");
    const list: Command[] = [];

    const waitingList = waitingEntries(waiting.items, waiting.rows);
    const waitingTotal = waiting.items?.length ?? 0;
    const { listed, seeAll } = waitingBrowse(waitingList.length, waitingTotal);
    waitingList.forEach((row, index) => {
      const name = row.agentId !== null ? names.get(row.agentId) : undefined;
      list.push({
        id: `w:${row.key}`,
        group: "waiting",
        label: t(row.labelKey),
        // Who asks, and what (design: "Atlas wants to use searxng_web_search", "Verde: weekly
        // content plan"); the line alone while the agent is not known.
        detail: row.tool && name
          ? t("approval.wantsToUse", { name, tool: row.tool })
          : name ? t("palette.agentSays", { name, text: row.line }) : row.line,
        keywords: [row.context, name, row.line].filter((word): word is string => Boolean(word)),
        // Past the first few, found by searching (the last row before typing is "See all").
        browse: index < listed,
        icon: row.agentId !== null
          ? <Avatar agentId={row.agentId} name={name} size="sm" className={FACE} />
          : WAITING_ICONS[row.kind] ?? <AlertTriangle size={16} strokeWidth={STROKE} />,
        run: () => push(row.href),
      });
    });
    if (seeAll) {
      // Today lists everything that waits; the count is the sidebar's band's.
      list.push({
        id: "w:all",
        group: "waiting",
        label: t("palette.seeAll"),
        detail: t("today.waiting.count", { count: waitingTotal }),
        keywords: [t("status.waiting"), t("sidebar.today")],
        icon: <Sun size={16} strokeWidth={STROKE} />,
        run: () => push(TODAY_HREF),
      });
    }
    for (const thread of recentThreads(threads)) {
      const name = thread.agent_id != null ? names.get(thread.agent_id) : undefined;
      // A routine's run by its routine's name, as in Recent; its whole title still matches a search.
      // Each run is a conversation of its own, so a run also says when it last moved, or every run
      // of one routine would read the same (the sidebar has its when-line for this).
      const title = threadName(thread.title);
      list.push({
        id: `t${thread.id}`,
        group: "recent",
        label: title.name || t("sidebar.untitled"),
        detail: [name ? t("palette.chatWith", { name }) : null, title.full ? formatMessageTime(thread.updated_at, t) : null].filter(Boolean).join(" · ") || undefined,
        keywords: [name, title.full].filter((word): word is string => Boolean(word)),
        icon: <MessageSquare size={16} strokeWidth={STROKE} />,
        run: () => push(`/chat/?thread=${thread.id}`),
      });
    }
    // Archived conversations: found by searching only, and said to be archived.
    const archivedWord = t("sidebar.archivedTag");
    for (const thread of archivedThreads(threads, withArchived)) {
      const name = thread.agent_id != null ? names.get(thread.agent_id) : undefined;
      const title = threadName(thread.title);
      list.push({
        id: `t${thread.id}`,
        group: "recent",
        label: title.name || t("sidebar.untitled"),
        detail: [name ? t("palette.chatWith", { name }) : null, title.full ? formatMessageTime(thread.updated_at, t) : null, archivedWord].filter(Boolean).join(" · "),
        keywords: [name, title.full].filter((word): word is string => Boolean(word)),
        browse: false,
        icon: <Archive size={16} strokeWidth={STROKE} />,
        run: () => push(`/chat/?thread=${thread.id}`),
      });
    }
    for (const agent of sidebarAgents(agents)) {
      list.push({
        id: `a${agent.id}`,
        group: "agents",
        label: t("palette.chatWith", { name: agent.name }),
        detail: agent.title?.trim() || undefined,
        keywords: [agent.name],
        icon: <Avatar agentId={agent.id} name={agent.name} size="sm" className={FACE} />,
        run: () => onNewChat(agent.id),
      });
    }
    for (const page of palettePages(admin)) {
      // Ctrl/Cmd+, opens Settings from any page (lib/settings-shortcut.ts).
      const keys = page.sequence ? ["G", page.sequence.toUpperCase()] : page.id === "settings" ? [ctrl, ","] : undefined;
      list.push({ id: `p:${page.id}`, group: "goto", label: t(PAGE_LABELS[page.id]), keys, browse: page.browse, icon: PAGE_ICONS[page.id], run: () => push(page.href) });
    }
    // Each settings page and section, found by searching (design: "Agent permissions · Settings").
    // The page's name is translated; its English name and summary still match a search. Agent
    // permissions is also the third "Go to" row before anything is typed, for an owner or admin.
    const pageName = (id: string) => t(`settingsNav.${id}`);
    for (const page of SETTINGS_PAGES) {
      list.push({
        id: `sp:${page.id}`,
        group: "goto",
        label: pageName(page.id),
        detail: settingsWord,
        keywords: [page.label, page.summary],
        browse: admin && page.id === "permissions",
        icon: <SlidersIcon size={16} />,
        run: () => push(page.href),
      });
    }
    for (const entry of SETTINGS_REGISTRY) {
      const page = SETTINGS_PAGES.find((item) => item.id === entry.page);
      list.push({
        id: `s:${entry.id}`,
        group: "goto",
        label: entry.title,
        detail: page ? `${settingsWord} · ${pageName(page.id)}` : settingsWord,
        keywords: [entry.section, ...entry.keywords],
        browse: false,
        icon: <SlidersIcon size={16} />,
        run: () => {
          push(settingsEntryHref(entry));
          window.dispatchEvent(new CustomEvent("settings:anchor", { detail: entry.anchorId }));
        },
      });
    }
    // Team & rooms (no longer in the sidebar's list): the team panel and each room, found by
    // searching; a new room for an owner or admin.
    if (teamPanel) {
      list.push({ id: "team", group: "goto", label: t("team.coordination"), keywords: [t("team.title")], browse: false, icon: <Users size={16} strokeWidth={STROKE} />, run: requestTeamPanel });
    }
    const roomWord = t("room.title");
    for (const room of rooms ?? []) {
      list.push({
        id: `r${room.id}`,
        group: "goto",
        label: room.name,
        detail: roomWord,
        keywords: [t("room.plural")],
        browse: false,
        icon: <Hash size={16} strokeWidth={STROKE} />,
        run: () => push(roomHref(room.id)),
      });
    }
    list.push({ id: "new", group: "actions", label: t("palette.newChat"), keys: ["G", NEW_CHAT_KEY.toUpperCase()], icon: <Plus size={16} strokeWidth={STROKE} />, run: () => onNewChat() });
    // Routines are for owners and admins, like the page; ?new=1 opens its new-routine form.
    if (admin) {
      list.push({ id: "new-routine", group: "actions", label: t("routines.new"), icon: <Repeat size={16} strokeWidth={STROKE} />, run: () => push(routinesHref({ kind: "new", agentId: null })) });
    }
    if (admin && rooms !== null) {
      list.push({ id: "new-room", group: "actions", label: t("room.new"), keywords: [t("room.plural")], browse: false, icon: <Plus size={16} strokeWidth={STROKE} />, run: () => push(roomHref("new")) });
    }
    const others = workspaces && workspaces.length > 1 ? arrange(workspaces, recentWorkspaces()).filter((workspace) => !workspace.active) : [];
    for (const workspace of others) {
      list.push({
        id: `ws:${workspace.id}`,
        group: "actions",
        label: t("palette.switchTo", { name: workspace.name }),
        detail: t(ROLE_LABELS[workspace.role]),
        keywords: [workspace.name],
        icon: <ArrowRightLeft size={16} strokeWidth={STROKE} />,
        stays: true,
        run: () => void switchTo(workspace),
      });
    }
    return list;
  }, [agents, threads, withArchived, waiting.items, waiting.rows, rooms, teamPanel, workspaces, admin, ctrl, onNewChat, push, switchTo, t]);

  const results = useMemo(() => arrangePalette(commands, query), [commands, query]);
  const sections = useMemo(() => {
    const out: { group: PaletteGroup; rows: { command: Command; index: number }[] }[] = [];
    results.forEach((command, index) => {
      const last = out[out.length - 1];
      if (last && last.group === command.group) last.rows.push({ command, index });
      else out.push({ group: command.group, rows: [{ command, index }] });
    });
    return out;
  }, [results]);

  // The first row is pinned by id as soon as the list shows, and again after each query change
  // (both clear activeId), so rows that arrive later (waiting rows, workspaces) do not move the
  // selection from under the person: Enter runs the row they saw selected. Set while rendering,
  // as React does for state derived from the previous render; it settles in one pass.
  if (open && activeId === null && results.length > 0) setActiveId(results[0].id);
  const found = results.findIndex((command) => command.id === activeId);
  const current = found >= 0 ? found : 0;
  const optionId = (index: number) => `${listId}-${index}`;

  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>(`[id="${listId}-${current}"]`)?.scrollIntoView({ block: "nearest" });
  }, [current, open, listId]);

  const runAt = (index: number) => {
    const command = results[index];
    if (!command || switching) return;
    if (!command.stays) {
      ran.current = true;
      setOpen(false);
    }
    command.run();
  };

  const moveTo = (index: number) => {
    if (results.length === 0) return;
    setActiveId(results[(index + results.length) % results.length].id);
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "ArrowDown") { event.preventDefault(); moveTo(current + 1); }
    else if (event.key === "ArrowUp") { event.preventDefault(); moveTo(current - 1); }
    else if (event.key === "Home") { event.preventDefault(); moveTo(0); }
    else if (event.key === "End") { event.preventDefault(); moveTo(results.length - 1); }
    else if (event.key === "Enter") { event.preventDefault(); runAt(current); }
  };

  return (
    <RadixDialog.Root open={open} onOpenChange={setOpen}>
      <RadixDialog.Portal>
        {/* The shared frosted scrim: the page dims and blurs a little behind the palette. */}
        <RadixDialog.Overlay className="fixed inset-0 z-40 animate-fade-in glass-scrim" />
        <RadixDialog.Content
          aria-describedby={undefined}
          onOpenAutoFocus={(event) => {
            opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
            event.preventDefault();
            inputRef.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (!ran.current) opener.current?.focus();
            ran.current = false;
          }}
          // Pressing a row, or any part that is not the field or the close button, keeps the
          // focus in the search field, so the arrows keep working.
          onMouseDown={(event) => {
            if (!(event.target instanceof Element && event.target.closest("input, button"))) event.preventDefault();
          }}
          // A floating panel of frosted glass (glass-strong: light edge and the soft float shadow, no
          // border; design rule 3). The list scrolls inside it; rows keep their solid fills. Near the
          // top so the phone keyboard leaves it room.
          className="fixed inset-x-4 top-[max(1rem,env(safe-area-inset-top))] z-50 mx-auto flex max-h-[calc(100dvh-2rem)] max-w-[640px] animate-pop-in flex-col overflow-hidden rounded-2xl glass-strong text-ink outline-none sm:top-24 sm:max-h-[calc(100dvh-7.5rem)]"
        >
          <RadixDialog.Title className="sr-only">{t("palette.dialogLabel")}</RadixDialog.Title>
          {/* The field draws no outline of its own: the row shows the focus line along its foot
              while the field has focus (Tab reaches Close; Shift+Tab comes back), and only the
              design's hairline while it does not. */}
          <div className="flex h-[52px] shrink-0 items-center gap-2.5 border-b border-line pl-4 pr-2 has-[input:focus-visible]:shadow-[inset_0_-2px_0_var(--focus)] touch:h-14">
            <Search size={18} strokeWidth={STROKE} aria-hidden="true" className="shrink-0 text-muted" />
            <label htmlFor={inputId} className="sr-only">{t("palette.searchLabel")}</label>
            <input
              id={inputId}
              ref={inputRef}
              type="text"
              role="combobox"
              aria-expanded="true"
              aria-controls={listId}
              aria-activedescendant={results.length > 0 ? optionId(current) : undefined}
              aria-autocomplete="list"
              autoComplete="off"
              spellCheck={false}
              placeholder={t("palette.searchPlaceholder")}
              value={query}
              onChange={(event) => { setQuery(event.target.value); setActiveId(null); }}
              onKeyDown={onKeyDown}
              className="h-10 min-w-0 flex-1 bg-transparent text-[16px] text-ink outline-none placeholder:text-faint touch:h-11"
            />
            <RadixDialog.Close
              aria-label={t("common.close")}
              aria-keyshortcuts="Escape"
              className="inline-flex h-9 min-w-9 shrink-0 cursor-pointer items-center justify-center rounded-field px-1.5 text-muted hover:bg-hover hover:text-ink touch:size-11"
            >
              <Kbd className={cn(KEY_CAP, "touch:hidden")}>Esc</Kbd>
              <X size={18} strokeWidth={STROKE} aria-hidden="true" className="hidden touch:block" />
            </RadixDialog.Close>
          </div>

          {switching && <p role="status" className="shrink-0 px-4 pt-2 text-small text-muted">{t("palette.switching")}</p>}
          {switchError && <p role="alert" className="shrink-0 px-4 pt-2 text-small text-danger">{switchError}</p>}

          <div
            ref={listRef}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-2 pt-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            <div id={listId} role="listbox" aria-label={t("palette.resultsLabel")} className="flex flex-col gap-1">
              {sections.map((section) => (
                <div key={section.group} role="group" aria-label={t(GROUP_LABELS[section.group])} className="flex flex-col gap-0.5">
                  {/* A group label like the others (design): each row below says what waits. */}
                  <div aria-hidden="true" className="px-2.5 pb-1 pt-2 text-small font-medium text-muted">
                    {t(GROUP_LABELS[section.group])}
                  </div>
                  {section.rows.map(({ command, index }) => {
                    const selected = index === current;
                    const keys = command.keys ?? (selected ? ["Enter"] : undefined);
                    return (
                      <div
                        key={command.id}
                        id={optionId(index)}
                        role="option"
                        aria-selected={selected}
                        onMouseMove={() => { if (!selected) setActiveId(command.id); }}
                        onClick={() => runAt(index)}
                        className={cn(
                          "flex h-10 cursor-pointer items-center gap-2.5 rounded-field px-2.5 text-body touch:h-11",
                          selected && "bg-inset",
                        )}
                      >
                        <span aria-hidden="true" className="inline-flex w-[22px] shrink-0 justify-center text-muted">{command.icon}</span>
                        <span className="max-w-[65%] shrink-0 truncate font-medium">{command.label}</span>
                        <span className="min-w-0 flex-1 truncate text-small text-muted">{command.detail}</span>
                        {keys && (
                          <span aria-hidden="true" className="inline-flex shrink-0 gap-1 text-muted touch:hidden">
                            {keys.map((key) => <Kbd key={key} className={KEY_CAP}>{key}</Kbd>)}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
            {results.length === 0 && <p className="px-3 py-6 text-center text-body text-muted">{t("palette.empty")}</p>}
          </div>

          <div className="flex shrink-0 flex-wrap gap-x-4 gap-y-1 border-t border-line px-4 py-2.5 text-small text-muted touch:hidden">
            <span className="inline-flex items-center gap-1.5">
              <Kbd className={KEY_CAP}>↑</Kbd>
              <Kbd className={KEY_CAP}>↓</Kbd>
              {t("palette.move")}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Kbd className={KEY_CAP}>Enter</Kbd>
              {t("palette.run")}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Kbd className={KEY_CAP}>{ctrl}</Kbd>
              <Kbd className={KEY_CAP}>K</Kbd>
              {t("palette.openAnywhere")}
            </span>
          </div>
          <p role="status" className="sr-only">{query.trim() ? t("palette.resultCount", { n: results.length }) : ""}</p>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
