"""JSON-RPC stdio MCP server for AAIS / Jarvis workspace tools.

Mythic: Operator Workshop MCP Gate
Engineering: AaisOperatorToolServer

Inputs: MCP initialize / tools/list / tools/call over stdin (JSON-RPC lines)
Outputs: JSON-RPC responses on stdout
Constraints: sandbox + write policy; no arbitrary shell
Failure modes: unknown method/tool → JSON-RPC or tool-level error
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

# Allow `python -m aais_tools_mcp.server` from the service directory or repo root.
_SERVICE_ROOT = Path(__file__).resolve().parents[1]
_REPO_ROOT = Path(__file__).resolve().parents[3]
for candidate in (_SERVICE_ROOT, _REPO_ROOT):
    text = str(candidate)
    if text not in sys.path:
        sys.path.insert(0, text)

from aais_tools_mcp.tools import AaisOperatorToolCatalog  # noqa: E402

SERVER_INFO = {"name": "aais-tools-mcp", "version": "0.1.0"}

TOOLS: list[dict[str, Any]] = [
    {
        "name": "read_file",
        "description": "Read a text file inside the AAIS workspace sandbox.",
        "inputSchema": {
            "type": "object",
            "required": ["path"],
            "properties": {
                "path": {"type": "string", "description": "Path relative to workspace root"},
                "max_chars": {"type": "integer", "minimum": 1, "maximum": 200000},
            },
        },
    },
    {
        "name": "write_file",
        "description": (
            "Write a text file inside the sandbox. Requires AAIS_TOOLS_MCP_ALLOW_WRITES=1 "
            "and allow_write=true. Mutations are audited under .runtime/aais-tools-mcp/."
        ),
        "inputSchema": {
            "type": "object",
            "required": ["path", "content", "allow_write"],
            "properties": {
                "path": {"type": "string"},
                "content": {"type": "string"},
                "allow_write": {"type": "boolean"},
                "create_parents": {"type": "boolean", "default": True},
            },
        },
    },
    {
        "name": "apply_patch",
        "description": (
            "Patch one sandboxed file via full content replace or unique old_string/new_string. "
            "Requires write policy + allow_write=true; audited."
        ),
        "inputSchema": {
            "type": "object",
            "required": ["path", "allow_write"],
            "properties": {
                "path": {"type": "string"},
                "content": {"type": "string"},
                "old_string": {"type": "string"},
                "new_string": {"type": "string"},
                "allow_write": {"type": "boolean"},
            },
        },
    },
    {
        "name": "list_dir",
        "description": "List entries in a sandboxed directory.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "default": "."},
                "include_hidden": {"type": "boolean", "default": False},
            },
        },
    },
    {
        "name": "search_code",
        "description": "Regex search across sandboxed text sources (bounded).",
        "inputSchema": {
            "type": "object",
            "required": ["pattern"],
            "properties": {
                "pattern": {"type": "string"},
                "path": {"type": "string", "default": "."},
                "max_matches": {"type": "integer", "minimum": 1, "maximum": 50},
                "case_insensitive": {"type": "boolean", "default": False},
            },
        },
    },
    {
        "name": "run_tests",
        "description": (
            "Run an allowlisted test command only (pytest or npm_test). "
            "Not an arbitrary shell."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "command": {
                    "type": "string",
                    "enum": ["pytest", "npm_test"],
                    "default": "pytest",
                },
                "extra_args": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Safe path/flag selectors only",
                },
            },
        },
    },
    {
        "name": "git_status",
        "description": "Read-only git status --short --branch for the workspace.",
        "inputSchema": {"type": "object", "properties": {}},
    },
    {
        "name": "git_diff",
        "description": "Read-only git diff (optionally staged / path-scoped).",
        "inputSchema": {
            "type": "object",
            "properties": {
                "path": {"type": "string"},
                "staged": {"type": "boolean", "default": False},
            },
        },
    },
]


class AaisOperatorToolServer:
    """MCP JSON-RPC request handler backed by AaisOperatorToolCatalog."""

    def __init__(self, catalog: AaisOperatorToolCatalog | None = None) -> None:
        self.catalog = catalog or AaisOperatorToolCatalog()

    def handle_request(self, message: dict[str, Any]) -> dict[str, Any] | None:
        method = message.get("method")
        request_id = message.get("id")
        if method == "notifications/initialized":
            return None
        if method == "initialize":
            result: dict[str, Any] = {
                "protocolVersion": "2024-11-05",
                "capabilities": {"tools": {}},
                "serverInfo": SERVER_INFO,
            }
        elif method == "tools/list":
            result = {"tools": TOOLS}
        elif method == "tools/call":
            params = message.get("params") or {}
            name = str(params.get("name") or "")
            arguments = params.get("arguments") or {}
            try:
                payload = self.catalog.call(name, arguments if isinstance(arguments, dict) else {})
                result = {
                    "content": [
                        {
                            "type": "text",
                            "text": json.dumps(payload, indent=2, sort_keys=True),
                        }
                    ],
                    "isError": not bool(payload.get("ok", True)),
                }
            except Exception as exc:  # noqa: BLE001 — surface as MCP tool error
                result = {
                    "content": [{"type": "text", "text": str(exc)}],
                    "isError": True,
                }
        else:
            return {
                "jsonrpc": "2.0",
                "id": request_id,
                "error": {"code": -32601, "message": f"Method not found: {method}"},
            }
        return {"jsonrpc": "2.0", "id": request_id, "result": result}


def handle_request(message: dict[str, Any], server: AaisOperatorToolServer | None = None) -> dict[str, Any] | None:
    """Module-level entry used by tests (matches memoryboard MCP shape)."""
    return (server or AaisOperatorToolServer()).handle_request(message)


def call_tool(name: str, arguments: dict[str, Any] | None = None, catalog: AaisOperatorToolCatalog | None = None) -> Any:
    return (catalog or AaisOperatorToolCatalog()).call(name, arguments)


def main() -> None:
    server = AaisOperatorToolServer()
    for line in sys.stdin:
        try:
            response = server.handle_request(json.loads(line))
            if response is not None:
                print(json.dumps(response), flush=True)
        except json.JSONDecodeError:
            print(
                json.dumps(
                    {
                        "jsonrpc": "2.0",
                        "id": None,
                        "error": {"code": -32700, "message": "Parse error"},
                    }
                ),
                flush=True,
            )


if __name__ == "__main__":
    main()
