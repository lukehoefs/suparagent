"use client";

import { ChevronRight } from "lucide-react";
import { useState, type ReactNode, type Ref } from "react";
import { TemplateSkillChoices } from "@/components/chat/TemplatesGallery";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Input";
import { Card } from "@/components/ui/Surface";
import { Switch } from "@/components/ui/Switch";
import type { ClaudeAccount } from "@/lib/api";
import type { Draft } from "@/lib/agent-draft";
import { cn } from "@/lib/cn";
import { DESCRIPTION_MAX, INSTRUCTIONS_MAX_BYTES, utf8Bytes } from "@/lib/new-agent";
import type { AgentTemplate } from "@/lib/templates";
import { useT } from "@/lib/use-i18n";

export type ReviewTools = { server: string; tools: string[] }[];

// Step 3: what was chosen, the optional settings, and the one Create button.
export function CreateStep({
  draft,
  onDraft,
  admin,
  purpose,
  clientName,
  engineText,
  approvalLabel,
  apps,
  tools,
  template,
  useTemplate,
  onUseTemplate,
  skillChoices,
  onSkillChoices,
  claudeAccounts,
  leadSupported,
  teamsDisabled,
  makeLead,
  onMakeLead,
  creating,
  createError,
  nameTaken,
  onEditStep,
  onBack,
  onCreate,
  headingRef,
}: {
  draft: Draft;
  onDraft: (patch: Partial<Draft>) => void;
  admin: boolean;
  purpose: string;
  // undefined: no client field was offered; null: none chosen.
  clientName: string | null | undefined;
  engineText: string;
  approvalLabel: string;
  // undefined: not offered for this device or engine.
  apps: { label: string; level: string }[] | undefined;
  tools: ReviewTools | undefined;
  template: AgentTemplate | null;
  useTemplate: boolean;
  onUseTemplate: (on: boolean) => void;
  skillChoices: string[];
  onSkillChoices: (names: string[]) => void;
  claudeAccounts: ClaudeAccount[];
  leadSupported: boolean;
  teamsDisabled: boolean;
  makeLead: boolean;
  onMakeLead: (on: boolean) => void;
  creating: boolean;
  createError: string | null;
  nameTaken: boolean;
  onEditStep: (step: 0 | 1) => void;
  onBack: () => void;
  onCreate: () => void;
  headingRef: Ref<HTMLHeadingElement>;
}) {
  const t = useT();
  const instructionBytes = utf8Bytes(draft.instructions.trim());
  const instructionsTooLong = instructionBytes > INSTRUCTIONS_MAX_BYTES;
  const [advancedOpen, setAdvancedOpen] = useState(
    () => draft.description !== "" || draft.instructions !== "" || draft.starter_notes !== "" || draft.workspace_path !== "",
  );
  const notSet = <span className="text-faint">{t("newAgent.notSet")}</span>;
  const none = <span className="text-faint">{t("newAgent.none")}</span>;
  const showAccount = admin && draft.provider === "claude" && claudeAccounts.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-5 p-6">
        <div className="flex flex-col gap-1">
          <h2 ref={headingRef} tabIndex={-1} className="text-h2 font-semibold tracking-[-0.01em] outline-none">{t("newAgent.createTitle")}</h2>
          <p className="text-body text-muted">{t("newAgent.createIntro")}</p>
        </div>

        <ReviewGroup title={t("newAgent.stepIdentity")} editLabel={t("newAgent.editStep", { step: t("newAgent.stepIdentity") })} onEdit={() => onEditStep(0)}>
          <ReviewRow label={t("newAgent.name")}>{draft.name.trim()}</ReviewRow>
          <ReviewRow label={t("newAgent.role")}>{draft.title.trim() || notSet}</ReviewRow>
          {clientName !== undefined ? <ReviewRow label={t("newAgent.client")}>{clientName ?? none}</ReviewRow> : null}
          <ReviewRow label={t("newAgent.engine")}>{engineText}{draft.effort ? ` · ${draft.effort}` : ""}</ReviewRow>
          {admin ? (
            <ReviewRow label={t("newAgent.purpose")}>
              {purpose.trim() ? <span className="line-clamp-4 whitespace-pre-line">{purpose.trim()}</span> : notSet}
            </ReviewRow>
          ) : null}
        </ReviewGroup>

        <ReviewGroup title={t("newAgent.stepTools")} editLabel={t("newAgent.editStep", { step: t("newAgent.stepTools") })} onEdit={() => onEditStep(1)}>
          <ReviewRow label={t("newAgent.approvals")}>{approvalLabel}</ReviewRow>
          {apps !== undefined ? (
            <ReviewRow label={t("newAgent.appsTitle")}>
              {apps.length ? apps.map((app) => t("newAgent.appLevel", { app: app.label, level: app.level })).join(", ") : none}
            </ReviewRow>
          ) : null}
          {tools !== undefined ? (
            <ReviewRow label={t("newAgent.mcpTitle")}>
              {tools.length ? (
                <ul className="flex flex-col gap-1">
                  {tools.map((item) => (
                    <li key={item.server}>
                      <span className="font-medium">{item.server}</span>
                      <span className="text-muted">: </span>
                      <span className="break-all font-mono text-[12px]">{item.tools.join(", ")}</span>
                    </li>
                  ))}
                </ul>
              ) : none}
            </ReviewRow>
          ) : null}
        </ReviewGroup>
      </Card>

      {template ? (
        <Card className="flex flex-col gap-3 p-6">
          <div className="flex flex-col gap-1">
            <h3 className="text-h3 font-semibold">{t("newAgent.templateTitle", { name: template.name })}</h3>
            <p className="text-small text-muted">{t("newAgent.templateIntro")}</p>
          </div>
          <SwitchRow label={t("newAgent.templateUseText")} checked={useTemplate} onChange={onUseTemplate} disabled={creating} />
          {template.skills.length > 0 ? (
            <TemplateSkillChoices skills={template.skills} chosen={skillChoices} disabled={creating} onChange={onSkillChoices} />
          ) : null}
        </Card>
      ) : null}

      <Card className="p-0">
        <details open={advancedOpen} onToggle={(event) => setAdvancedOpen(event.currentTarget.open)} className="group">
          <summary className="flex cursor-pointer list-none items-center gap-2 rounded-card px-6 py-4 [&::-webkit-details-marker]:hidden">
            <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-muted transition-transform duration-(--dur-fast) group-open:rotate-90" />
            <span className="flex min-w-0 flex-col">
              <span className="text-h3 font-semibold">{t("newAgent.advanced")}</span>
              <span className="text-small text-muted">{t("newAgent.advancedHint")}</span>
            </span>
          </summary>
          <div className="flex flex-col gap-4 border-t border-line px-6 py-5">
            <Field label={t("newAgent.description")} hint={t("newAgent.descriptionHint")}>
              {(props) => <Textarea {...props} rows={2} maxLength={DESCRIPTION_MAX} value={draft.description} onChange={(event) => onDraft({ description: event.target.value })} />}
            </Field>
            <Field
              label={t("newAgent.instructions")}
              hint={t("newAgent.instructionsHint", { n: instructionBytes.toLocaleString(), max: INSTRUCTIONS_MAX_BYTES.toLocaleString() })}
              error={instructionsTooLong ? t("newAgent.instructionsTooLong", { n: instructionBytes.toLocaleString(), max: INSTRUCTIONS_MAX_BYTES.toLocaleString() }) : undefined}
            >
              {(props) => <Textarea {...props} rows={6} value={draft.instructions} onChange={(event) => onDraft({ instructions: event.target.value })} />}
            </Field>
            <Field label={t("newAgent.starterNotes")} hint={t("agentTeam.firstNotesHelp")}>
              {(props) => <Textarea {...props} rows={4} className="font-mono text-[13px]" value={draft.starter_notes} onChange={(event) => onDraft({ starter_notes: event.target.value })} />}
            </Field>
            <SwitchRow
              label={t("newAgent.useNotes")}
              description={t("newAgent.useNotesHint")}
              checked={draft.memory_enabled}
              onChange={(on) => onDraft({ memory_enabled: on })}
            />
            {admin ? (
              <>
                <Field label={t("newAgent.workspace")} hint={t("newAgent.workspaceHint")}>
                  {(props) => <Input {...props} spellCheck={false} autoComplete="off" maxLength={1000} className="font-mono" value={draft.workspace_path} onChange={(event) => onDraft({ workspace_path: event.target.value })} />}
                </Field>
                {showAccount ? (
                  <Field label={t("newAgent.claudeAccount")} hint={t("newAgent.claudeAccountHint")}>
                    {(props) => (
                      <Select
                        id={props.id}
                        aria-describedby={props["aria-describedby"]}
                        className="h-control touch:h-touch"
                        value={draft.claude_account && claudeAccounts.some((account) => account.id === draft.claude_account) ? draft.claude_account : ""}
                        onChange={(event) => onDraft({ claude_account: event.target.value || null })}
                        options={[{ value: "", label: t("newAgent.defaultAccount") }, ...claudeAccounts.map((account) => ({ value: account.id, label: account.label }))]}
                      />
                    )}
                  </Field>
                ) : null}
                <div className="flex flex-col gap-1">
                  <SwitchRow
                    label={t("agentTeam.leadRole")}
                    description={t("newAgent.leadHint")}
                    checked={makeLead && leadSupported}
                    onChange={onMakeLead}
                    disabled={!leadSupported}
                  />
                  {!leadSupported ? <p className="text-small text-warning">{t("agentTeam.teamEngineChoice")}</p> : null}
                  {leadSupported && teamsDisabled ? <p className="text-small text-warning">{t("agentTeam.teamsDisabled")}</p> : null}
                </div>
              </>
            ) : null}
          </div>
        </details>
      </Card>

      {createError !== null ? (
        <Banner
          tone="danger"
          title={nameTaken ? t("newAgent.nameTaken") : t("newAgent.createFailed")}
          action={nameTaken ? <Button size="sm" onClick={() => onEditStep(0)}>{t("newAgent.changeName")}</Button> : undefined}
        >
          {nameTaken ? null : createError}
        </Banner>
      ) : null}
      {instructionsTooLong && !advancedOpen ? <p role="alert" className="text-small text-danger">{t("newAgent.instructionsTooLong", { n: instructionBytes.toLocaleString(), max: INSTRUCTIONS_MAX_BYTES.toLocaleString() })}</p> : null}

      <div className="flex flex-wrap justify-between gap-2">
        <Button onClick={onBack} disabled={creating}>{t("newAgent.back")}</Button>
        <Button variant="primary" loading={creating} disabled={draft.name.trim() === "" || instructionsTooLong} onClick={onCreate}>
          {t("newAgent.create")}
        </Button>
      </div>
    </div>
  );
}

function ReviewGroup({ title, editLabel, onEdit, children }: { title: string; editLabel: string; onEdit: () => void; children: ReactNode }) {
  const t = useT();
  return (
    <section className="flex flex-col gap-2 border-t border-line pt-4 first-of-type:border-t-0 first-of-type:pt-0">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-h3 font-semibold">{title}</h3>
        <Button size="sm" variant="ghost" aria-label={editLabel} onClick={onEdit}>{t("newAgent.edit")}</Button>
      </div>
      <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-body sm:grid-cols-[10rem_minmax(0,1fr)]">{children}</dl>
    </section>
  );
}

function ReviewRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-small text-muted sm:pt-px">{label}</dt>
      <dd className="min-w-0 break-words text-ink">{children}</dd>
    </>
  );
}

function SwitchRow({ label, description, checked, onChange, disabled = false }: { label: string; description?: string; checked: boolean; onChange: (on: boolean) => void; disabled?: boolean }) {
  return (
    <div className={cn("flex items-center gap-3", disabled && "opacity-70")}>
      <div className="min-w-0 flex-1">
        <p className="text-body font-medium text-ink">{label}</p>
        {description ? <p className="text-small text-muted">{description}</p> : null}
      </div>
      <Switch checked={checked} onChange={onChange} label={label} disabled={disabled} />
    </div>
  );
}
