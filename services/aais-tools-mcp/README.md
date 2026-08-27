# AAIS Tools MCP

**Engineering:** `AaisOperatorToolServer` / `AaisOperatorToolCatalog`  
**Mythic (docs only):** Operator Workshop Tools

Governed Model Context Protocol (stdio JSON-RPC) server so Cursor and Jarvis/AAIS can **read, write, search, and run allowlisted tests** inside the Project Infinity workspace — with path sandboxing, write policy gates, and mutation evidence logs.

Matches the dependency-light pattern used by `services/jarvis-memoryboard/mcp` (stdlib only; no `@modelcontextprotocol` SDK required).

## Tools

| Tool | Mode | Notes |
|------|------|--------|
| `read_file` | read | Sandboxed text read |
| `write_file` | write | Needs `AAIS_TOOLS_MCP_ALLOW_WRITES=1` **and** `allow_write=true`; audited |
| `apply_patch` | write | Full replace or unique `old_string`/`new_string`; same write policy |
| `list_dir` | read | Directory listing |
| `search_code` | read | Bounded regex search |
| `run_tests` | allowlisted | `pytest` or `npm_test` only — **not** arbitrary shell |
| `git_status` | read | `git status --short --branch` |
| `git_diff` | read | `git diff` / `--cached` |

### Hard constraints

- Paths must be **relative** to the workspace root (`AAIS_WORKSPACE_ROOT`, else repo root).
- Refuses `..`, absolute escapes, `.env*`, credentials/secrets, `.runtime/oauth`, `.ssh`, etc.
- Writes are off by default; every successful mutation appends JSONL under `.runtime/aais-tools-mcp/mutations.jsonl` (gitignored via `.runtime/`).
- No offensive/unrestricted shell.

## Cursor MCP config

Add to project `.cursor/mcp.json` or user `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "aais-tools": {
      "command": "python",
      "args": ["-m", "aais_tools_mcp"],
      "cwd": "/ABS/PATH/TO/Project-Infinity/services/aais-tools-mcp",
      "env": {
        "AAIS_WORKSPACE_ROOT": "/ABS/PATH/TO/Project-Infinity",
        "AAIS_TOOLS_MCP_ALLOW_WRITES": "0"
      }
    }
  }
}
```

Set `AAIS_TOOLS_MCP_ALLOW_WRITES` to `"1"` only when you intentionally allow agent writes. Each write/patch call must still pass `"allow_write": true`.

Restart Cursor after saving. Verify with a `list_dir` or `git_status` tool call.

## Run locally (stdio)

```bash
cd services/aais-tools-mcp
AAIS_WORKSPACE_ROOT=/ABS/PATH/TO/Project-Infinity python -m aais_tools_mcp
```

JSON-RPC line protocol (same as Continuity Ledger MCP): `initialize` → `tools/list` → `tools/call`.

## How Jarvis / AAIS uses it

### Env flags (Jarvis)

| Env | Default | Meaning |
|-----|---------|---------|
| `AAIS_JARVIS_TOOLS_MCP` | off | Set to `1` / `true` / `yes` / `on` so Jarvis prefers **stdio MCP** for operator tools |
| `AAIS_TOOLS_MCP_CMD` | `python3 -m aais_tools_mcp` | Optional spawn command override (shell-split) |
| `AAIS_TOOLS_MCP_TIMEOUT_SEC` | `30` | Stdio handshake / call timeout |
| `AAIS_WORKSPACE_ROOT` | repo root via `src/workspace_root.py` | Sandbox root passed into the MCP child (never `/`) |
| `AAIS_TOOLS_MCP_ALLOW_WRITES` | `0` | Server write gate (still requires `allow_write=true` per call) |

When `AAIS_JARVIS_TOOLS_MCP` is enabled, Jarvis calls `src/aais_tools_mcp_client.py` (`AaisOperatorToolsStdioClient`). Spawn or protocol failures **fail-open** to the in-process adapter so chat never dies (same posture as the `/proc` walk guard).

Selection lives in `src/aais_tools_mcp_adapter.py` → `invoke_aais_operator_tool(...)`. Tool turns that name `read_file`, `write_file`, `apply_patch`, `list_dir`, `search_code`, `run_tests`, `git_status`, or `git_diff` go through `JarvisOperator.handle_tool_request` → that helper (one API for both transports).

1. **Local capability adapter** (default when MCP flag is off):

```python
from src.aais_tools_mcp_adapter import invoke_aais_operator_tool

print(invoke_aais_operator_tool("read_file", {"path": "README.md"}))
```

2. **Stdio client** (when `AAIS_JARVIS_TOOLS_MCP=1`):

```python
from src.aais_tools_mcp_client import invoke_aais_operator_tool_stdio

print(invoke_aais_operator_tool_stdio("git_status", {}))
```

3. Existing Jarvis workspace browsing (`WorkspaceTools` / capability workspace lane) remains the primary **browse/search** path for natural-language chat. Structured coding/tool envelopes use the AAIS operator tool names above (MCP or adapter).

## Tests

```bash
cd services/aais-tools-mcp
python -m pytest -q
```

Coverage includes sandbox denials (traversal, `.env`, secrets) and read/write happy paths under a temp workspace.

## Related

- Continuity Ledger MCP: `services/jarvis-memoryboard/mcp`
- MCP plug bridge (observe/assist): `src/mcp_bridge.py`
- Operator Cursor MCP merge: `src/operator_plugin_bootstrap.py`
