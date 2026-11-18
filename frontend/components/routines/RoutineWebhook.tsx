"use client";

// A routine's webhook (POST /routines/{id}/webhook, DELETE to turn it off): another service starts
// the routine with a POST and the routine's own secret. The secret is shown once, when it is made;
// only its hash is stored. A run started this way still asks before every tool use.
import { Copy } from "lucide-react";
import { useState } from "react";
import { api, type Routine } from "@/lib/api";
import { copyToClipboard } from "@/lib/clipboard";
import { curlExample, routineStatus, webhookUrl } from "@/lib/routines";
import { useT } from "@/lib/use-i18n";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { IconButton } from "@/components/ui/IconButton";
import { StatusText } from "@/components/ui/StatusPill";
import { useToast } from "@/components/ui/Toast";
import { useErrorText } from "./shared";

type Confirm = "rotate" | "disable" | null;

export function RoutineWebhook({ routine, onChange }: { routine: Routine; onChange: (routine: Routine) => void }) {
  const t = useT();
  const toast = useToast();
  const errorText = useErrorText();
  const [secret, setSecret] = useState<{ url: string; secret: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const on = routine.webhook_enabled;

  const enable = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await api.enableRoutineWebhook(routine.id);
      setSecret({ url: webhookUrl(result.path), secret: result.secret });
      onChange(result.routine);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  const disable = async () => {
    setBusy(true);
    setError(null);
    try {
      onChange(await api.disableRoutineWebhook(routine.id));
      setSecret(null);
      toast(t("routines.webhook.disabled", { name: routine.name }));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  const copy = async (text: string) => {
    if (await copyToClipboard(text)) toast(t("routines.toast.copied"));
    else toast(t("routines.toast.copyFailed"), "danger");
  };

  return (
    <div className="flex flex-col gap-4">
      <StatusText status={on ? "done" : "idle"} className="text-label font-medium">
        {on ? t("agentAutomation.routine.webhookOn") : t("routines.webhook.off")}
      </StatusText>
      <p className="text-small text-muted">{t("routines.webhook.about")}</p>
      {on && routineStatus(routine) === "off" && <p className="text-small text-muted">{t("routines.webhook.paused")}</p>}
      {error && <Banner tone="danger" onDismiss={() => setError(null)}>{error}</Banner>}

      {secret ? (
        <div className="flex flex-col gap-3 rounded-field border border-warning-line bg-warning-bg/40 p-3">
          <p className="text-label font-semibold text-ink">{t("knowledgeRoutines.copySecretOnce")}</p>
          <SecretLine label={t("routines.webhook.address")} copyLabel={t("routines.webhook.copyAddress")} value={secret.url} onCopy={copy} />
          <SecretLine label={t("routines.webhook.secret")} copyLabel={t("routines.webhook.copySecret")} value={secret.secret} onCopy={copy} />
          <SecretLine label={t("routines.webhook.example")} copyLabel={t("routines.webhook.copyExample")} value={curlExample(secret.url, secret.secret)} onCopy={copy} block />
          <Button className="self-start" onClick={() => setSecret(null)}>{t("routines.webhook.done")}</Button>
        </div>
      ) : on ? (
        <p className="text-small text-muted">{t("routines.webhook.hidden")}</p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {on ? (
          <>
            <Button onClick={() => setConfirm("rotate")} disabled={busy}>{t("routines.webhook.rotate")}</Button>
            <Button variant="ghost" className="text-danger" onClick={() => setConfirm("disable")} disabled={busy}>{t("routines.webhook.disable")}</Button>
          </>
        ) : (
          <Button onClick={() => void enable()} loading={busy}>{t("routines.webhook.enable")}</Button>
        )}
      </div>

      <ConfirmDialog
        open={confirm === "rotate"}
        onOpenChange={(open) => { if (!open && !busy) setConfirm(null); }}
        title={t("routines.webhook.rotateTitle")}
        description={t("routines.webhook.rotateBody")}
        confirmLabel={t("routines.webhook.rotateConfirm")}
        cancelLabel={t("routines.cancel")}
        loading={busy}
        onConfirm={() => void enable()}
      />
      <ConfirmDialog
        open={confirm === "disable"}
        onOpenChange={(open) => { if (!open && !busy) setConfirm(null); }}
        title={t("routines.webhook.disableTitle")}
        description={t("routines.webhook.disableBody")}
        confirmLabel={t("routines.webhook.disableConfirm")}
        cancelLabel={t("routines.cancel")}
        danger
        loading={busy}
        onConfirm={() => void disable()}
      />
    </div>
  );
}

function SecretLine({
  label,
  copyLabel,
  value,
  onCopy,
  block = false,
}: {
  label: string;
  copyLabel: string;
  value: string;
  onCopy: (text: string) => void;
  block?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-small font-medium text-muted">{label}</span>
      <div className="flex min-w-0 items-start gap-1">
        {block ? (
          <pre className="min-w-0 flex-1 whitespace-pre-wrap break-all rounded-inner bg-raised p-2 font-mono text-small text-ink">{value}</pre>
        ) : (
          <code className="min-w-0 flex-1 break-all rounded-inner bg-raised px-2 py-1.5 font-mono text-small text-ink">{value}</code>
        )}
        <IconButton label={copyLabel} onClick={() => onCopy(value)}>
          <Copy size={15} strokeWidth={1.7} aria-hidden="true" />
        </IconButton>
      </div>
    </div>
  );
}
