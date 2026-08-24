"""Model management for switching between different models"""

from src.logger import get_logger
from src.providers.frontier_model_library import MODEL_LIBRARY, list_library

logger = get_logger(__name__)


class ModelManager:
    """Manage multiple models across chat / image / voice / music modalities."""

    def __init__(self):
        self.loaded_models = {}
        self.available_models = {
            "text": [
                entry.model_id
                for entry in MODEL_LIBRARY
                if entry.modality == "chat"
            ],
            "image": [
                entry.model_id
                for entry in MODEL_LIBRARY
                if entry.modality == "image"
            ],
            "img2img": [
                entry.model_id
                for entry in MODEL_LIBRARY
                if entry.modality == "img2img"
            ],
            "vision": [
                "openai/clip-vit-base-patch32",
                "openai/clip-vit-large-patch14",
            ],
            "voice_stt": [
                entry.model_id
                for entry in MODEL_LIBRARY
                if entry.modality == "voice_stt"
            ],
            "voice_tts": [
                entry.model_id
                for entry in MODEL_LIBRARY
                if entry.modality == "voice_tts"
            ],
            "music": [
                entry.model_id
                for entry in MODEL_LIBRARY
                if entry.modality == "music"
            ],
        }

    def list_available_models(self, task_type: str):
        """List available models for a task type (legacy key or modality)."""
        key = str(task_type or "").strip().lower()
        if key in {"chat", "llm"}:
            key = "text"
        return self.available_models.get(key, [])

    def list_library(self, *, modality: str | None = None, free_only: bool = False):
        return list_library(modality=modality, free_only=free_only)


model_manager = ModelManager()
