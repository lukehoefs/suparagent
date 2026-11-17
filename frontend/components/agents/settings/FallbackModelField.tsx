"use client";

// The fallback engine's model: its default (null), one of the models it lists (GET /engines), or,
// for an engine that takes any model ID, "Other…" with the ID typed in.
import { useState } from "react";
import type { Engine } from "@/lib/api";
import { fallbackModelChoice } from "@/lib/generation";
import { useT } from "@/lib/use-i18n";
import { Field, Input, Select } from "@/components/ui/Input";

// Never a model ID: those start with a letter or a digit (backend engine_registry._MODEL_ID).
const OTHER = "__other__";

export function FallbackModelField({
  engines,
  fallbackProvider,
  value,
  onChange,
  label,
  disabled = false,
}: {
  engines: Engine[] | null;
  fallbackProvider: string;
  value: string | null;
  onChange: (model: string | null) => void;
  label: string;
  disabled?: boolean;
}) {
  const t = useT();
  const engine = engines?.find((item) => item.id === fallbackProvider);
  // Until the person picks, a saved ID the list does not have shows as "Other…".
  const [picked, setPicked] = useState<"other" | "list" | null>(null);
  const derived = fallbackModelChoice(engine, value);
  const other = picked === "other" || (picked === null && derived === "other" && (engine?.custom_models ?? true));
  const listed = engine?.models ?? [];
  const unlisted = !other && derived === "other" && value !== null;
  const defaultText = engine?.default_model
    ? t("agentsModel.fallback.defaultNamed", { model: engine.default_model })
    : t("agentsModel.fallback.default");

  return (
    <div className="flex flex-col gap-3">
      <Field label={label} hint={other ? undefined : t("agentsModel.fallback.hint")}>
        {(props) => (
          <Select
            {...props}
            value={other ? OTHER : value ?? ""}
            disabled={disabled}
            onChange={(event) => {
              const next = event.target.value;
              if (next === OTHER) {
                setPicked("other");
                return;
              }
              setPicked("list");
              onChange(next || null);
            }}
          >
            <option value="">{defaultText}</option>
            {unlisted && value && <option value={value}>{t("agentsModel.savedUnavailable", { model: value })}</option>}
            {listed.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            {(engine?.custom_models ?? true) && <option value={OTHER}>{t("agentsModel.fallback.other")}</option>}
          </Select>
        )}
      </Field>
      {other && (
        <Field label={t("agentsModel.fallback.custom")} hint={t("agentsModel.fallback.customHint")}>
          {(props) => (
            <Input
              {...props}
              value={value ?? ""}
              maxLength={200}
              disabled={disabled}
              autoComplete="off"
              spellCheck={false}
              placeholder={defaultText}
              className="font-mono"
              onChange={(event) => onChange(event.target.value || null)}
            />
          )}
        </Field>
      )}
    </div>
  );
}
