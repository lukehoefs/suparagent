"""The engine registry: which engines this app can run turns on, what each can
do, and whether each is usable right now (docs/ENGINES.md).

It reads the runtime's adapters live (tests swap them), so it owns no engines
of its own. Every read of an adapter's self-description has a safe default, so
an adapter written against the smaller contract still works: no capabilities,
any model, and a probe derived from `status()`.

Nothing here runs at startup. A probe runs only when someone asks for the
engines (GET /api/v1/engines) and is bounded by a timeout; an adapter that
cannot be built, a probe that raises and a probe that hangs all come out as an
engine that is "unavailable", with the reason, never as an error.
"""

import asyncio
import os
import re
from dataclasses import dataclass, field

from app.core.logging import get_logger
from app.services.provider_adapter import NO_CAPABILITIES, Capabilities, EngineProbe, ModelOption

logger = get_logger(__name__)

PROBE_TIMEOUT_SECONDS = 12.0
PROBE_CACHE_SECONDS = 15.0
# A probe older than this is awaited again; younger than this, a stale one is served while a new one runs.
STALE_PROBE_SECONDS = 600.0

# A model id is an argument value for a CLI or a field in a request, never a
# flag or shell text: one line, no spaces, not starting with "-".
_MODEL_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:/@+\-\[\]]{0,199}$")


class UnknownEngine(Exception):
    pass


class InvalidModel(ValueError):
    pass


class UnavailableAdapter:
    """Stands in for an adapter that could not be built, so the rest of the
    engines still load and this one shows why it is missing."""

    kind = "cli"
    capabilities = NO_CAPABILITIES
    models: list[ModelOption] = []
    custom_models = False

    def __init__(self, key: str, label: str, reason: str) -> None:
        self.key = key
        self.label = label
        self.reason = reason

    def new_session_id(self) -> None:
        return None

    async def status(self):
        from app.services.provider_adapter import ProviderStatus

        return ProviderStatus(ready=False, error=self.reason)

    async def probe(self) -> EngineProbe:
        return EngineProbe(installed=False, ready=False, reason=self.reason)

    async def run_turn(self, ctx, sink, gate):
        from app.services.provider_adapter import TurnOutcome

        return TurnOutcome("failed", error=self.reason, error_code="engine_unavailable")


HOSTED_REASON = "This hosted service runs agents in your own private sandbox. Choose the Claude engine."


def hosted_adapters() -> dict:
    """What a hosted deployment offers (HOST_EXECUTION_DISABLED): Claude, run in the account's
    Boat sandbox. Every other engine would start a process or call out from this server, so it is
    listed as unavailable with the reason, and keeps its key so stored agents still resolve."""
    from app.services.boat_adapter import BoatClaudeAdapter, SdkBoatBoxes

    labels = {"codex": "Codex", "cursor": "Cursor", "gemini": "Gemini CLI",
              "antigravity": "Google Gemini (Antigravity)", "opencode": "OpenCode (experimental)",
              "openrouter": "OpenRouter", "acp": "ACP agent", "openai_compat": "OpenAI-compatible"}
    adapters: dict = {"claude": BoatClaudeAdapter(SdkBoatBoxes())}
    for key, label in labels.items():
        adapters[key] = UnavailableAdapter(key, label, HOSTED_REASON)
    return adapters


def default_adapters() -> dict:
    """Every built-in engine. One that cannot be built is kept as unavailable."""
    from app.core.config import settings

    if settings.HOST_EXECUTION_DISABLED:
        return hosted_adapters()
    from app.services.acp_adapter import AcpAdapter
    from app.services.antigravity_adapter import AntigravityAdapter
    from app.services.acp_presets import GeminiAdapter, CursorAdapter, OpenCodeAdapter
    from app.services.claude_adapter import ClaudeAdapter
    from app.services.codex_adapter import CodexAdapter
    from app.services.openai_chat_adapter import OpenAIChatAdapter, OpenRouterAdapter

    adapters: dict = {}
    for key, label, factory in (
        ("claude", "Claude", ClaudeAdapter),
        ("codex", "Codex", CodexAdapter),
        ("cursor", "Cursor", CursorAdapter),
        ("gemini", "Gemini CLI", GeminiAdapter),
        ("antigravity", "Google Gemini (Antigravity)", AntigravityAdapter),
        ("opencode", "OpenCode (experimental)", OpenCodeAdapter),
        ("openrouter", "OpenRouter", OpenRouterAdapter),
        ("acp", "ACP agent", AcpAdapter),
        ("openai_compat", "OpenAI-compatible", OpenAIChatAdapter),
    ):
        selected = os.environ.get("SUPARAGENT_PRESET_ENGINES")
        enabled = {name.strip() for name in selected.split(",")} if selected is not None else {"gemini", "cursor", "openrouter", "antigravity"}
        if key in {"gemini", "cursor", "opencode", "openrouter", "antigravity"} and key not in enabled:
            continue
        try:
            adapters[key] = factory()
        except Exception as exc:  # noqa: BLE001
            logger.exception("could not set up an engine", engine=key)
            adapters[key] = UnavailableAdapter(key, label, f"This engine could not be set up ({exc.__class__.__name__}).")
    return adapters


def label_of(adapter, key: str) -> str:
    label = getattr(adapter, "label", None)
    return label if isinstance(label, str) and label else key


def capabilities_of(adapter) -> Capabilities:
    caps = getattr(adapter, "capabilities", None)
    return caps if isinstance(caps, Capabilities) else NO_CAPABILITIES


def static_models(adapter) -> list[ModelOption]:
    models = getattr(adapter, "models", None)
    return [m for m in models if isinstance(m, ModelOption)] if isinstance(models, list) else []


# The agent's sampling settings an engine may send (Agent.temperature, top_p,
# max_output_tokens). An adapter lists the ones it sends in `generation_params`;
# one that lists none (every CLI and ACP engine) picks its own sampling.
GENERATION_PARAMS = ("temperature", "top_p", "max_output_tokens")


def generation_params_of(adapter) -> tuple[str, ...]:
    value = getattr(adapter, "generation_params", None)
    if not isinstance(value, (list, tuple)):
        return ()
    return tuple(p for p in GENERATION_PARAMS if p in value)


def model_generation_params(option: ModelOption, engine_params: tuple[str, ...]) -> list[str]:
    """What one model takes: its own list when the engine knows it per model,
    never more than the engine sends; otherwise the engine's."""
    own = getattr(option, "generation_params", None)
    if own is None:
        return list(engine_params)
    return [p for p in engine_params if p in own]


def accepts_custom_models(adapter) -> bool:
    # An adapter that says nothing accepts any model, as before the registry.
    value = getattr(adapter, "custom_models", None)
    return True if value is None else bool(value)


def check_model_id(model: str) -> None:
    if not _MODEL_ID.match(model):
        raise InvalidModel(
            "A model id is one word of letters, digits and . _ : / @ + - [ ], "
            "and does not start with '-'."
        )


async def run_probe(adapter, timeout: float) -> EngineProbe:
    """The adapter's probe (or one derived from `status()`), never raising and
    never taking longer than `timeout`."""

    async def probe() -> EngineProbe:
        own = getattr(adapter, "probe", None)
        if callable(own):
            return await own()
        status = await adapter.status()
        installed = getattr(status, "installed", None)
        return EngineProbe(
            installed=installed if installed is not None else (status.ready or status.version is not None),
            ready=status.ready,
            version=status.version,
            signed_in=getattr(status, "signed_in", None),
            reason=None if status.ready else status.error,
        )

    try:
        result = await asyncio.wait_for(probe(), timeout)
    except asyncio.TimeoutError:
        return EngineProbe(
            installed=False,
            ready=False,
            reason=f"This engine did not report its status within {timeout:g} seconds. "
            "Check that its command starts in a terminal.",
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("engine probe failed", engine=getattr(adapter, "key", "?"), error=exc.__class__.__name__)
        return EngineProbe(installed=False, ready=False, reason=f"The status check failed ({exc.__class__.__name__}).")
    if not isinstance(result, EngineProbe):
        return EngineProbe(installed=False, ready=False, reason="The status check returned nothing usable.")
    return result


@dataclass
class EngineRegistry:
    runtime: object
    probe_timeout: float = PROBE_TIMEOUT_SECONDS
    cache_seconds: float = PROBE_CACHE_SECONDS
    _cache: dict = field(default_factory=dict)
    _refreshing: dict = field(default_factory=dict)

    @property
    def adapters(self) -> dict:
        return self.runtime.adapters

    def ids(self) -> list[str]:
        return list(self.adapters)

    def get(self, engine_id: str):
        adapter = self.adapters.get(engine_id)
        if adapter is None:
            raise UnknownEngine(engine_id)
        return adapter

    def capabilities(self, engine_id: str) -> Capabilities:
        return capabilities_of(self.get(engine_id))

    def check_model(self, engine_id: str, model: str | None) -> None:
        """Raise UnknownEngine or InvalidModel. None (the engine's default) is
        always fine. An engine without custom models takes only ids from its
        catalog, including a live one a probe found."""
        adapter = self.get(engine_id)
        if model is None:
            return
        check_model_id(model)
        if accepts_custom_models(adapter):
            return
        known = {m.id for m in static_models(adapter)}
        cached = self._cache.get(engine_id)
        if cached is not None and cached[1].models:
            known |= {m.id for m in cached[1].models}
        if model not in known:
            label = label_of(adapter, engine_id)
            raise InvalidModel(
                f"{label} has no model named {model!r}."
                + (" It runs the agent's own default model only." if not known else "")
            )

    def known_models(self, engine_id: str) -> list[ModelOption]:
        """The engine's catalog: a live one a probe found, or the adapter's own."""
        adapter = self.get(engine_id)
        cached = self._cache.get(engine_id)
        if cached is not None and cached[2] is adapter and cached[1].models:
            return list(cached[1].models)
        return static_models(adapter)

    def model_option(self, engine_id: str, model: str | None) -> ModelOption | None:
        """The catalog entry a turn on `model` would use (None: the engine's
        default), or None when the catalog does not have it."""
        models = self.known_models(engine_id)
        if model is None:
            return next((m for m in models if m.default), None)
        return next((m for m in models if m.id == model), None)

    def reasoning_efforts(self, engine_id: str, model: str | None) -> tuple[str, ...]:
        """The efforts the catalog says this model takes; empty when that is not
        known (no catalog entry, or none listed), and then nothing is checked.
        With no model and no default, the efforts every catalog model shares."""
        option = self.model_option(engine_id, model)
        if option is None and model is None:
            lists = {tuple(m.supported_reasoning_efforts) for m in self.known_models(engine_id)
                     if m.reasoning_effort_configurable}
            return lists.pop() if len(lists) == 1 else ()
        if option is None or not option.reasoning_effort_configurable:
            return ()
        return tuple(option.supported_reasoning_efforts)

    def generation_params(self, engine_id: str, model: str | None) -> tuple[str, ...]:
        """Which sampling settings a turn on this engine and model sends. A model
        the catalog does not list gets what the engine sends."""
        adapter = self.get(engine_id)
        engine_params = generation_params_of(adapter)
        if not engine_params:
            return ()
        option = self.model_option(engine_id, model)
        return tuple(model_generation_params(option, engine_params)) if option is not None else engine_params

    def forget(self, engine_id: str | None = None) -> None:
        if engine_id is None:
            self._cache.clear()
        else:
            self._cache.pop(engine_id, None)

    async def _probe(self, engine_id: str, adapter, refresh: bool) -> EngineProbe:
        loop = asyncio.get_running_loop()
        cached = self._cache.get(engine_id)
        if not refresh and cached is not None and cached[2] is adapter:
            age = loop.time() - cached[0]
            if age < self.cache_seconds:
                return cached[1]
            if age < STALE_PROBE_SECONDS:
                # Answer from the last probe now and look again in the background: opening the app must not
                # wait on every CLI being checked. A sign-in or sign-out calls forget() or refresh=true.
                self._refresh_in_background(engine_id, adapter)
                return cached[1]
        return await self._probe_now(engine_id, adapter)

    async def _probe_now(self, engine_id: str, adapter) -> EngineProbe:
        loop = asyncio.get_running_loop()
        await self.runtime.prepare_adapter(engine_id, adapter)
        result = await run_probe(adapter, self.probe_timeout)
        self._cache[engine_id] = (loop.time(), result, adapter)
        return result

    def _refresh_in_background(self, engine_id: str, adapter) -> None:
        task = self._refreshing.get(engine_id)
        if task is not None and not task.done():
            return

        async def refresh() -> None:
            try:
                await self._probe_now(engine_id, adapter)
            except Exception:  # noqa: BLE001 - the stale answer stays until the next try
                pass

        self._refreshing[engine_id] = asyncio.get_running_loop().create_task(refresh())

    async def describe(self, *, refresh: bool = False, only: str | None = None) -> list[dict]:
        items = [(k, a) for k, a in self.adapters.items() if only is None or k == only]
        probes = await asyncio.gather(*(self._probe(k, a, refresh) for k, a in items))
        out = []
        for (engine_id, adapter), probe in zip(items, probes):
            out.append(await self._entry(engine_id, adapter, probe))
        return out

    async def _entry(self, engine_id: str, adapter, probe: EngineProbe) -> dict:
        models = probe.models if probe.models else static_models(adapter)
        default = next((m.id for m in models if m.default), None)
        engine_params = generation_params_of(adapter)
        config = None
        public = getattr(adapter, "public_config", None)
        if getattr(adapter, "needs_config", False) and callable(public):
            try:
                config = public(getattr(adapter, "config", None))
            except Exception:  # noqa: BLE001
                config = None
        return {
            "id": engine_id,
            "label": label_of(adapter, engine_id),
            "kind": getattr(adapter, "kind", "cli"),
            "installed": bool(probe.installed),
            "version": probe.version,
            "signed_in": probe.signed_in,
            "available": bool(probe.ready),
            "reason": None if probe.ready else (probe.reason or "This engine is not ready."),
            "models": [{"id": m.id, "label": m.label, "default": m.default, "default_reasoning_effort": getattr(m, "default_reasoning_effort", None), "supported_reasoning_efforts": list(getattr(m, "supported_reasoning_efforts", ())), "reasoning_effort_configurable": getattr(m, "reasoning_effort_configurable", True), "generation_params": model_generation_params(m, engine_params)} for m in models],
            "default_model": default,
            "custom_models": accepts_custom_models(adapter),
            # What a model not in `models` (or the endpoint's own default) takes.
            "generation_params": list(engine_params),
            "capabilities": capabilities_of(adapter).as_dict(),
            "configurable": bool(getattr(adapter, "needs_config", False)),
            # Can write a quick text call (usable as the helper model, docs/MEMORY.md).
            "can_write_text": getattr(adapter, "generate_text", None) is not None,
            "config": config,
            "preset": bool(getattr(adapter, "preset", False)),
            "setup": getattr(adapter, "setup", None),
            "config_fields": getattr(adapter, "config_fields", []),
            "limit": self.runtime.engine_limit(engine_id) if callable(getattr(self.runtime, "engine_limit", None)) else None,
        }
