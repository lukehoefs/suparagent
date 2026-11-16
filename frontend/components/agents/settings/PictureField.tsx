"use client";

// The agent's picture, at the top of the Profile tab's Identity section. Admin only, like the
// avatar routes. Upload, Generate and Remove are saved at once, apart from the form's Save; every
// avatar of the agent (header, sidebar, roster, chats) updates through AvatarPictures.ts.
import { ImagePlus, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api, ApiError, type Agent } from "@/lib/api";
import { squareCrop } from "@/lib/agent-pictures";
import { PROMPT_MAX, pickProvider, type GeneratedImage, type ImageProvider } from "@/lib/image-gen";
import { useT } from "@/lib/use-i18n";
import { useAppShell } from "@/components/shell/AppShell";
import { Avatar } from "@/components/ui/Avatar";
import { forgetAgentPicture, refreshAgentPicture, useAgentPictureState } from "@/components/ui/AvatarPictures";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Dialog } from "@/components/ui/Dialog";
import { Field, Select, Textarea } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";

class UnreadablePicture extends Error {}

// The largest centred square of the picked file, at most 512 px a side, so the stored picture is
// small whatever the camera made. WebP where the browser can write it, else PNG; the server
// checks the bytes either way.
async function squarePicture(file: File): Promise<{ blob: Blob; name: string }> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new UnreadablePicture();
  }
  try {
    const crop = squareCrop(bitmap.width, bitmap.height);
    if (crop.side === 0) throw new UnreadablePicture();
    const canvas = document.createElement("canvas");
    canvas.width = crop.side;
    canvas.height = crop.side;
    const context = canvas.getContext("2d");
    if (!context) throw new UnreadablePicture();
    context.drawImage(bitmap, crop.sx, crop.sy, crop.size, crop.size, 0, 0, crop.side, crop.side);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.9));
    if (!blob) throw new UnreadablePicture();
    const ext = blob.type === "image/webp" ? "webp" : blob.type === "image/jpeg" ? "jpg" : "png";
    return { blob, name: `picture.${ext}` };
  } finally {
    bitmap.close();
  }
}

export function PictureField({ agent, name }: { agent: Agent; name: string }) {
  const t = useT();
  const toast = useToast();
  const { refreshAgents } = useAppShell();
  const state = useAgentPictureState(agent.id);
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"upload" | "remove" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const upload = async (file: File | undefined) => {
    if (input.current) input.current.value = "";
    if (!file) return;
    setBusy("upload");
    setError(null);
    try {
      const square = await squarePicture(file);
      await api.uploadAgentAvatar(agent.id, square.blob, square.name);
      refreshAgentPicture(agent.id);
      refreshAgents();
      toast(t("agentProfile.picture.saved"));
    } catch (err) {
      if (err instanceof UnreadablePicture || (err instanceof ApiError && err.code === "not_an_image")) setError(t("agentProfile.picture.unreadable"));
      else if (err instanceof ApiError && err.code === "too_large") setError(t("agentProfile.picture.tooLarge"));
      else setError(err instanceof Error ? err.message : t("agentSettings.actionFailed"));
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    setBusy("remove");
    setError(null);
    try {
      await api.clearAgentAvatar(agent.id);
      forgetAgentPicture(agent.id);
      refreshAgents();
      setConfirmRemove(false);
      toast(t("agentProfile.picture.removed"));
    } catch (err) {
      setConfirmRemove(false);
      setError(err instanceof Error ? err.message : t("agentSettings.actionFailed"));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-wrap items-start gap-4">
      <Avatar agentId={agent.id} name={name} size="xl" className="size-16 text-h3" />
      <div className="min-w-0 flex-1">
        <p className="text-label font-medium text-ink">{t("agentProfile.picture.title")}</p>
        <p className="mt-0.5 text-small text-muted">{t("agentProfile.picture.hint", { name })}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button size="sm" icon={<ImagePlus size={14} aria-hidden="true" />} loading={busy === "upload"} disabled={busy !== null} onClick={() => input.current?.click()}>
            {t("agentProfile.picture.upload")}
          </Button>
          <Button size="sm" icon={<Sparkles size={14} aria-hidden="true" />} disabled={busy !== null} onClick={() => setGenerating(true)}>
            {t("agentProfile.picture.generate")}
          </Button>
          {state === "ready" && (
            <Button size="sm" variant="ghost" icon={<Trash2 size={14} aria-hidden="true" />} disabled={busy !== null} onClick={() => setConfirmRemove(true)}>
              {t("agentProfile.picture.remove")}
            </Button>
          )}
        </div>
        {error && <p role="alert" className="mt-2 text-small text-danger">{error}</p>}
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => void upload(event.target.files?.[0])}
        />
      </div>
      {generating && (
        <GenerateDialog
          agent={agent}
          name={name}
          onClose={() => setGenerating(false)}
          onSaved={() => {
            setGenerating(false);
            setError(null);
            refreshAgentPicture(agent.id);
            refreshAgents();
            toast(t("agentProfile.picture.saved"));
          }}
        />
      )}
      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={(open) => { if (!open) setConfirmRemove(false); }}
        title={t("agentProfile.picture.removeTitle", { name })}
        description={t("agentProfile.picture.removeBody", { name })}
        confirmLabel={t("agentProfile.picture.removeConfirm")}
        cancelLabel={t("common.cancel")}
        danger
        loading={busy === "remove"}
        onConfirm={() => void remove()}
      />
    </div>
  );
}

// Describe a picture, see it, then keep it or not. Nothing changes until "Use as picture".
function GenerateDialog({ agent, name, onClose, onSaved }: { agent: Agent; name: string; onClose: () => void; onSaved: () => void }) {
  const t = useT();
  const [providers, setProviders] = useState<ImageProvider[] | null>(null);
  const [providersFailed, setProvidersFailed] = useState(false);
  const [providersTick, setProvidersTick] = useState(0);
  const [provider, setProvider] = useState("");
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState<"generate" | "use" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ image: GeneratedImage; url: string } | null>(null);

  useEffect(() => {
    let live = true;
    api.listImageProviders().then(
      (rows) => {
        if (!live) return;
        setProviders(rows);
        setProvidersFailed(false);
        setProvider((current) => current || (pickProvider(rows)?.id ?? ""));
      },
      () => { if (live) setProvidersFailed(true); },
    );
    return () => { live = false; };
  }, [providersTick]);

  // The preview's object URL is freed when it is replaced, discarded or the dialog closes.
  useEffect(() => () => { if (result) URL.revokeObjectURL(result.url); }, [result]);

  const chosen = providers?.find((item) => item.id === provider) ?? null;
  const ready = chosen?.available === true && prompt.trim() !== "";
  const noService = providers !== null && !providers.some((item) => item.available);

  const generate = async () => {
    if (!ready) return;
    setBusy("generate");
    setError(null);
    try {
      // Square, the shape of an avatar.
      const image = await api.generateImage({ prompt, provider, size: "1024x1024" });
      const url = await api.generatedImageUrl(image.id);
      setResult({ image, url });
    } catch (err) {
      if (err instanceof ApiError && err.code === "timed_out") setError(t("agentProfile.generate.timedOut"));
      else if (err instanceof ApiError && err.code === "provider_not_configured") setError(t("agentProfile.generate.noService"));
      else if (err instanceof ApiError && err.status >= 500) setError(t("agentProfile.generate.failed"));
      else setError(err instanceof Error ? err.message : t("agentProfile.generate.failed"));
    } finally {
      setBusy(null);
    }
  };

  const use = async () => {
    if (!result) return;
    setBusy("use");
    setError(null);
    try {
      await api.setAgentAvatar(agent.id, result.image.id);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("agentSettings.actionFailed"));
      setBusy(null);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => { if (!open && busy === null) onClose(); }}
      title={t("agentProfile.generate.title", { name })}
      description={t("agentProfile.generate.body")}
      footer={result ? (
        <>
          <Button disabled={busy !== null} onClick={() => setResult(null)}>{t("agentProfile.generate.discard")}</Button>
          <Button variant="primary" loading={busy === "use"} disabled={busy !== null} onClick={() => void use()}>{t("agentProfile.generate.use")}</Button>
        </>
      ) : (
        <>
          <Button disabled={busy !== null} onClick={onClose}>{t("common.cancel")}</Button>
          <Button variant="primary" loading={busy === "generate"} disabled={!ready || busy !== null} onClick={() => void generate()}>{t("agentProfile.generate.run")}</Button>
        </>
      )}
    >
      <div className="flex flex-col gap-4">
        {providersFailed && providers === null && (
          <Banner tone="danger" action={<Button size="sm" onClick={() => { setProvidersFailed(false); setProvidersTick((n) => n + 1); }}>{t("agentSettings.retry")}</Button>}>
            {t("agentProfile.generate.loadFailed")}
          </Banner>
        )}
        {noService && <Banner tone="warning">{t("agentProfile.generate.noService")}</Banner>}
        {providers === null && !providersFailed ? (
          <Skeleton className="h-24" />
        ) : result ? (
          <div className="flex flex-wrap items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={result.url} alt={t("agentProfile.generate.preview")} className="size-40 rounded-full bg-inset object-cover" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={result.url} alt="" aria-hidden="true" className="size-12 rounded-full bg-inset object-cover" />
          </div>
        ) : (
          <>
            <Field label={t("agentProfile.generate.description")}>
              {(props) => (
                <Textarea
                  {...props}
                  rows={3}
                  value={prompt}
                  maxLength={PROMPT_MAX}
                  disabled={busy !== null || noService}
                  placeholder={t("agentProfile.generate.placeholder")}
                  onChange={(event) => setPrompt(event.target.value)}
                />
              )}
            </Field>
            {providers !== null && providers.length > 1 && (
              <Field label={t("agentProfile.generate.provider")}>
                {(props) => (
                  <Select {...props} value={provider} disabled={busy !== null} onChange={(event) => setProvider(event.target.value)}>
                    {providers.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.available ? item.label : t("agentProfile.generate.notSetUp", { service: item.label })}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            )}
          </>
        )}
        {error && <p role="alert" className="text-small text-danger">{error}</p>}
      </div>
    </Dialog>
  );
}
