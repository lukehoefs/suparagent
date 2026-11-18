"use client";

import { useT } from "@/lib/use-i18n";

// When a setting takes effect. The usual moments are translated; anything else is shown as given.
const WHEN: Record<string, string> = {
  immediately: "settingsPage.applies.now",
  now: "settingsPage.applies.now",
  next_run: "settingsPage.applies.nextTurn",
  "next turn": "settingsPage.applies.nextTurn",
  restart: "settingsPage.applies.restart",
  "after restart": "settingsPage.applies.restart",
  "new conversations": "settingsPage.applies.newConversations",
  "new approvals": "settingsPage.applies.newApprovals",
  "new chats": "settingsPage.applies.newChats",
};

export function Applies({ when }: { when: string }) {
  const t = useT();
  const key = WHEN[when.trim().toLocaleLowerCase()];
  return <span className="rounded bg-inset px-2 py-1 text-xs text-muted">{t("settingsPage.applies", { when: key ? t(key) : when })}</span>;
}
