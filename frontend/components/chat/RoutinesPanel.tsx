"use client";

// The Routines dialog moved to its own page: /routines/ (components/routines/RoutinesPage.tsx,
// design: Routines.html), which lists, creates, edits, runs and deletes routines and shows their
// runs and webhooks. Everything in the chat that still opens the dialog (the sidebar's Routines
// item, the planner's routines link, /chat/?view=routines and ?routine= links in notifications,
// Today and settings) lands here and goes on to the page: on that routine's runs when one is named,
// as the dialog did.
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import type { Agent } from "@/lib/api";
import { legacyRoutinesHref } from "@/lib/routines-page";

export function RoutinesPanel({ routineId = null }: { agents: Agent[]; onClose: () => void; routineId?: number | null }) {
  const router = useRouter();
  const params = useSearchParams();
  const sent = useRef(false);
  // An address that named the view is replaced, so Back does not bounce through it; a button
  // that opened the dialog is a step forward, so Back returns to the conversation.
  const fromAddress = params.get("view") === "routines";
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    const href = legacyRoutinesHref(routineId);
    if (fromAddress) router.replace(href);
    else router.push(href);
  }, [router, routineId, fromAddress]);
  return null;
}
