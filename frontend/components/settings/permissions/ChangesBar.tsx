"use client";

// The sticky bar under the matrix while there are changes (design: Permissions.html): how many changes
// across how many agents, why Save is held back when it is, and Discard, Review and Save. A floating
// panel: shadow, no border.
import { forwardRef } from "react";
import { useT } from "@/lib/use-i18n";
import { Button } from "@/components/ui/Button";
import { StatusText } from "@/components/ui/StatusPill";
import { usePlural } from "./shared";

export const ChangesBar = forwardRef<HTMLButtonElement, {
  changes: number;
  agents: number;
  // Changes that did not save last time and are still pending.
  failed: number;
  // Why Save is held back: an agent past the skill limit (Save is off until it is fixed).
  overLimit: string | null;
  saving: boolean;
  reviewOpen: boolean;
  reviewId: string;
  onDiscard: () => void;
  onReview: () => void;
  onSave: () => void;
}>(function ChangesBar({ changes, agents, failed, overLimit, saving, reviewOpen, reviewId, onDiscard, onReview, onSave }, reviewRef) {
  const t = useT();
  const plural = usePlural();
  return (
    <div className="pointer-events-auto flex w-full max-w-full flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-card bg-raised py-2.5 pl-4 pr-3 shadow-float sm:w-auto">
      {/* One live region for the count, a failed save and the skill limit, so each is announced. */}
      <div role="status" className="flex min-w-0 flex-col gap-0.5">
        <p className="font-medium text-ink">
          {saving ? t("permissions.bar.saving") : `${plural("permissions.bar.changes", changes)} · ${plural("permissions.bar.agents", agents)}`}
        </p>
        {failed > 0 && !saving ? <StatusText status="denied">{plural("permissions.bar.failed", failed)}</StatusText> : null}
        {overLimit && !saving ? <StatusText status="waiting">{overLimit}</StatusText> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" onClick={onDiscard} disabled={saving}>{t("permissions.bar.discard")}</Button>
        <Button ref={reviewRef} onClick={onReview} disabled={saving} aria-expanded={reviewOpen} aria-controls={reviewOpen ? reviewId : undefined}>
          {reviewOpen ? t("permissions.bar.hideReview") : t("permissions.bar.review")}
        </Button>
        <Button variant="primary" onClick={onSave} loading={saving} disabled={overLimit !== null}>
          {t("permissions.bar.save")}
        </Button>
      </div>
    </div>
  );
});
