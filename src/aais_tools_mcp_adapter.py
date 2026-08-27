"""Jarvis/AAIS local + stdio transport selector for AAIS Tools MCP.

Mythic: Workshop Direct Plug (repo entry)
Engineering: import shim + transport preferrer for AaisOperatorToolsCapability

Inputs: tool name + args; optional workspace_root; env AAIS_JARVIS_TOOLS_MCP
Outputs: invoke dict with transport local_adapter | mcp_stdio (+ optional mcp_fallback)
Constraints: fail-open to in-process adapter when stdio spawn/protocol fails
Failure modes: missing service package → ImportError; MCP errors → adapter fallback when enabled
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

_SERVICE_ROOT = Path(__file__).resolve().parents[1] / "services" / "aais-tools-mcp"
if _SERVICE_ROOT.is_dir() and str(_SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(_SERVICE_ROOT))

from aais_tools_mcp.capability_adapter import AaisOperatorToolsCapability  # noqa: E402

from src.aais_tools_mcp_client import (  # noqa: E402
    AaisToolsMcpClientError,
    invoke_aais_operator_tool_stdio,
    jarvis_tools_mcp_enabled,
)

AAIS_OPERATOR_TOOL_NAMES = frozenset(
    {
        "read_file",
        "write_file",
        "apply_patch",
        "list_dir",
        "search_code",
        "run_tests",
        "git_status",
        "git_diff",
    }
)

__all__ = [
    "AAIS_OPERATOR_TOOL_NAMES",
    "AaisOperatorToolsCapability",
    "get_aais_operator_tools",
    "invoke_aais_operator_tool",
    "jarvis_tools_mcp_enabled",
]


def get_aais_operator_tools(workspace_root: str | Path | None = None) -> AaisOperatorToolsCapability:
    return AaisOperatorToolsCapability(workspace_root=workspace_root)


def _invoke_local(
    tool_name: str,
    args: dict[str, Any] | None = None,
    *,
    workspace_root: str | Path | None = None,
) -> dict[str, Any]:
    return get_aais_operator_tools(workspace_root).invoke(tool_name, args)


def invoke_aais_operator_tool(
    tool_name: str,
    args: dict[str, Any] | None = None,
    *,
    workspace_root: str | Path | None = None,
    prefer_mcp: bool | None = None,
) -> dict[str, Any]:
    """Invoke one AAIS operator tool via MCP stdio (when enabled) or local adapter.

    When ``AAIS_JARVIS_TOOLS_MCP=1`` (or ``prefer_mcp=True``), try stdio first.
    Spawn/protocol failures fail-open to the in-process adapter so chat never dies.
    """
    use_mcp = jarvis_tools_mcp_enabled() if prefer_mcp is None else bool(prefer_mcp)
    if use_mcp:
        try:
            return invoke_aais_operator_tool_stdio(
                tool_name,
                args,
                workspace_root=workspace_root,
            )
        except AaisToolsMcpClientError as exc:
            fallback = _invoke_local(tool_name, args, workspace_root=workspace_root)
            fallback = dict(fallback)
            fallback["transport"] = "local_adapter"
            fallback["mcp_fallback"] = True
            fallback["mcp_error"] = str(exc)
            fallback["mcp_reason_code"] = exc.reason_code
            return fallback
        except Exception as exc:  # noqa: BLE001 — fail-open like /proc walk guards
            fallback = _invoke_local(tool_name, args, workspace_root=workspace_root)
            fallback = dict(fallback)
            fallback["transport"] = "local_adapter"
            fallback["mcp_fallback"] = True
            fallback["mcp_error"] = str(exc)
            fallback["mcp_reason_code"] = "MCP_UNEXPECTED_ERROR"
            return fallback
    return _invoke_local(tool_name, args, workspace_root=workspace_root)
