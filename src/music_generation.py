"""Local music generation adapter for AAIS.

Mythic: Music Loop Engine
Engineering: MusicGenerationAdapter

Uses Hugging Face MusicGen when available; respects AAIS_DISABLE_MUSIC_GENERATION.
"""

from __future__ import annotations

import io
import os
import wave
from typing import Any

from src.logger import get_logger

logger = get_logger(__name__)

DEFAULT_MUSIC_MODEL = "facebook/musicgen-small"


def music_generation_disabled() -> bool:
    return os.getenv("AAIS_DISABLE_MUSIC_GENERATION", "false").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }


def _resolve_model_id() -> str:
    return os.getenv("AAIS_MUSIC_MODEL_NAME", "").strip() or DEFAULT_MUSIC_MODEL


def _float_pcm16_wav_bytes(samples, *, sample_rate: int) -> bytes:
    import numpy as np

    clipped = np.clip(np.asarray(samples, dtype=np.float32), -1.0, 1.0)
    pcm = (clipped * 32767.0).astype("<i2")
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(int(sample_rate))
        handle.writeframes(pcm.tobytes())
    return buffer.getvalue()


def _synthetic_preview_wav(*, prompt: str, duration_sec: float = 2.0) -> dict[str, Any]:
    """Deterministic short tone used when real MusicGen is unavailable in tests/mock."""
    import math

    sample_rate = 16000
    total = max(1, int(sample_rate * float(duration_sec)))
    seed = sum(ord(ch) for ch in (prompt or "music")) % 40
    freq = 220.0 + seed * 4.5
    samples = [
        0.25 * math.sin(2.0 * math.pi * freq * (index / sample_rate))
        for index in range(total)
    ]
    wav_bytes = _float_pcm16_wav_bytes(samples, sample_rate=sample_rate)
    return {
        "format": "wav",
        "sample_rate": sample_rate,
        "model": "synthetic-preview",
        "audio": wav_bytes,
        "duration_sec": duration_sec,
        "prompt": prompt,
    }


class MusicGenerationAdapter:
    """Lazy MusicGen wrapper with a synthetic fallback for mock/disabled stacks."""

    def __init__(self) -> None:
        self._processor = None
        self._model = None
        self.model_id = _resolve_model_id()

    def _load(self) -> None:
        if self._model is not None:
            return
        if music_generation_disabled():
            raise RuntimeError("Music generation is disabled for this deployment")
        try:
            import torch
            from transformers import AutoProcessor, MusicgenForConditionalGeneration
        except ImportError as exc:
            raise ImportError(
                "transformers (+ torch) is required for MusicGen. "
                "Install model runtime extras, or set AAIS_MUSIC_ALLOW_SYNTHETIC=1 for preview tones."
            ) from exc

        logger.info("Loading music model: %s", self.model_id)
        self._processor = AutoProcessor.from_pretrained(self.model_id)
        self._model = MusicgenForConditionalGeneration.from_pretrained(self.model_id)
        if torch.cuda.is_available():
            self._model = self._model.to("cuda")
        logger.info("Music model loaded")

    def generate(
        self,
        prompt: str,
        *,
        duration_sec: float = 6.0,
        allow_synthetic: bool | None = None,
    ) -> dict[str, Any]:
        cleaned = " ".join(str(prompt or "").split()).strip()
        if not cleaned:
            raise ValueError("Prompt is required")

        duration = max(1.0, min(float(duration_sec or 6.0), 20.0))
        synthetic_allowed = (
            allow_synthetic
            if allow_synthetic is not None
            else os.getenv("AAIS_MUSIC_ALLOW_SYNTHETIC", "").strip().lower()
            in {"1", "true", "yes", "on"}
            or os.getenv("AAIS_MODEL_MODE", "").strip().lower() == "mock"
        )

        if music_generation_disabled() and synthetic_allowed:
            return _synthetic_preview_wav(prompt=cleaned, duration_sec=min(duration, 3.0))

        try:
            self._load()
            import torch

            inputs = self._processor(
                text=[cleaned],
                padding=True,
                return_tensors="pt",
            )
            if next(self._model.parameters()).is_cuda:
                inputs = {key: value.to("cuda") for key, value in inputs.items()}

            # MusicGen uses ~50 frames / second of audio at 32kHz for small models.
            max_new_tokens = max(64, int(duration * 50))
            with torch.no_grad():
                audio_values = self._model.generate(**inputs, max_new_tokens=max_new_tokens)

            sample_rate = int(getattr(self._model.config, "sampling_rate", None) or 32000)
            audio_encoder = getattr(self._model.config, "audio_encoder", None)
            if audio_encoder is not None:
                sample_rate = int(getattr(audio_encoder, "sampling_rate", sample_rate) or sample_rate)
            waveform = audio_values[0, 0].detach().cpu().numpy()
            wav_bytes = _float_pcm16_wav_bytes(waveform, sample_rate=sample_rate)
            return {
                "format": "wav",
                "sample_rate": sample_rate,
                "model": self.model_id,
                "audio": wav_bytes,
                "duration_sec": duration,
                "prompt": cleaned,
            }
        except Exception as exc:
            if synthetic_allowed:
                logger.warning("MusicGen unavailable (%s); using synthetic preview", exc)
                return _synthetic_preview_wav(prompt=cleaned, duration_sec=min(duration, 3.0))
            raise


music_generation_adapter = MusicGenerationAdapter()
