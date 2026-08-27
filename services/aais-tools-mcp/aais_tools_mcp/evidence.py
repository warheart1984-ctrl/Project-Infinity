"""Mutation evidence / audit log for AAIS operator tools.

Mythic: Workshop Trace Ledger
Engineering: MutationEvidenceLog

Inputs: mutation event dict
Outputs: appended JSONL line under .runtime/aais-tools-mcp/
Constraints: never stores secret file contents; gitignored via .runtime/
Failure modes: disk error → event still returned to caller with log_error set
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def _utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


class MutationEvidenceLog:
    """Append-only JSONL audit log for write/patch/command mutations."""

    def __init__(self, workspace_root: Path) -> None:
        self.workspace_root = workspace_root
        self.log_dir = workspace_root / ".runtime" / "aais-tools-mcp"
        self.log_path = self.log_dir / "mutations.jsonl"

    def record(self, event: dict[str, Any]) -> dict[str, Any]:
        payload = {
            "ts": _utc_now(),
            "server": "aais-tools-mcp",
            **event,
        }
        try:
            self.log_dir.mkdir(parents=True, exist_ok=True)
            with self.log_path.open("a", encoding="utf-8") as handle:
                handle.write(json.dumps(payload, sort_keys=True) + "\n")
            payload["evidence_path"] = str(self.log_path.relative_to(self.workspace_root))
            payload["logged"] = True
        except OSError as exc:
            payload["logged"] = False
            payload["log_error"] = str(exc)
        return payload


def writes_allowed(*, explicit_allow: bool = False) -> bool:
    """Writes require env policy and/or explicit per-call allow flag."""
    env_flag = os.getenv("AAIS_TOOLS_MCP_ALLOW_WRITES", "0").strip().lower()
    env_ok = env_flag in {"1", "true", "yes", "on"}
    return bool(env_ok and explicit_allow)
