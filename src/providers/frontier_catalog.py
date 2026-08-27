"""Catalog of frontier model providers for AAIS (register disabled until configured)."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Any

from src.providers.http_chat_provider import HttpChatProvider, HttpChatProviderConfig, env_flag


@dataclass(frozen=True, slots=True)
class FrontierProviderSpec:
    """Describe one selectable frontier provider and how to activate it."""

    name: str
    display_name: str
    summary: str
    api_key_env: str
    model_env: str
    default_model: str
    base_url_env: str
    default_base_url: str
    activation_hint: str
    supports_stream: bool = True
    site_url_env: str = "AAIS_PROVIDER_SITE_URL"
    app_name_env: str = "AAIS_PROVIDER_APP_NAME"
    extra_headers: dict[str, str] = field(default_factory=dict)
    alternate_api_key_envs: tuple[str, ...] = ()
    model_catalog_note: str = ""
    frontier_family: str = ""


def _resolve_api_key(spec: FrontierProviderSpec) -> str:
    primary = os.getenv(spec.api_key_env, "").strip()
    if primary:
        return primary
    for env_name in spec.alternate_api_key_envs:
        value = os.getenv(env_name, "").strip()
        if value:
            return value
    return ""


def _nvidia_extra_body(model: str | None = None) -> dict[str, Any]:
    """Return model-specific NIM controls without exposing provider internals upstream."""
    model_id = str(model or "").strip().lower()
    if "muse-glimmer" in model_id:
        # Muse returns a separate reasoning trace that shares max_tokens with
        # the visible answer.  Keep the trace short for the interactive
        # Jarvis lane, while using the sampling settings NVIDIA recommends for
        # Muse rather than the lower-temperature defaults used by other APIs.
        effort = os.getenv("AAIS_NVIDIA_REASONING_EFFORT", "minimal").strip().lower()
        if effort not in {"none", "minimal", "low", "medium", "high", "max"}:
            effort = "minimal"
        return {
            "reasoning_effort": effort,
            "temperature": 0.95,
            "top_p": 1.0,
        }
    if model_id and "nemotron" not in model_id:
        return {}
    if env_flag("AAIS_NVIDIA_ENABLE_THINKING", default=False):
        return {"chat_template_kwargs": {"enable_thinking": True}}
    return {"chat_template_kwargs": {"enable_thinking": False}}


def _azure_endpoint() -> str:
    raw = os.getenv("AAIS_AZURE_OPENAI_ENDPOINT", "").strip().rstrip("/")
    if not raw:
        return ""
    if raw.endswith("/chat/completions"):
        return raw
    return f"{raw}/openai/deployments/{os.getenv('AAIS_AZURE_OPENAI_DEPLOYMENT', 'gpt-4o').strip()}/chat/completions?api-version=2024-08-01-preview"


# NVIDIA NIM — Muse Glimmer (primary) + Nemotron family via integrate.api.nvidia.com
_NVIDIA_MUSE_GLIMMER = "meta/muse-glimmer-30b"
_NVIDIA_NEMOTRON_3_NANO = "nvidia/nemotron-3-nano-30b-a3b"

FRONTIER_PROVIDER_SPECS: tuple[FrontierProviderSpec, ...] = (
    FrontierProviderSpec(
        name="god_brain",
        display_name="God Brain Local — GGUF via llama.cpp",
        summary="Your local GGUF model served by llama.cpp on 127.0.0.1:8080 (OpenAI-compatible).",
        api_key_env="GOD_BRAIN_LOCAL_API_KEY",
        model_env="AAIS_GOD_BRAIN_MODEL",
        default_model="Qwen2.5-7B-Instruct-Q4_K_M",
        base_url_env="AAIS_GOD_BRAIN_BASE_URL",
        default_base_url="http://127.0.0.1:8080/v1/chat/completions",
        activation_hint=(
            "Start llama-server with your GGUF (scripts/start-god-brain.sh) and set "
            "GOD_BRAIN_LOCAL_API_KEY=local in .env."
        ),
        frontier_family="local_gguf",
        model_catalog_note="Any GGUF loaded into llama-server; default Qwen2.5-7B-Instruct-Q4_K_M.",
    ),
    FrontierProviderSpec(
        name="openai",
        display_name="OpenAI — GPT / o-series",
        summary="Frontier GPT models through the OpenAI Chat Completions API.",
        api_key_env="OPENAI_API_KEY",
        model_env="AAIS_OPENAI_MODEL",
        default_model="gpt-4o-mini",
        base_url_env="AAIS_OPENAI_BASE_URL",
        default_base_url="https://api.openai.com/v1/chat/completions",
        activation_hint="Add OPENAI_API_KEY to .env (optional: AAIS_OPENAI_MODEL).",
        frontier_family="openai",
        model_catalog_note="gpt-4o, gpt-4o-mini, o3-mini, o1",
    ),
    FrontierProviderSpec(
        name="google",
        display_name="Google — Gemini",
        summary="Gemini frontier models via Google's OpenAI-compatible endpoint.",
        api_key_env="GOOGLE_API_KEY",
        model_env="AAIS_GEMINI_MODEL",
        default_model="gemini-2.0-flash",
        base_url_env="AAIS_GEMINI_BASE_URL",
        default_base_url="https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
        activation_hint="Add GOOGLE_API_KEY or GEMINI_API_KEY to .env.",
        alternate_api_key_envs=("GEMINI_API_KEY",),
        frontier_family="google",
        model_catalog_note="gemini-2.0-flash, gemini-2.5-pro",
    ),
    FrontierProviderSpec(
        name="mistral",
        display_name="Mistral — Large / Codestral",
        summary="Mistral frontier models for reasoning, coding, and multilingual tasks.",
        api_key_env="MISTRAL_API_KEY",
        model_env="AAIS_MISTRAL_MODEL",
        default_model="mistral-large-latest",
        base_url_env="AAIS_MISTRAL_BASE_URL",
        default_base_url="https://api.mistral.ai/v1/chat/completions",
        activation_hint="Add MISTRAL_API_KEY to .env.",
        frontier_family="mistral",
    ),
    FrontierProviderSpec(
        name="deepseek",
        display_name="DeepSeek — V3 / R1",
        summary="DeepSeek chat and reasoning models through an OpenAI-compatible API.",
        api_key_env="DEEPSEEK_API_KEY",
        model_env="AAIS_DEEPSEEK_MODEL",
        default_model="deepseek-chat",
        base_url_env="AAIS_DEEPSEEK_BASE_URL",
        default_base_url="https://api.deepseek.com/chat/completions",
        activation_hint="Add DEEPSEEK_API_KEY to .env.",
        frontier_family="deepseek",
    ),
    FrontierProviderSpec(
        name="xai",
        display_name="xAI — Grok",
        summary="Grok frontier models from xAI.",
        api_key_env="XAI_API_KEY",
        model_env="AAIS_XAI_MODEL",
        default_model="grok-2-latest",
        base_url_env="AAIS_XAI_BASE_URL",
        default_base_url="https://api.x.ai/v1/chat/completions",
        activation_hint="Add XAI_API_KEY to .env.",
        frontier_family="xai",
    ),
    FrontierProviderSpec(
        name="groq",
        display_name="Groq — Fast inference",
        summary="Ultra-low-latency hosted Llama, Mixtral, and other open-weight models on Groq.",
        api_key_env="GROQ_API_KEY",
        model_env="AAIS_GROQ_MODEL",
        default_model="llama-3.3-70b-versatile",
        base_url_env="AAIS_GROQ_BASE_URL",
        default_base_url="https://api.groq.com/openai/v1/chat/completions",
        activation_hint="Add GROQ_API_KEY to .env.",
        frontier_family="meta",
    ),
    FrontierProviderSpec(
        name="together",
        display_name="Together AI — Model hub",
        summary="Hundreds of open and frontier models through Together's OpenAI-compatible API.",
        api_key_env="TOGETHER_API_KEY",
        model_env="AAIS_TOGETHER_MODEL",
        default_model="meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo",
        base_url_env="AAIS_TOGETHER_BASE_URL",
        default_base_url="https://api.together.xyz/v1/chat/completions",
        activation_hint="Add TOGETHER_API_KEY to .env.",
        frontier_family="meta",
    ),
    FrontierProviderSpec(
        name="fireworks",
        display_name="Fireworks AI — Fast open models",
        summary="High-throughput Llama, Qwen, and Nemotron-class models on Fireworks.",
        api_key_env="FIREWORKS_API_KEY",
        model_env="AAIS_FIREWORKS_MODEL",
        default_model="accounts/fireworks/models/llama-v3p1-70b-instruct",
        base_url_env="AAIS_FIREWORKS_BASE_URL",
        default_base_url="https://api.fireworks.ai/inference/v1/chat/completions",
        activation_hint="Add FIREWORKS_API_KEY to .env.",
        frontier_family="meta",
    ),
    FrontierProviderSpec(
        name="perplexity",
        display_name="Perplexity — Sonar",
        summary="Sonar online and reasoning models with grounded web retrieval.",
        api_key_env="PERPLEXITY_API_KEY",
        model_env="AAIS_PERPLEXITY_MODEL",
        default_model="sonar",
        base_url_env="AAIS_PERPLEXITY_BASE_URL",
        default_base_url="https://api.perplexity.ai/chat/completions",
        activation_hint="Add PERPLEXITY_API_KEY to .env.",
        frontier_family="perplexity",
    ),
    FrontierProviderSpec(
        name="nvidia",
        display_name="NVIDIA — Muse Glimmer",
        summary=(
            "NVIDIA NIM OpenAI-compatible chat via integrate.api.nvidia.com. "
            "Default brain: Meta Muse Glimmer 30B; Nemotron models remain selectable via AAIS_NVIDIA_MODEL."
        ),
        api_key_env="NVIDIA_API_KEY",
        model_env="AAIS_NVIDIA_MODEL",
        default_model=_NVIDIA_MUSE_GLIMMER,
        base_url_env="AAIS_NVIDIA_BASE_URL",
        default_base_url="https://integrate.api.nvidia.com/v1/chat/completions",
        activation_hint=(
            "Add NVIDIA_API_KEY from build.nvidia.com. Default model is meta/muse-glimmer-30b "
            "(override with AAIS_NVIDIA_MODEL). Optional: AAIS_NVIDIA_ENABLE_THINKING=1 for Nemotron traces."
        ),
        alternate_api_key_envs=("NVDA_API_KEY", "NGC_API_KEY"),
        frontier_family="nvidia_nim",
        model_catalog_note=(
            "meta/muse-glimmer-30b (default), nvidia/nemotron-3-nano-30b-a3b, "
            "nemotron-3-super / ultra (upcoming)."
        ),
    ),
    FrontierProviderSpec(
        name="azure_openai",
        display_name="Azure OpenAI",
        summary="Enterprise GPT deployments on Azure OpenAI Service.",
        api_key_env="AZURE_OPENAI_API_KEY",
        model_env="AAIS_AZURE_OPENAI_DEPLOYMENT",
        default_model="gpt-4o",
        base_url_env="AAIS_AZURE_OPENAI_ENDPOINT",
        default_base_url="",
        activation_hint=(
            "Set AZURE_OPENAI_API_KEY and AAIS_AZURE_OPENAI_ENDPOINT (resource URL); "
            "AAIS_AZURE_OPENAI_DEPLOYMENT names your deployment."
        ),
        frontier_family="openai",
    ),
    FrontierProviderSpec(
        name="moonshot",
        display_name="Moonshot — Kimi",
        summary="Kimi frontier models through Moonshot's OpenAI-compatible API.",
        api_key_env="MOONSHOT_API_KEY",
        model_env="AAIS_MOONSHOT_MODEL",
        default_model="moonshot-v1-8k",
        base_url_env="AAIS_MOONSHOT_BASE_URL",
        default_base_url="https://api.moonshot.cn/v1/chat/completions",
        activation_hint="Add MOONSHOT_API_KEY to .env.",
        frontier_family="moonshot",
    ),
    FrontierProviderSpec(
        name="ai21",
        display_name="AI21 — Jamba",
        summary="AI21 Jamba and instruction-tuned models.",
        api_key_env="AI21_API_KEY",
        model_env="AAIS_AI21_MODEL",
        default_model="jamba-large",
        base_url_env="AAIS_AI21_BASE_URL",
        default_base_url="https://api.ai21.com/studio/v1/chat/completions",
        activation_hint="Add AI21_API_KEY to .env.",
        frontier_family="ai21",
    ),
)


PROVIDER_ALIASES: dict[str, str] = {
    "godbrain": "god_brain",
    "god_brain_local": "god_brain",
    "gguf": "god_brain",
    "gpt": "openai",
    "chatgpt": "openai",
    "oai": "openai",
    "gemini": "google",
    "grok": "xai",
    "nemotron": "nvidia",
    "nvidia_nim": "nvidia",
    "nim": "nvidia",
    "muse": "nvidia",
    "glimmer": "nvidia",
    "muse_glimmer": "nvidia",
    "sonar": "perplexity",
    "kimi": "moonshot",
    "azure": "azure_openai",
    "azure_open_ai": "azure_openai",
}


def resolve_provider_alias(provider_id: str | None) -> str:
    cleaned = " ".join(str(provider_id or "").lower().split()).strip().replace("-", "_")
    return PROVIDER_ALIASES.get(cleaned, cleaned)


def build_http_adapter(spec: FrontierProviderSpec) -> HttpChatProvider:
    api_key = _resolve_api_key(spec)
    model = os.getenv(spec.model_env, "").strip() or spec.default_model
    if spec.name == "azure_openai":
        endpoint = _azure_endpoint()
    else:
        endpoint = os.getenv(spec.base_url_env, "").strip() or spec.default_base_url
    app_name = os.getenv(spec.app_name_env, "").strip() or "AAIS Jarvis"
    site_url = os.getenv(spec.site_url_env, "").strip()
    extra_body: dict[str, Any] = {}
    if spec.name == "nvidia":
        extra_body = _nvidia_extra_body(model)
    config = HttpChatProviderConfig(
        provider_id=spec.name,
        default_model=model,
        endpoint=endpoint,
        api_key=api_key,
        app_name=app_name,
        site_url=site_url,
        extra_headers=dict(spec.extra_headers),
        default_extra_body=extra_body,
    )
    return HttpChatProvider(config)


def frontier_remote_labels() -> dict[str, str]:
    return {spec.name: spec.display_name for spec in FRONTIER_PROVIDER_SPECS}


def frontier_model_envs() -> dict[str, str]:
    return {spec.name: spec.model_env for spec in FRONTIER_PROVIDER_SPECS}


def frontier_default_models() -> dict[str, str]:
    return {spec.name: spec.default_model for spec in FRONTIER_PROVIDER_SPECS}
