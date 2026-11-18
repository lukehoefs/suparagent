"use client";

import { useT } from "@/lib/use-i18n";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Dialog } from "@/components/ui/Dialog";
import { Field, Input } from "@/components/ui/Input";

// An audio or podcast link for the next message, and the consent to send audio for transcription
// (it covers attached audio files too). Opened from the composer's attach menu; what it holds is
// sent with the next message, as the link that used to sit above the composer was.
export function AudioLinkDialog({
  open,
  onOpenChange,
  url,
  onUrlChange,
  consent,
  onConsentChange,
  capability,
  disabled = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  url: string;
  onUrlChange: (url: string) => void;
  consent: boolean;
  onConsentChange: (consent: boolean) => void;
  // What the backend can transcribe with, and how long it keeps audio; null while unknown.
  capability: { provider_label: string; available: boolean; retention: string } | null;
  disabled?: boolean;
}) {
  const t = useT();
  const provider = capability?.provider_label ?? "OpenAI";
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("chat.audioLink")}
      description={t("chat.audioFormats")}
      size="sm"
      footer={
        <>
          {url.trim() && (
            <Button variant="ghost" className="mr-auto text-muted hover:text-ink" disabled={disabled} onClick={() => { onUrlChange(""); onConsentChange(false); }}>
              {t("chatPage.audioRemove")}
            </Button>
          )}
          <Button variant="primary" onClick={() => onOpenChange(false)}>{t("chatPage.audioDone")}</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label={t("chat.directAudioUrl")}>
          {(field) => (
            <Input
              {...field}
              type="url"
              value={url}
              onChange={(event) => { onUrlChange(event.target.value); onConsentChange(false); }}
              placeholder="https://example.com/episode.mp3"
              disabled={disabled}
            />
          )}
        </Field>
        <p className="text-small text-muted">{capability?.available ? capability.retention : t("chat.audioUnavailable")}</p>
        <Checkbox
          checked={consent}
          onChange={(event) => onConsentChange(event.target.checked)}
          disabled={disabled || !capability?.available}
          label={t("chat.audioConsent", { provider })}
        />
        <p className="text-small text-muted">{t("chat.transcriptCaveat")}</p>
      </div>
    </Dialog>
  );
}
