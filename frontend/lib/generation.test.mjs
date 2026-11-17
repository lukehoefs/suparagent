import assert from "node:assert/strict";
import { test } from "node:test";
import {
  NO_SAMPLING,
  droppedCount,
  effortAfterChange,
  effortChoices,
  fallbackModelChoice,
  generationParams,
  keepSupported,
  parseSetting,
} from "./generation.ts";

const ALL = ["temperature", "top_p", "max_output_tokens"];
const engines = [
  { id: "claude", generation_params: [], default_model: null, custom_models: true, models: [
    { id: "opus", label: "Opus", default: false, supported_reasoning_efforts: ["low", "medium", "high", "xhigh", "max"], reasoning_effort_configurable: true, generation_params: [] },
    { id: "haiku", label: "Haiku", default: false, supported_reasoning_efforts: [], reasoning_effort_configurable: false, generation_params: [] },
  ] },
  { id: "openai_compat", generation_params: ALL, default_model: "llama", custom_models: true, models: [
    { id: "llama", label: "llama", default: true, generation_params: ALL },
  ] },
  { id: "openrouter", generation_params: ALL, default_model: "a/one", custom_models: true, models: [
    { id: "a/one", label: "One", default: true, generation_params: ["temperature"] },
    { id: "b/two", label: "Two", default: false, generation_params: ["top_p", "max_output_tokens"] },
  ] },
  // An older backend that does not say: nothing is offered.
  { id: "codex", default_model: null, custom_models: false, models: [{ id: "gpt", label: "GPT", default: true }] },
];

test("only what the engine and model send is offered", () => {
  assert.deepEqual(generationParams(engines, "claude", "opus"), []);
  assert.deepEqual(generationParams(engines, "openai_compat", null), ALL);
  assert.deepEqual(generationParams(engines, "openai_compat", "anything-typed"), ALL);
  assert.deepEqual(generationParams(engines, "openrouter", null), ["temperature"]);
  assert.deepEqual(generationParams(engines, "openrouter", "b/two"), ["top_p", "max_output_tokens"]);
  assert.deepEqual(generationParams(engines, "openrouter", "unlisted/model"), ALL);
  assert.deepEqual(generationParams(engines, "codex", null), []);
});

test("an engine that is not known yet says nothing and keeps values", () => {
  assert.equal(generationParams(null, "openai_compat", null), null);
  assert.equal(generationParams(engines, "gone", null), null);
  const values = { temperature: 0.5, top_p: 0.9, max_output_tokens: 100 };
  assert.deepEqual(keepSupported(values, null), values);
  assert.equal(droppedCount(values, values, null), 0);
});

test("a change of engine or model drops what the new choice ignores", () => {
  const before = { temperature: 0.5, top_p: 0.9, max_output_tokens: null };
  const after = keepSupported(before, ["temperature"]);
  assert.deepEqual(after, { temperature: 0.5, top_p: null, max_output_tokens: null });
  assert.equal(droppedCount(before, after, ["temperature"]), 1);
  assert.deepEqual(keepSupported(before, []), NO_SAMPLING);
  assert.equal(droppedCount(before, keepSupported(before, []), []), 2);
});

test("typed values: empty is the default, ranges hold, commas are decimal points", () => {
  assert.deepEqual(parseSetting("temperature", "  "), { ok: true, value: null });
  assert.deepEqual(parseSetting("temperature", "0"), { ok: true, value: 0 });
  assert.deepEqual(parseSetting("temperature", "0,7"), { ok: true, value: 0.7 });
  assert.deepEqual(parseSetting("temperature", "2"), { ok: true, value: 2 });
  assert.deepEqual(parseSetting("temperature", "2.1"), { ok: false, reason: "range" });
  assert.deepEqual(parseSetting("temperature", "-0.1"), { ok: false, reason: "range" });
  assert.deepEqual(parseSetting("temperature", "warm"), { ok: false, reason: "number" });
  assert.deepEqual(parseSetting("temperature", "1e3"), { ok: false, reason: "number" });
  assert.deepEqual(parseSetting("top_p", "0"), { ok: false, reason: "range" });
  assert.deepEqual(parseSetting("top_p", ".5"), { ok: true, value: 0.5 });
  assert.deepEqual(parseSetting("top_p", "1"), { ok: true, value: 1 });
  assert.deepEqual(parseSetting("max_output_tokens", "1.5"), { ok: false, reason: "whole" });
  assert.deepEqual(parseSetting("max_output_tokens", "0"), { ok: false, reason: "range" });
  assert.deepEqual(parseSetting("max_output_tokens", "200000"), { ok: true, value: 200000 });
  assert.deepEqual(parseSetting("max_output_tokens", "200001"), { ok: false, reason: "range" });
});

test("efforts are offered only where the model lists a choice, and kept across a change when offered", () => {
  const claude = engines[0];
  assert.deepEqual(effortChoices(claude, "opus"), ["low", "medium", "high", "xhigh", "max"]);
  assert.deepEqual(effortChoices(claude, "haiku"), []);
  assert.deepEqual(effortChoices(claude, "typed-model"), []);
  assert.equal(effortAfterChange(claude, "opus", "HIGH"), "high");
  assert.equal(effortAfterChange(claude, "haiku", "high"), null);
  assert.equal(effortAfterChange(claude, "opus", null), null);
});

test("the fallback model picker shows the default, a listed model, or Other", () => {
  const openrouter = engines[2];
  assert.equal(fallbackModelChoice(openrouter, null), "default");
  assert.equal(fallbackModelChoice(openrouter, "b/two"), "listed");
  assert.equal(fallbackModelChoice(openrouter, "x/custom"), "other");
  assert.equal(fallbackModelChoice(undefined, "x/custom"), "other");
});
