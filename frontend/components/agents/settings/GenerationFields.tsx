"use client";

// Sampling for the Profile tab's Engine section: temperature, top P and max output tokens, shown
// only for the settings the chosen engine and model send (GET /engines `generation_params`). An
// empty field is the model's own default (null): nothing is sent for it. Engines that pick their
// own sampling get one line saying so.
import { useEffect, useId, useState } from "react";
import type { Engine, GenerationParam } from "@/lib/api";
import { pluralForm } from "@/lib/blueprint-browse";
import {
  GENERATION_PARAMS,
  LIMITS,
  droppedCount,
  effortChoices,
  formatSetting,
  generationParams,
  parseSetting,
  type Sampling,
} from "@/lib/generation";
import { resolveLocale } from "@/lib/i18n";
import { useLanguageChoice, useT } from "@/lib/use-i18n";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Input";

const LABEL: Record<GenerationParam, string> = {
  temperature: "agentsModel.temperature",
  top_p: "agentsModel.topP",
  max_output_tokens: "agentsModel.maxTokens",
};
const HINT: Record<GenerationParam, string> = {
  temperature: "agentsModel.temperature.hint",
  top_p: "agentsModel.topP.hint",
  max_output_tokens: "agentsModel.maxTokens.hint",
};
const RANGE_ERROR: Record<GenerationParam, string> = {
  temperature: "agentsModel.error.temperature",
  top_p: "agentsModel.error.topP",
  max_output_tokens: "agentsModel.error.maxTokens",
};

// What the person typed, for as long as the value it stands for is still the one in the draft. A
// value changed from outside (an engine change, Discard) shows the new value instead.
type Typed = Partial<Record<GenerationParam, { text: string; base: number | null }>>;

export function GenerationFields({
  engines,
  provider,
  model,
  value,
  saved,
  onChange,
  onInvalidChange,
  disabled = false,
}: {
  // null while the engine list loads, or when it failed (the Engine section says so).
  engines: Engine[] | null;
  provider: string;
  model: string | null;
  value: Sampling;
  // The values as last saved, to say which ones an engine or model change sets back to the default.
  saved: Sampling;
  onChange: (next: Sampling) => void;
  // True while a field holds text that is not a valid value: the form must not save.
  onInvalidChange: (invalid: boolean) => void;
  disabled?: boolean;
}) {
  const t = useT();
  const locale = resolveLocale(useLanguageChoice());
  const [typed, setTyped] = useState<Typed>({});
  const headingId = useId();
  const params = generationParams(engines, provider, model);
  const engine = engines?.find((item) => item.id === provider);

  const shown = (param: GenerationParam) => {
    const edit = typed[param];
    return edit && edit.base === value[param] ? edit.text : formatSetting(value[param]);
  };
  const parsedOf = (param: GenerationParam) => parseSetting(param, shown(param));
  const invalid = (params ?? []).some((param) => !parsedOf(param).ok);
  useEffect(() => { onInvalidChange(invalid); }, [invalid, onInvalidChange]);
  useEffect(() => () => onInvalidChange(false), [onInvalidChange]);

  if (params === null || !engine) return null;

  const dropped = droppedCount(saved, value, params);
  const droppedNote = dropped > 0 ? (
    <p role="status" className="text-small text-muted">
      {t(`agentsModel.dropped.${pluralForm(locale, dropped)}`, { count: dropped })}
    </p>
  ) : null;

  if (params.length === 0) {
    const withEffort = effortChoices(engine, model).length > 0;
    return (
      <>
        <p className="text-small text-muted">
          {t(withEffort ? "agentsModel.ownSamplingEffort" : "agentsModel.ownSampling", { engine: engine.label })}
        </p>
        {droppedNote}
      </>
    );
  }

  const max = LIMITS.max_output_tokens.max.toLocaleString(locale);
  const set = (param: GenerationParam, text: string) => {
    const parsed = parseSetting(param, text);
    const next = parsed.ok ? parsed.value : value[param];
    setTyped((current) => ({ ...current, [param]: { text, base: next } }));
    if (parsed.ok && parsed.value !== value[param]) onChange({ ...value, [param]: parsed.value });
  };
  const reset = (param: GenerationParam) => {
    setTyped((current) => ({ ...current, [param]: { text: "", base: null } }));
    if (value[param] !== null) onChange({ ...value, [param]: null });
  };
  const errorOf = (param: GenerationParam) => {
    const parsed = parsedOf(param);
    if (parsed.ok) return undefined;
    if (parsed.reason === "number") return t("agentsModel.error.number");
    if (parsed.reason === "whole") return t("agentsModel.error.whole");
    return t(RANGE_ERROR[param], { max });
  };
  return (
    <div role="group" aria-labelledby={headingId} className="flex flex-col gap-3 border-t border-line pt-4">
      <div className="min-w-0">
        <p id={headingId} className="text-label font-medium text-ink">{t("agentsModel.sampling")}</p>
        <p className="mt-0.5 text-small text-muted">{t("agentsModel.sampling.hint")}</p>
      </div>
      {GENERATION_PARAMS.filter((param) => params.includes(param)).map((param) => {
        const text = shown(param);
        const label = t(LABEL[param]);
        return (
          <Field key={param} label={label} hint={t(HINT[param], { max })} error={errorOf(param)}>
            {(props) => (
              <div className="flex items-center gap-2">
                <Input
                  {...props}
                  value={text}
                  disabled={disabled}
                  inputMode={LIMITS[param].whole ? "numeric" : "decimal"}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={t("agentsModel.default")}
                  onChange={(event) => set(param, event.target.value)}
                  className="max-w-48"
                />
                {text.trim() !== "" && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={disabled}
                    aria-label={t("agentsModel.resetLabel", { setting: label })}
                    onClick={() => reset(param)}
                  >
                    {t("agentsModel.reset")}
                  </Button>
                )}
              </div>
            )}
          </Field>
        );
      })}
      {provider === "openai_compat" && <p className="text-small text-muted">{t("agentsModel.endpointMayRefuse")}</p>}
      {droppedNote}
    </div>
  );
}
