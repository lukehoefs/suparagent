"use client";

// MCP servers and plugins that are not columns right now (they need a sign-in, a test or a token, are
// someone else's, or could not be read), each with its state in words and a dot, and where to fix it.
import Link from "next/link";
import { toolErrorKey } from "@/lib/agent-tools";
import { useT } from "@/lib/use-i18n";
import { StatusText, type Status } from "@/components/ui/StatusPill";
import { Card } from "@/components/ui/Surface";
import type { SourceNote } from "./load";

const STATUS: Record<SourceNote["reason"], Status> = {
  needs_sign_in: "waiting",
  not_tested: "waiting",
  needs_token: "waiting",
  unreachable: "denied",
  load_failed: "denied",
  private: "idle",
};

const KEYS: Record<SourceNote["reason"], string> = {
  needs_sign_in: "permissions.notes.needsSignIn",
  not_tested: "permissions.notes.notTested",
  needs_token: "permissions.notes.needsToken",
  unreachable: "permissions.notes.unreachable",
  load_failed: "permissions.notes.loadFailed",
  private: "permissions.notes.private",
};

export function SourceNotes({ notes }: { notes: SourceNote[] }) {
  const t = useT();
  if (!notes.length) return null;
  const detail = (note: SourceNote) => {
    if (note.reason === "private") return note.person ? t("permissions.notes.privateBy", { person: note.person }) : null;
    if (note.reason !== "load_failed") return null;
    const key = toolErrorKey(note.error);
    return key ? t(key) : note.error instanceof Error && note.error.message ? note.error.message : null;
  };
  return (
    <Card className="flex flex-col gap-3">
      <div>
        <h3 className="text-label font-semibold text-ink">{t("permissions.notes.title")}</h3>
        <p className="mt-0.5 text-small text-muted">{t("permissions.notes.intro")}</p>
      </div>
      <ul className="flex flex-col gap-2 text-label">
        {notes.map((note) => {
          const more = detail(note);
          return (
            <li key={`${note.kind}:${note.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
              <span className="font-medium text-ink">{note.name}</span>
              <span className="text-small text-muted">{t(note.kind === "server" ? "permissions.notes.server" : "permissions.notes.plugin")}</span>
              <StatusText status={STATUS[note.reason]}>{t(KEYS[note.reason])}</StatusText>
              {more ? <span className="basis-full text-small text-muted">{more}</span> : null}
            </li>
          );
        })}
      </ul>
      <p className="text-small">
        <Link href="/apps/" className="text-accent-text underline underline-offset-2">{t("permissions.notes.manageServers")}</Link>
      </p>
    </Card>
  );
}
