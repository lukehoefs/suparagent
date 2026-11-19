"use client";

import { Select } from "@/components/ui/Select";

import { useEffect, useState, type ReactNode } from "react";
import { api, ApiError, type ListedRule } from "@/lib/api";
import { isConversationAllow } from "@/lib/approval-card";
import { ruleSummary } from "@/lib/approval-rules";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { BUTTON, FIELD, FIELD_BOX } from "./styles";
import { SaveBar } from "@/components/settings/SaveBar";
import { SavedConfirmation, useSavedConfirmation } from "@/components/settings/SavedConfirmation";
import { LANGUAGE_TAGS } from "@/lib/i18n";
import { useLanguageChoice, useT } from "@/lib/use-i18n";

// Where the command goes in a rule's sentence, so it can be set in monospace in any word order.
const COMMAND_MARK = "\u0000";

// The saved "always allow" rules for shell commands, and the allows given on a request for one
// conversation ("Allow for 1 hour", "Always in this chat"): list, add (saved rules only) and remove.
// Each row is one plain sentence ("Always allow git status in folder site"), with the full command
// folded away under it; Remove asks first.
// With a `workspace`, it starts on what applies in that conversation: the rules for its folder and,
// with a `threadId`, that conversation's own allows.
export function ApprovalRules({
  workspace = null,
  threadId = null,
}: {
  workspace?: string | null;
  threadId?: number | null;
}) {
  const t = useT();
  const language = useLanguageChoice();
  const [rules, setRules] = useState<ListedRule[] | null>(null);
  const [onlyHere, setOnlyHere] = useState(workspace !== null);
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [match, setMatch] = useState<"exact" | "prefix">("exact");
  const [command, setCommand] = useState("");
  const [folder, setFolder] = useState(workspace ?? "");
  const [formBaseline, setFormBaseline] = useState<{ match: "exact" | "prefix"; folder: string }>({ match: "exact", folder: workspace ?? "" });
  const [saveError, setSaveError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<ListedRule | null>(null);
  const confirmation = useSavedConfirmation();

  useEffect(() => {
    let cancelled = false;
    api
      .listApprovalRules(onlyHere ? workspace : null, onlyHere ? threadId : null)
      .then((list) => {
        if (!cancelled) {
          setRules(list);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : t("approvals.loadError"));
      });
    return () => {
      cancelled = true;
    };
  }, [onlyHere, workspace, threadId, tick, t]);

  // What a row is called (Remove's label): its command, or for an allow that covers a whole tool,
  // what the card called the tool.
  const nameOf = (rule: ListedRule): string => (isConversationAllow(rule) ? rule.command ?? rule.label ?? rule.tool : rule.command);

  // The row's sentence, with the (shortened) command in monospace.
  const sentence = (rule: ListedRule): ReactNode => {
    const summary = ruleSummary(rule, (iso) => new Date(iso).toLocaleTimeString(LANGUAGE_TAGS[language], { hour: "2-digit", minute: "2-digit" }));
    const text = t(summary.key, { ...summary.params, command: COMMAND_MARK });
    const at = text.indexOf(COMMAND_MARK);
    if (at < 0 || summary.command === null) return text;
    return <>{text.slice(0, at)}<code className="rounded bg-inset px-1 font-mono">{summary.command}</code>{text.slice(at + COMMAND_MARK.length)}</>;
  };

  const run = async (action: () => Promise<unknown>, then?: () => void) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      then?.();
      confirmation.showSaved("rules");
      setTick((n) => n + 1);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("common.operationError"));
    } finally {
      setBusy(false);
    }
  };

  const add = (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSaveError(null);
    void api.addApprovalRule({ match, command: command.trim(), workspace: folder.trim() || null })
      .then(() => {
        setCommand("");
        setFormBaseline({ match, folder });
        confirmation.showSaved("rules");
        setTick((n) => n + 1);
      })
      .catch((err: unknown) => setSaveError(err instanceof ApiError ? err.message : t("common.operationError")))
      .finally(() => setBusy(false));
  };
  const dirty = command.trim() !== "" || match !== formBaseline.match || folder !== formBaseline.folder;
  const discard = () => {
    setCommand("");
    setMatch(formBaseline.match);
    setFolder(formBaseline.folder);
    setSaveError(null);
    confirmation.clearSaved("rules");
  };

  return (
    <div className="space-y-4 text-sm">
      <p className="text-xs text-muted">{t("approvalCard.rulesExplanation")}</p>
      {workspace !== null && (
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={onlyHere} onChange={(e) => setOnlyHere(e.target.checked)} />
          {threadId !== null ? t("approvalCard.onlyHere") : t("approvals.onlyThisFolder")}
        </label>
      )}
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
      {rules === null && !error && <p className="text-xs text-muted">{t("approvals.loading")}</p>}
      {rules !== null && rules.length === 0 && (
        <p className="rounded-md bg-inset px-3 py-3 text-xs text-muted">{onlyHere ? t("approvalCard.rulesEmptyHere") : t("approvalCard.rulesEmpty")}</p>
      )}
      {rules !== null && rules.length > 0 && (
        <ul className="divide-y divide-line rounded-md border border-line">
          {rules.map((rule) => (
            <li key={rule.id} className="flex items-start gap-3 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-xs text-ink [overflow-wrap:anywhere]">{sentence(rule)}</p>
                {/* The exact command (and the whole folder path), folded away until asked for. */}
                {rule.command && (
                  <details className="mt-1">
                    <summary className="w-fit cursor-pointer select-none text-xs text-muted hover:text-ink">{t("approvalRules.showCommand")}</summary>
                    <pre className="mt-1 whitespace-pre-wrap break-all rounded-field bg-inset px-2 py-1.5 font-mono text-xs text-ink">{rule.command}</pre>
                    {rule.workspace && (
                      <p className="mt-1 text-xs text-muted">
                        {t("approvalRules.folder")} <span className="break-all font-mono text-ink">{rule.workspace}</span>
                      </p>
                    )}
                  </details>
                )}
              </div>
              <button
                className={BUTTON}
                disabled={busy}
                aria-label={t("approvals.removeRule", { command: nameOf(rule) })}
                onClick={() => setRemoving(rule)}
              >
                {t("approvals.remove")}
              </button>
            </li>
          ))}
        </ul>
      )}
      <form id="approval-add-form" onSubmit={add} className="space-y-2 rounded-md border border-line p-3">
        <p className="text-xs font-medium">{t("approvals.addRule")}</p>
        <div className="flex gap-2">
          <Select
            aria-label={t("approvals.matchLabel")}
            value={match}
            onChange={(e) => { setMatch(e.target.value === "prefix" ? "prefix" : "exact"); setSaveError(null); confirmation.clearSaved("rules"); }}
            className={`${FIELD_BOX} w-36 shrink-0`}
          >
            <option value="exact">{t("approvals.exactly")}</option>
            <option value="prefix">{t("approvals.startsWith")}</option>
          </Select>
          <input
            aria-label={t("approvals.command")}
            className={`${FIELD} font-mono`}
            placeholder={match === "prefix" ? "git status" : "npm test"}
            value={command}
            onChange={(e) => { setCommand(e.target.value); setSaveError(null); confirmation.clearSaved("rules"); }}
            maxLength={1000}
            spellCheck={false}
            autoComplete="off"
          />
        </div>
        <input
          aria-label={t("approvals.folder")}
          className={`${FIELD} font-mono`}
          placeholder={t("approvals.folderPlaceholder")}
          value={folder}
          onChange={(e) => { setFolder(e.target.value); setSaveError(null); confirmation.clearSaved("rules"); }}
          spellCheck={false}
          autoComplete="off"
        />
        <SaveBar
          dirty={dirty}
          saving={busy}
          error={saveError}
          saved={false}
          canSave={Boolean(command.trim())}
          saveLabel={t("approvals.addRule")}
          onSave={() => {
            const form = document.getElementById("approval-add-form");
            if (form instanceof HTMLFormElement) form.requestSubmit();
          }}
          onDiscard={discard}
        />
      </form>
      <SavedConfirmation visible={confirmation.saved.has("rules")} />
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => { if (!open && !busy) setRemoving(null); }}
        title={t("approvalRules.removeTitle")}
        description={t("approvalRules.removeBody")}
        confirmLabel={t("approvalRules.removeConfirm")}
        cancelLabel={t("common.cancel")}
        danger
        loading={busy}
        onConfirm={() => {
          const rule = removing;
          if (rule) void run(() => api.deleteApprovalRule(rule.id, threadId)).finally(() => setRemoving(null));
        }}
      >
        {removing && <p className="rounded-field bg-inset px-3 py-2 text-sm text-ink [overflow-wrap:anywhere]">{sentence(removing)}</p>}
      </ConfirmDialog>
    </div>
  );
}
