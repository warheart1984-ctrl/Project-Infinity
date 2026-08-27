"""JSON-RPC stdio MCP server over the Continuity Ledger REST API.

The server deliberately exposes provenance-preserving operations only.  It
never silently resolves conflicts or offers destructive ledger deletion.
"""

from __future__ import annotations

import json
import os
import sys
from typing import Any
from urllib import error, parse, request


DEFAULT_BASE_URL = "http://127.0.0.1:8001"
SERVER_INFO = {"name": "jarvis-continuity-ledger", "version": "0.1.0"}


TOOLS = [
    {
        "name": "ledger_health",
        "description": "Read Continuity Ledger health and its evidence-bound maturity status.",
        "inputSchema": {"type": "object", "properties": {}},
    },
    {
        "name": "ledger_retrieve",
        "description": "Retrieve governed memories with selection provenance and surfaced conflicts; it never picks a silent truth.",
        "inputSchema": {"type": "object", "properties": {
            "query": {"type": "string"}, "subject": {"type": "string"},
            "session_id": {"type": "string"}, "truth_scope": {"type": "string", "enum": ["live", "all"]},
            "limit": {"type": "integer", "minimum": 1, "maximum": 200},
        }},
    },
    {
        "name": "ledger_record",
        "description": "Append a provenance-bearing Continuity Ledger record. Use for decisions, facts, tasks, preferences, architecture, or research—not raw chat transcripts.",
        "inputSchema": {"type": "object", "required": ["content", "source_agent", "session_id", "type"], "properties": {
            "content": {"type": "string"}, "source_agent": {"type": "string"}, "session_id": {"type": "string"},
            "type": {"type": "string", "enum": ["decision", "fact", "task", "preference", "architecture", "research"]},
            "confidence": {"type": "number", "minimum": 0, "maximum": 1}, "status": {"type": "string", "enum": ["draft", "verified", "archived"]},
            "subject": {"type": "string"}, "supersedes": {"type": "string"}, "tags": {"type": "array", "items": {"type": "string"}},
            "evidence": {"type": "array", "items": {"type": "object"}},
        }},
    },
    {
        "name": "ledger_conflicts",
        "description": "List unresolved or historical conflict sets for a subject without merging or adjudicating them.",
        "inputSchema": {"type": "object", "properties": {"subject": {"type": "string"}}},
    },
    {
        "name": "emr_activate",
        "description": "Build a budgeted, provenance-linked active STM view from ledger memories. EMR adjusts retrievability, not truth.",
        "inputSchema": {"type": "object", "required": ["query"], "properties": {
            "query": {"type": "string"}, "session_key": {"type": "string"}, "token_budget": {"type": "integer", "minimum": 32, "maximum": 8000},
            "truth_scope": {"type": "string", "enum": ["live", "all"]}, "candidate_limit": {"type": "integer", "minimum": 1, "maximum": 2000},
        }},
    },
    {
        "name": "amul_verify",
        "description": "Verify AMUL artifact integrity and report ledger drift; does not alter ledger truth.",
        "inputSchema": {"type": "object", "properties": {}},
    },
]


def _base_url() -> str:
    return os.getenv("JARVIS_MEMORYBOARD_URL", DEFAULT_BASE_URL).rstrip("/")


def _http(method: str, path: str, *, params: dict[str, Any] | None = None, body: dict[str, Any] | None = None) -> Any:
    query = {key: value for key, value in (params or {}).items() if value is not None}
    url = f"{_base_url()}{path}"
    if query:
        url += "?" + parse.urlencode(query, doseq=True)
    payload = json.dumps(body).encode("utf-8") if body is not None else None
    req = request.Request(url, data=payload, method=method, headers={"Accept": "application/json", **({"Content-Type": "application/json"} if payload else {})})
    try:
        with request.urlopen(req, timeout=20) as response:
            return json.loads(response.read().decode("utf-8"))
    except error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Ledger API {exc.code}: {detail}") from exc
    except error.URLError as exc:
        raise RuntimeError(f"Ledger API unavailable: {exc.reason}") from exc


def call_tool(name: str, arguments: dict[str, Any] | None = None) -> Any:
    args = dict(arguments or {})
    if name == "ledger_health":
        return _http("GET", "/health")
    if name == "ledger_retrieve":
        return _http("GET", "/api/jarvis/memory/retrieve", params=args)
    if name == "ledger_record":
        return _http("POST", "/api/jarvis/memory", body=args)
    if name == "ledger_conflicts":
        return _http("GET", "/api/jarvis/memory/conflicts", params=args)
    if name == "emr_activate":
        return _http("GET", "/api/jarvis/memory/active", params=args)
    if name == "amul_verify":
        return _http("POST", "/api/jarvis/memory/amul/field/verify", body={})
    raise ValueError(f"Unknown tool: {name}")


def handle_request(message: dict[str, Any]) -> dict[str, Any] | None:
    method = message.get("method")
    request_id = message.get("id")
    if method == "notifications/initialized":
        return None
    if method == "initialize":
        result = {"protocolVersion": "2024-11-05", "capabilities": {"tools": {}}, "serverInfo": SERVER_INFO}
    elif method == "tools/list":
        result = {"tools": TOOLS}
    elif method == "tools/call":
        params = message.get("params") or {}
        try:
            result = {"content": [{"type": "text", "text": json.dumps(call_tool(params.get("name", ""), params.get("arguments")), indent=2, sort_keys=True)}]}
        except (ValueError, RuntimeError) as exc:
            result = {"content": [{"type": "text", "text": str(exc)}], "isError": True}
    else:
        return {"jsonrpc": "2.0", "id": request_id, "error": {"code": -32601, "message": f"Method not found: {method}"}}
    return {"jsonrpc": "2.0", "id": request_id, "result": result}


def main() -> None:
    for line in sys.stdin:
        try:
            response = handle_request(json.loads(line))
            if response is not None:
                print(json.dumps(response), flush=True)
        except json.JSONDecodeError:
            print(json.dumps({"jsonrpc": "2.0", "id": None, "error": {"code": -32700, "message": "Parse error"}}), flush=True)


if __name__ == "__main__":
    main()
