"""Sandbox and tool happy-path / deny tests for AAIS Tools MCP."""

from __future__ import annotations

import json
import os
from pathlib import Path

import pytest

from aais_tools_mcp.capability_adapter import AaisOperatorToolsCapability
from aais_tools_mcp.sandbox import WorkspacePathSandbox, WorkspaceSandboxError
from aais_tools_mcp.server import TOOLS, handle_request
from aais_tools_mcp.tools import AaisOperatorToolCatalog


@pytest.fixture()
def workspace(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    root = tmp_path / "ws"
    root.mkdir()
    (root / "src").mkdir()
    (root / "src" / "hello.py").write_text("print('hi')\n", encoding="utf-8")
    (root / ".env").write_text("SECRET=1\n", encoding="utf-8")
    (root / "secrets").mkdir()
    (root / "secrets" / "token.txt").write_text("nope\n", encoding="utf-8")
    monkeypatch.setenv("AAIS_WORKSPACE_ROOT", str(root))
    monkeypatch.delenv("AAIS_TOOLS_MCP_ALLOW_WRITES", raising=False)
    return root


def test_sandbox_denies_traversal(workspace: Path) -> None:
    sandbox = WorkspacePathSandbox(workspace)
    with pytest.raises(WorkspaceSandboxError) as exc:
        sandbox.resolve_path("../outside")
    assert exc.value.reason_code == "PATH_TRAVERSAL_DENIED"


def test_sandbox_denies_absolute(workspace: Path) -> None:
    sandbox = WorkspacePathSandbox(workspace)
    with pytest.raises(WorkspaceSandboxError) as exc:
        sandbox.resolve_path("/etc/passwd")
    assert exc.value.reason_code == "PATH_ABSOLUTE_DENIED"


def test_sandbox_denies_env_and_secrets(workspace: Path) -> None:
    sandbox = WorkspacePathSandbox(workspace)
    with pytest.raises(WorkspaceSandboxError) as exc_env:
        sandbox.resolve_path(".env")
    assert exc_env.value.reason_code == "PATH_SECRET_DENIED"
    with pytest.raises(WorkspaceSandboxError) as exc_secret:
        sandbox.resolve_path("secrets/token.txt")
    assert exc_secret.value.reason_code == "PATH_SECRET_DENIED"


def test_read_file_happy_path(workspace: Path) -> None:
    catalog = AaisOperatorToolCatalog(workspace)
    result = catalog.call("read_file", {"path": "src/hello.py"})
    assert result["ok"] is True
    assert "print('hi')" in result["content"]


def test_write_denied_without_policy(workspace: Path) -> None:
    catalog = AaisOperatorToolCatalog(workspace)
    result = catalog.call(
        "write_file",
        {"path": "src/new.py", "content": "x = 1\n", "allow_write": True},
    )
    assert result["ok"] is False
    assert result["reason_code"] == "WRITE_POLICY_DENIED"


def test_write_happy_path_with_evidence(
    workspace: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("AAIS_TOOLS_MCP_ALLOW_WRITES", "1")
    catalog = AaisOperatorToolCatalog(workspace)
    result = catalog.call(
        "write_file",
        {"path": "src/written.py", "content": "ok = True\n", "allow_write": True},
    )
    assert result["ok"] is True
    assert (workspace / "src" / "written.py").read_text(encoding="utf-8") == "ok = True\n"
    evidence = workspace / ".runtime" / "aais-tools-mcp" / "mutations.jsonl"
    assert evidence.is_file()
    line = evidence.read_text(encoding="utf-8").strip().splitlines()[-1]
    event = json.loads(line)
    assert event["tool"] == "write_file"
    assert event["path"] == "src/written.py"


def test_apply_patch_substring(workspace: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AAIS_TOOLS_MCP_ALLOW_WRITES", "1")
    catalog = AaisOperatorToolCatalog(workspace)
    result = catalog.call(
        "apply_patch",
        {
            "path": "src/hello.py",
            "old_string": "print('hi')",
            "new_string": "print('hello')",
            "allow_write": True,
        },
    )
    assert result["ok"] is True
    assert "hello" in (workspace / "src" / "hello.py").read_text(encoding="utf-8")


def test_list_and_search(workspace: Path) -> None:
    catalog = AaisOperatorToolCatalog(workspace)
    listed = catalog.call("list_dir", {"path": "src"})
    assert listed["ok"] is True
    assert any(e["name"] == "hello.py" for e in listed["entries"])
    found = catalog.call("search_code", {"pattern": "print\\(", "path": "src"})
    assert found["ok"] is True
    assert found["matches"]


def test_run_tests_rejects_arbitrary_shell(workspace: Path) -> None:
    catalog = AaisOperatorToolCatalog(workspace)
    result = catalog.call("run_tests", {"command": "bash"})
    assert result["ok"] is False
    assert result["reason_code"] == "COMMAND_NOT_ALLOWLISTED"


def test_mcp_initialize_and_tools_list() -> None:
    initialized = handle_request({"jsonrpc": "2.0", "id": 1, "method": "initialize"})
    listed = handle_request({"jsonrpc": "2.0", "id": 2, "method": "tools/list"})
    assert initialized["result"]["serverInfo"]["name"] == "aais-tools-mcp"
    names = {tool["name"] for tool in listed["result"]["tools"]}
    assert {
        "read_file",
        "write_file",
        "apply_patch",
        "list_dir",
        "search_code",
        "run_tests",
        "git_status",
        "git_diff",
    } <= names
    assert listed["result"]["tools"] == TOOLS


def test_capability_adapter_local_invoke(workspace: Path) -> None:
    cap = AaisOperatorToolsCapability(workspace)
    snap = cap.snapshot()
    assert snap["capability_id"] == "aais_operator_tools"
    invoked = cap.invoke("read_file", {"path": "src/hello.py"})
    assert invoked["transport"] == "local_adapter"
    assert invoked["result"]["ok"] is True
