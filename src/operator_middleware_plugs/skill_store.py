"""AAIS Skill Store — list / invoke / govern.

# Mythic: Skill Store subcontract
# Engineering: SkillStoreRegistry
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any


BUILTIN: list[dict[str, Any]] = [
    {
        "skillId": "capability_bridge",
        "displayName": "Capability Bridge Compose",
        "provider": "gpt_tools",
        "description": "Compose AAIS capability bridge hops for a target",
        "authorityLevel": "assist",
        "tags": ["skill", "compose"],
    },
    {
        "skillId": "workflow_compose",
        "displayName": "Workflow Compose",
        "provider": "gpt_tools",
        "description": "Plan a governed workflow chain",
        "authorityLevel": "assist",
        "tags": ["skill", "workflow"],
    },
    {
        "skillId": "longform_writer",
        "displayName": "Longform Writer",
        "provider": "claude_writer",
        "description": "Governed longform draft (not Computer Use)",
        "authorityLevel": "assist",
        "tags": ["skill", "write", "longform"],
    },
    {
        "skillId": "critique_pass",
        "displayName": "Critique Pass",
        "provider": "claude_writer",
        "description": "Structured critique of operator text",
        "authorityLevel": "assist",
        "tags": ["skill", "write"],
    },
]


class SkillStoreRegistry:
    def __init__(self, file_path: Path | None = None) -> None:
        configured = os.getenv("AAIS_RUNTIME_DIR")
        root = Path(configured).expanduser() if configured else Path(__file__).resolve().parents[2] / ".runtime"
        self._path = file_path or (root / "skill_store" / "catalog.json")

    def _overlay(self) -> list[dict[str, Any]]:
        if not self._path.is_file():
            return []
        try:
            raw = json.loads(self._path.read_text(encoding="utf-8"))
            return list(raw.get("skills") or [])
        except (json.JSONDecodeError, OSError):
            return []

    def list(self) -> list[dict[str, Any]]:
        by_id = {s["skillId"]: s for s in BUILTIN}
        for s in self._overlay():
            if s.get("skillId"):
                by_id[str(s["skillId"])] = s
        return list(by_id.values())

    def invoke(
        self,
        skill_id: str,
        *,
        args: dict[str, Any] | None = None,
        operator_approved: bool = False,
    ) -> dict[str, Any]:
        skill = next((s for s in self.list() if s.get("skillId") == skill_id), None)
        if not skill:
            return {
                "ok": False,
                "reason_code": "SKILL_STORE_NOT_FOUND",
                "error": f"Unknown skill: {skill_id}",
            }
        if skill.get("authorityLevel") == "execute" and not operator_approved:
            return {
                "ok": False,
                "reason_code": "SKILL_STORE_NEEDS_APPROVAL",
                "error": "Execute-level skill requires operator_approved",
                "skill": skill,
            }
        return {
            "ok": True,
            "reason_code": "SKILL_STORE_INVOKED",
            "skill": skill,
            "args": args or {},
            "plan": {
                "provider": skill.get("provider"),
                "next": skill.get("provider"),
            },
        }

    def catalog(self) -> dict[str, Any]:
        skills = self.list()
        return {
            "store": "AAIS Skill Store",
            "count": len(skills),
            "skills": skills,
            "not_claimed": [
                "Vendor ChatGPT/Claude marketplace clone",
                "Unsigned third-party skill install",
            ],
        }


skill_store_registry = SkillStoreRegistry()
