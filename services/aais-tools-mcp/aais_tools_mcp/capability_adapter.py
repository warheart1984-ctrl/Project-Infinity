"""Local capability adapter — same tools without an MCP client.

Mythic: Workshop Direct Plug
Engineering: AaisOperatorToolsCapability

Inputs: tool name + args (same as MCP tools/call)
Outputs: structured result dict
Constraints: identical sandbox/write policy as the MCP server
Failure modes: unknown tool / sandbox deny → ok=False with reason_code
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from aais_tools_mcp.tools import AaisOperatorToolCatalog


class AaisOperatorToolsCapability:
    """Thin local adapter so Jarvis/AAIS can invoke tools without stdio MCP."""

    capability_id = "aais_operator_tools"
    display_name = "AAIS Operator Tools"

    def __init__(self, workspace_root: str | Path | None = None) -> None:
        self.catalog = AaisOperatorToolCatalog(workspace_root=workspace_root)

    def list_tools(self) -> list[str]:
        return self.catalog.list_tool_names()

    def invoke(self, tool_name: str, args: dict[str, Any] | None = None) -> dict[str, Any]:
        result = self.catalog.call(tool_name, args)
        return {
            "capability_id": self.capability_id,
            "tool": tool_name,
            "result": result,
            "transport": "local_adapter",
        }

    def snapshot(self) -> dict[str, Any]:
        return {
            "capability_id": self.capability_id,
            "display_name": self.display_name,
            "tools": self.list_tools(),
            "writes_env": "AAIS_TOOLS_MCP_ALLOW_WRITES",
            "workspace_root": str(self.catalog.sandbox.resolve_root()),
            "mcp_server": "services/aais-tools-mcp",
        }
