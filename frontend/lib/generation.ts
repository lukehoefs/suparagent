// An agent's model settings beyond the model itself: which sampling settings (temperature, top P,
// max output tokens) an engine and model send, how typed values are read, which reasoning efforts a
// model offers, and the fallback model picker's state. Pure, so node tests can load it.

import type { Engine, EngineModel, GenerationParam } from "./api";

export const GENERATION_PARAMS: GenerationParam[] = ["temperature", "top_p", "max_output_tokens"];

export type Sampling = Record<GenerationParam, number | null>;

export const NO_SAMPLING: Sampling = { temperature: null, top_p: null, max_output_tokens: null };

// The ranges the backend accepts (schemas/agent.py). top_p must be above its minimum.
export const LIMITS: Record<GenerationParam, { min: number; max: number; step: number; whole: boolean; exclusiveMin: boolean }> = {
  temperature: { min: 0, max: 2, step: 0.1, whole: false, exclusiveMin: false },
  top_p: { min: 0, max: 1, step: 0.05, whole: false, exclusiveMin: true },
  max_output_tokens: { min: 1, max: 200_000, step: 1, whole: true, exclusiveMin: false },
};

/** The catalog entry a turn would use: the chosen model, or the engine's default for none. */
export function modelEntry(engine: Engine | undefined, model: string | null): EngineModel | undefined {
  if (!engine) return undefined;
  return model === null ? engine.models.find((item) => item.default) : engine.models.find((item) => item.id === model);
}

/** Which sampling settings a turn on this engine and model sends, in display order; null while
 *  the engine is not known (the list has not loaded, or failed). Mirrors the backend registry. */
export function generationParams(engines: Engine[] | null, provider: string, model: string | null): GenerationParam[] | null {
  const engine = engines?.find((item) => item.id === provider);
  if (!engine) return null;
  const sent = engine.generation_params ?? [];
  if (sent.length === 0) return [];
  const own = modelEntry(engine, model)?.generation_params;
  const chosen = own ?? sent;
  return GENERATION_PARAMS.filter((param) => sent.includes(param) && chosen.includes(param));
}

/** Values the new engine or model would not send go back to the default (null). An unknown engine keeps them. */
export function keepSupported(values: Sampling, params: GenerationParam[] | null): Sampling {
  if (params === null) return { ...values };
  return {
    temperature: params.includes("temperature") ? values.temperature : null,
    top_p: params.includes("top_p") ? values.top_p : null,
    max_output_tokens: params.includes("max_output_tokens") ? values.max_output_tokens : null,
  };
}

/** How many settings that had a value were set back to the default by an engine or model change. */
export function droppedCount(before: Sampling, after: Sampling, params: GenerationParam[] | null): number {
  if (params === null) return 0;
  return GENERATION_PARAMS.filter((param) => before[param] !== null && after[param] === null && !params.includes(param)).length;
}

export type ParsedSetting = { ok: true; value: number | null } | { ok: false; reason: "number" | "whole" | "range" };

/** A typed value: empty is the default (null); a comma is read as a decimal point. */
export function parseSetting(param: GenerationParam, text: string): ParsedSetting {
  const trimmed = text.trim();
  if (trimmed === "") return { ok: true, value: null };
  const normalized = trimmed.replace(",", ".");
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(normalized)) return { ok: false, reason: "number" };
  const value = Number(normalized);
  if (!Number.isFinite(value)) return { ok: false, reason: "number" };
  const limit = LIMITS[param];
  if (limit.whole && !Number.isInteger(value)) return { ok: false, reason: "whole" };
  if (value > limit.max || (limit.exclusiveMin ? value <= limit.min : value < limit.min)) return { ok: false, reason: "range" };
  return { ok: true, value };
}

export function formatSetting(value: number | null): string {
  return value === null ? "" : String(value);
}

/** The efforts a model offers to choose from (none when it has fewer than two or says it has no choice). */
export function effortChoices(engine: Engine | undefined, model: string | null): string[] {
  if (!engine) return [];
  const entry = modelEntry(engine, model) ?? (model === null ? engine.models[0] : undefined);
  const efforts = entry?.supported_reasoning_efforts ?? [];
  return efforts.length > 1 && entry?.reasoning_effort_configurable !== false ? efforts : [];
}

/** The effort to keep after an engine or model change: the same level when the new model offers it, otherwise the default. */
export function effortAfterChange(engine: Engine | undefined, model: string | null, effort: string | null | undefined): string | null {
  if (!effort) return null;
  const match = effortChoices(engine, model).find((level) => level.toLowerCase() === effort.toLowerCase());
  return match ?? null;
}

export type FallbackModelChoice = "default" | "listed" | "other";

/** How the fallback model picker shows a saved fallback model. */
export function fallbackModelChoice(engine: Engine | undefined, model: string | null): FallbackModelChoice {
  if (model === null || model.trim() === "") return "default";
  return engine?.models.some((item) => item.id === model) ? "listed" : "other";
}
