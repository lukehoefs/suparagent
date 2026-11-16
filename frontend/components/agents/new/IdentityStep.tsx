"use client";

import type { Ref } from "react";
import { EngineModelFields } from "@/components/chat/EngineModelFields";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { Card } from "@/components/ui/Surface";
import type { Engine, PortalClient } from "@/lib/api";
import type { Draft } from "@/lib/agent-draft";
import { NAME_MAX, PURPOSE_MAX, ROLE_MAX } from "@/lib/new-agent";
import { useT } from "@/lib/use-i18n";

// Step 1 (design: NewAgent.html, "Who is this agent?"). No conversational switch: the backend has no
// such field.
export function IdentityStep({
  draft,
  onDraft,
  onEngine,
  showPurpose,
  purpose,
  onPurpose,
  clients,
  clientId,
  onClientId,
  engines,
  enginesError,
  onRetryEngines,
  nameError,
  onContinue,
  headingRef,
  nameRef,
}: {
  draft: Draft;
  onDraft: (patch: Partial<Draft>) => void;
  onEngine: (provider: string, model: string | null, effort: string | null) => void;
  // The purpose becomes the soul's first draft (PUT /agents/{id}/soul), an admin-scope endpoint, so a
  // device without admin rights is not offered it.
  showPurpose: boolean;
  purpose: string;
  onPurpose: (text: string) => void;
  // Owner only and only when there are clients; null hides the field.
  clients: PortalClient[] | null;
  clientId: string;
  onClientId: (id: string) => void;
  engines: Engine[] | null;
  enginesError: string | null;
  onRetryEngines: () => void;
  nameError: string | null;
  onContinue: () => void;
  headingRef: Ref<HTMLHeadingElement>;
  nameRef: Ref<HTMLInputElement>;
}) {
  const t = useT();
  const canContinue = draft.name.trim() !== "";
  return (
    <Card className="flex flex-col gap-[18px] p-6">
      <h2 ref={headingRef} tabIndex={-1} className="text-h2 font-semibold tracking-[-0.01em] outline-none">{t("newAgent.identityTitle")}</h2>
      <form
        className="flex flex-col gap-[18px]"
        onSubmit={(event) => {
          event.preventDefault();
          if (canContinue) onContinue();
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("newAgent.name")} hint={t("newAgent.nameHint")} error={nameError}>
            {(props) => (
              <Input
                {...props}
                ref={nameRef}
                autoFocus
                aria-required="true"
                autoComplete="off"
                maxLength={NAME_MAX}
                value={draft.name}
                onChange={(event) => onDraft({ name: event.target.value })}
              />
            )}
          </Field>
          <Field label={t("newAgent.role")} hint={t("newAgent.roleHint")}>
            {(props) => (
              <Input {...props} autoComplete="off" maxLength={ROLE_MAX} value={draft.title} onChange={(event) => onDraft({ title: event.target.value })} />
            )}
          </Field>
          {clients && clients.length > 0 ? (
            <Field label={t("newAgent.client")} hint={t("newAgent.clientHint")}>
              {(props) => (
                <Select
                  id={props.id}
                  aria-describedby={props["aria-describedby"]}
                  className="h-control touch:h-touch"
                  value={clientId}
                  onChange={(event) => onClientId(event.target.value)}
                  options={[{ value: "", label: t("newAgent.noClient") }, ...clients.map((client) => ({ value: client.id, label: client.name }))]}
                />
              )}
            </Field>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          {enginesError !== null ? (
            <Banner
              tone="warning"
              title={t("newAgent.enginesFailed")}
              action={<Button size="sm" onClick={onRetryEngines}>{t("newAgent.retry")}</Button>}
            >
              {enginesError || null}
            </Banner>
          ) : null}
          {engines === null ? (
            <div role="status" aria-busy="true" className="flex flex-col gap-2">
              <span className="sr-only">{t("common.loading")}</span>
              <Skeleton className="h-control" />
              <Skeleton className="h-control" />
            </div>
          ) : (
            <EngineModelFields engines={engines} provider={draft.provider} model={draft.model} effort={draft.effort} onChange={(provider, model, effort) => onEngine(provider, model, effort ?? null)} />
          )}
        </div>

        {showPurpose ? (
          <Field label={t("newAgent.purpose")} hint={t("newAgent.purposeHint")}>
            {(props) => (
              <Textarea
                {...props}
                rows={4}
                maxLength={PURPOSE_MAX}
                placeholder={t("newAgent.purposePlaceholder")}
                value={purpose}
                onChange={(event) => onPurpose(event.target.value)}
              />
            )}
          </Field>
        ) : null}

        <div className="flex justify-end pt-2">
          <Button type="submit" variant="primary" disabled={!canContinue}>{t("newAgent.continue")}</Button>
        </div>
      </form>
    </Card>
  );
}
