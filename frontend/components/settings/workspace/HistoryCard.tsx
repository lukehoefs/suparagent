"use client";

import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import { people, type AuditRow } from "@/lib/people";
import { useT } from "@/lib/use-i18n";
import { auditKey } from "@/lib/workspace-settings";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { SkeletonList } from "@/components/ui/Skeleton";
import { SettingsCard } from "../SettingsCard";
import { useDateFormat } from "./shared";

// Who invited, joined, changed or removed whom (GET /people/audit, admin). Read when opened, and
// again after a change on this page while it is open (refreshKey).
export function HistoryCard({ refreshKey }: { refreshKey: number }) {
  const t = useT();
  const when = useDateFormat(true);
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    people.audit()
      .then((list) => { if (alive) { setRows(list); setError(null); } })
      .catch((err: unknown) => { if (alive) setError(err instanceof ApiError ? err.message : t("members.historyFailed")); });
    return () => { alive = false; };
  }, [open, refreshKey, t]);

  return (
    <SettingsCard
      title={t("members.historyTitle")}
      description={t("members.historyDescription")}
      action={<Button aria-expanded={open} data-setting-focus="setting-members-history" onClick={() => setOpen((value) => !value)}>{open ? t("members.hideHistory") : t("members.showHistory")}</Button>}
    >
      {open ? (
        error ? <Banner tone="danger">{error}</Banner>
          : rows === null ? <SkeletonList rows={3} />
            : rows.length === 0 ? <p className="text-small text-muted">{t("members.historyEmpty")}</p>
              : (
                <ul className="flex flex-col">
                  {rows.map((row) => {
                    const key = auditKey(row.action);
                    const actor = row.actor || t("members.someone");
                    return (
                      <li key={row.id} className="border-b border-line py-2 text-body text-ink last:border-b-0">
                        <span className="break-words">{key ? t(key, { actor, subject: row.subject }) : `${actor} · ${row.action} · ${row.subject}`}</span>
                        {row.detail && <span className="text-muted"> ({row.detail})</span>}
                        <span className="block text-small text-muted">{when(row.at)}</span>
                      </li>
                    );
                  })}
                </ul>
              )
      ) : null}
    </SettingsCard>
  );
}
