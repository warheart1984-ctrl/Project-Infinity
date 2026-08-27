"""Jarvis/AAIS local adapter for the AAIS Tools MCP catalog.

Mythic: Workshop Direct Plug (repo entry)
Engineering: import shim for AaisOperatorToolsCapability

Inputs: optional workspace_root
Outputs: AaisOperatorToolsCapability instance / invoke helpers
Constraints: does not launch MCP stdio; local same-process calls only
Failure modes: missing service package → ImportError with install hint
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

_SERVICE_ROOT = Path(__file__).resolve().parents[1] / "services" / "aais-tools-mcp"
if _SERVICE_ROOT.is_dir() and str(_SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(_SERVICE_ROOT))

from aais_tools_mcp.capability_adapter import AaisOperatorToolsCapability  # noqa: E402

__all__ = [
    "AaisOperatorToolsCapability",
    "get_aais_operator_tools",
    "invoke_aais_operator_tool",
]


def get_aais_operator_tools(workspace_root: str | Path | None = None) -> AaisOperatorToolsCapability:
    return AaisOperatorToolsCapability(workspace_root=workspace_root)


def invoke_aais_operator_tool(
    tool_name: str,
    args: dict[str, Any] | None = None,
    *,
    workspace_root: str | Path | None = None,
) -> dict[str, Any]:
    return get_aais_operator_tools(workspace_root).invoke(tool_name, args)
