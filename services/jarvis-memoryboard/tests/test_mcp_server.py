from __future__ import annotations

from unittest.mock import patch

from mcp.server import TOOLS, call_tool, handle_request


def test_tools_list_declares_governed_ledger_surface():
    names = {tool["name"] for tool in TOOLS}
    assert {"ledger_health", "ledger_retrieve", "ledger_record", "ledger_conflicts", "emr_activate", "amul_verify"} <= names
    assert "ledger_delete" not in names


def test_initialize_and_tools_list_follow_mcp_json_rpc_shape():
    initialized = handle_request({"jsonrpc": "2.0", "id": 1, "method": "initialize"})
    listed = handle_request({"jsonrpc": "2.0", "id": 2, "method": "tools/list"})
    assert initialized["result"]["serverInfo"]["name"] == "jarvis-continuity-ledger"
    assert listed["result"]["tools"] == TOOLS


@patch("mcp.server._http")
def test_record_uses_rest_api_without_silent_truth_adjudication(http):
    http.return_value = {"memory": {"id": "mem-1", "content_sha256": "abc"}}
    result = call_tool("ledger_record", {"content": "Use the ledger.", "source_agent": "test", "session_id": "s1", "type": "decision"})
    assert result["memory"]["id"] == "mem-1"
    http.assert_called_once_with("POST", "/api/jarvis/memory", body={"content": "Use the ledger.", "source_agent": "test", "session_id": "s1", "type": "decision"})
