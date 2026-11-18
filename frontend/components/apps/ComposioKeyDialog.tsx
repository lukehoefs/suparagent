"use client";

// The owner's Composio project key: add it, replace it, or remove it. The key is typed by the owner,
// checked with Composio by the backend and stored encrypted; it is never shown again, never put in
// the address, and this dialog forgets it once it is sent.
import { useState, type FormEvent } from "react";
import type { Problem } from "@/lib/apps-page";
import { useT } from "@/lib/use-i18n";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field, Input } from "@/components/ui/Input";
import { ProblemBanner } from "./shared";
import type { Composio } from "./useComposio";

const MIN_KEY = 11;

export function ComposioKeyDialog({ composio, onClose }: { composio: Composio; onClose: () => void }) {
  const t = useT();
  const [draft, setDraft] = useState("");
  const [problem, setProblem] = useState<Problem | null>(null);
  const [removing, setRemoving] = useState(false);
  const busy = composio.busy === "key";
  const configured = composio.configured;

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (draft.trim().length < MIN_KEY) return;
    setProblem(null);
    const failure = await composio.saveKey(draft);
    setDraft("");
    if (failure) setProblem(failure);
    else onClose();
  };

  const remove = async () => {
    setProblem(null);
    const failure = await composio.removeKey();
    if (failure) setProblem(failure);
    else onClose();
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => { if (!open && !busy) onClose(); }}
      title={t(configured ? "apps.key.title" : "apps.key.titleNew")}
      description={t(configured ? "apps.key.configured" : "apps.key.body")}
      size="md"
    >
      <div className="flex flex-col gap-4">
        {problem && <ProblemBanner problem={problem} onDismiss={() => setProblem(null)} />}
        <form onSubmit={(event) => void save(event)} className="flex flex-col gap-3">
          <Field label={t(configured ? "apps.key.replaceLabel" : "apps.key.label")} hint={t("apps.key.hint")}>
            {(props) => (
              <Input {...props} type="password" value={draft} disabled={busy} required minLength={MIN_KEY} autoComplete="off" spellCheck={false}
                placeholder="ak_…" onChange={(event) => setDraft(event.target.value)} />
            )}
          </Field>
          <div className="flex flex-wrap justify-end gap-2">
            <Button disabled={busy} onClick={onClose}>{t("common.cancel")}</Button>
            <Button type="submit" variant="primary" loading={busy && !removing} disabled={busy || draft.trim().length < MIN_KEY}>
              {busy && !removing ? t("apps.key.checking") : t(configured ? "apps.key.replace" : "apps.key.save")}
            </Button>
          </div>
        </form>
        {configured && (
          <div className="flex flex-col gap-2 border-t border-line pt-4">
            {removing ? (
              <>
                <p className="text-body text-ink">{t("apps.key.removeConfirm")}</p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="danger" loading={busy} onClick={() => void remove()}>{t("apps.key.remove")}</Button>
                  <Button disabled={busy} onClick={() => setRemoving(false)}>{t("apps.app.keep")}</Button>
                </div>
              </>
            ) : (
              <div>
                <Button variant="ghost" className="text-muted hover:text-ink" disabled={busy} onClick={() => setRemoving(true)}>{t("apps.key.remove")}</Button>
              </div>
            )}
          </div>
        )}
      </div>
    </Dialog>
  );
}
