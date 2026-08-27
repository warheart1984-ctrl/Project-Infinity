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

Jarvis does **not** yet run a full MCP client for this server. Until that lands:

1. **Local capability adapter** (same functions, no stdio):

```python
from aais_tools_mcp.capability_adapter import AaisOperatorToolsCapability

cap = AaisOperatorToolsCapability(workspace_root="/path/to/Project-Infinity")
print(cap.snapshot())
print(cap.invoke("read_file", {"path": "README.md"}))
```

2. Repo wiring stub: `src/aais_tools_mcp_adapter.py` adds the service to `sys.path` and re-exports `AaisOperatorToolsCapability` for capability-bridge / operator plugs.

3. Existing Jarvis workspace browsing (`WorkspaceTools` / capability workspace lane) remains the primary in-process path; this MCP is the **Cursor + future MCP-client** surface with shared sandbox policy intent.

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
