"use client";

import Link from "next/link";
import { useId } from "react";
import type { Engine } from "@/lib/api";
import { cn } from "@/lib/cn";
import { engineLimitText } from "@/lib/everyday";
import { engineGroups } from "@/lib/engines";
import { effortAfterChange, effortChoices } from "@/lib/generation";
import { useT } from "@/lib/use-i18n";
import { CONTROL } from "@/components/ui/Input";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Select } from "@/components/ui/Select";

// The design system's control: 36 px with a mouse, 44 px on touch screens.
const SELECT = "mt-1 h-control touch:h-touch";
const FIELD = cn(CONTROL, "mt-1 h-control touch:h-touch");
// The "Default" effort segment: no effort is sent and the model decides.
const DEFAULT_EFFORT = "";
const KNOWN_EFFORTS = new Set(["low", "medium", "high", "xhigh", "max", "minimal", "none"]);

export function EngineModelFields({
  engines,
  provider,
  model,
  effort,
  onChange,
  disabled = false,
  lockProvider = false,
  hasComputer = false,
  showEffort = true,
  defaultLabel,
}: {
  engines: Engine[];
  provider: string;
  model: string | null;
  effort?: string | null;
  onChange: (provider: string, model: string | null, effort?: string | null) => void;
  disabled?: boolean;
  lockProvider?: boolean;
  hasComputer?: boolean;
  showEffort?: boolean;
  defaultLabel?: string;
}) {
  const t = useT();
  const listId = useId();
  const engine = engines.find((item) => item.id === provider);
  const knownModel = model === null || engine?.models.some((item) => item.id === model);
  const efforts = effortChoices(engine, model);
  const effortLabel = (level: string) => {
    const key = level.toLowerCase();
    return KNOWN_EFFORTS.has(key) ? t(`agentsModel.effort.${key}`) : level.charAt(0).toUpperCase() + level.slice(1);
  };
  const engineDefault = engine?.default_model
    ? t("agentsModel.engineDefaultNamed", { model: engine.default_model })
    : t("agentsModel.engineDefault");

  // A new engine or model keeps the chosen effort only when it offers the same level; otherwise
  // the effort goes back to the default, which sends nothing.
  const handleProviderChange = (newProvider: string) => {
    onChange(newProvider, null, effortAfterChange(engines.find((item) => item.id === newProvider), null, effort));
  };

  const handleModelChange = (newModel: string | null) => {
    onChange(provider, newModel, effortAfterChange(engine, newModel, effort));
  };

  const chosenEffort = efforts.find((level) => level.toLowerCase() === effort?.toLowerCase()) ?? DEFAULT_EFFORT;

  return (
    <div className="space-y-3">
      <label className="block text-xs text-muted">
        {t("agentsModel.engine")}
        <Select
          className={SELECT}
          aria-label={t("agentsModel.engine")}
          value={provider}
          disabled={disabled || lockProvider}
          onChange={(event) => handleProviderChange(event.target.value)}
        >
          {!engine && <option value={provider}>{provider}</option>}
          {engineGroups(engines).map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.engines.map((item) => (
                <option
                  key={item.id}
                  value={item.id}
                  disabled={!item.available || (hasComputer && !item.capabilities.computers)}
                >
                  {item.label}
                  {item.available ? "" : ` · ${item.reason ?? t("agentsModel.needsSetup")}`}
                  {item.limit ? ` · ${engineLimitText(item.limit)}` : ""}
                  {hasComputer && !item.capabilities.computers ? ` · ${t("agentsModel.noComputer")}` : ""}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
      </label>
      {engine?.limit && (
        <p role="status" className="text-xs text-warning">
          <span className="mr-1 rounded-full border border-warning/60 px-2 py-0.5 font-medium">
            {engineLimitText(engine.limit)}
          </span>
          {engine.limit.message}
        </p>
      )}
      {engine && !engine.available && (
        <p className="text-xs text-warning">
          {engine.reason} <Link href="/settings/engines/" className="underline">{t("agentsModel.openEngineSettings")}</Link>
        </p>
      )}
      <label className="block text-xs text-muted">
        {t("agentsModel.model")}
        {engine && !engine.custom_models ? (
          <Select
            className={SELECT}
            aria-label={t("agentsModel.model")}
            value={model ?? ""}
            disabled={disabled}
            onChange={(event) => handleModelChange(event.target.value || null)}
          >
            <option value="">{defaultLabel ?? engineDefault}</option>
            {!knownModel && model && <option value={model}>{t("agentsModel.savedUnavailable", { model })}</option>}
            {engine.models.map((item) => (
              <option key={item.id} value={item.id}>{item.label}</option>
            ))}
          </Select>
        ) : (
          <>
            <input
              className={FIELD}
              aria-label={t("agentsModel.model")}
              list={listId}
              value={model ?? ""}
              disabled={disabled}
              placeholder={defaultLabel ?? engineDefault}
              maxLength={200}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => handleModelChange(event.target.value || null)}
            />
            <datalist id={listId}>
              {engine?.models.map((item) => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </datalist>
          </>
        )}
        <span className="mt-1 block">
          {defaultLabel ? t("agentsModel.modelHintAgent") : t("agentsModel.modelHintEngine")}
          {engine?.custom_models ? ` ${t("agentsModel.modelHintCustom")}` : ""}
        </span>
      </label>

      {showEffort && efforts.length > 0 && (
        <div className="pt-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-medium text-muted">{t("agentsModel.effort")}</span>
            <SegmentedControl
              label={t("agentsModel.effort")}
              value={chosenEffort}
              onChange={(level) => { if (!disabled) onChange(provider, model, level === DEFAULT_EFFORT ? null : level); }}
              options={[
                { value: DEFAULT_EFFORT, label: t("agentsModel.effort.default") },
                ...efforts.map((level) => ({ value: level, label: effortLabel(level) })),
              ]}
              className={cn("max-w-full flex-wrap", disabled && "pointer-events-none opacity-50")}
            />
          </div>
          <span className="mt-1 block text-xs text-muted">{t("agentsModel.effort.hint")}</span>
        </div>
      )}

      {engine && (
        <p className="text-xs text-muted">
          {engine.capabilities.tools ? t("agentsModel.caps.tools") : t("agentsModel.caps.chatOnly")}
          {engine.capabilities.computers ? ` · ${t("agentsModel.caps.computers")}` : ""}
          {engine.capabilities.resume ? ` · ${t("agentsModel.caps.resume")}` : ""}
        </p>
      )}
    </div>
  );
}
