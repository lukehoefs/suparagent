"use client";

import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { useT } from "@/lib/use-i18n";
import { saveBarState } from "./save-bar-state";
import { SavedConfirmation } from "./SavedConfirmation";

export function SaveBar({
  dirty,
  saving,
  error,
  saved,
  canSave = true,
  onSave,
  onDiscard,
  saveLabel,
}: {
  dirty: boolean;
  saving: boolean;
  error: string | null;
  saved: boolean;
  canSave?: boolean;
  onSave: () => void;
  onDiscard: () => void;
  saveLabel?: string;
}) {
  const t = useT();
  const state = saveBarState({ dirty, saving, error, saved });
  if (state === "idle") return null;

  const status = state === "saving"
    ? t("settingsPage.saving")
    : state === "error"
      ? error
        : state === "dirty"
          ? t("settingsPage.unsaved")
          : null;

  // Slimmer on a phone: less padding and one line, the short status word giving way to the buttons.
  // An error keeps its whole sentence and wraps.
  return (
    <div className={cn("flex flex-wrap items-center gap-2 rounded-md border border-line bg-inset p-2 sm:p-3", state !== "error" && "max-sm:flex-nowrap")} data-save-state={state}>
      {state === "saved" ? <SavedConfirmation visible /> : state === "error" ? <p role="alert" className="min-w-0 flex-1 text-xs text-danger">{status}</p> : <p className="min-w-0 flex-1 truncate text-xs text-muted">{status}</p>}
      <Button type="button" variant="primary" disabled={!dirty || saving || !canSave} loading={saving} onClick={onSave}>
        {saving ? t("settingsPage.saving") : saveLabel ?? t("settingsPage.save")}
      </Button>
      <Button type="button" disabled={!dirty || saving} onClick={onDiscard}>{t("settingsPage.discard")}</Button>
    </div>
  );
}
