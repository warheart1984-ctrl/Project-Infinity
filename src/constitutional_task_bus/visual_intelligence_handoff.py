"""Visual Intelligence Handoff Adapter — suffix token → picture_generation lane.

# Mythic: Visual Intelligence Handoff
# Engineering: VisualIntelligenceHandoffAdapter
"""

from __future__ import annotations

import uuid
from typing import Any, TypedDict


VISUAL_CREATION_COMPLETE_TOKEN = (
    "render visual generate image picture perfection no upgrade no fixes create what is described"
)


class VisualIntelligenceHandoffResult(TypedDict, total=False):
    matched: bool
    body: str
    intent: dict[str, Any]
    pictures: list[dict[str, Any]]


def _strip_token_suffix(raw: str) -> tuple[str, bool]:
    # Trim only — no internal whitespace collapse (frozen ingest contract v1).
    normalized = str(raw or "").strip()
    lower = normalized.lower()
    token_lower = VISUAL_CREATION_COMPLETE_TOKEN.lower()
    if not lower.endswith(token_lower):
        return normalized, False
    body = normalized[: len(normalized) - len(VISUAL_CREATION_COMPLETE_TOKEN)].strip()
    if not body:
        return normalized, False
    return body, True


def parse_visual_intelligence_handoff(text: str) -> VisualIntelligenceHandoffResult:
    """Suffix-match completion token; strip before display/dispatch."""
    body, matched = _strip_token_suffix(text)
    if not matched:
        return {"matched": False, "body": body}

    picture_id = f"vi-{uuid.uuid4().hex[:12]}"
    return {
        "matched": True,
        "body": body,
        "intent": {
            "kind": "picture",
            "tags": ["visual_intelligence", "authorized"],
        },
        "pictures": [
            {
                "id": picture_id,
                "action": "make_picture",
                "target": body,
                "engine": "aais_image",
                "params": {"source": "visual_intelligence_handoff"},
            }
        ],
    }
