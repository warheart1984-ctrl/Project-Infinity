"""Tests for AAIS Tools MCP stdio client and Jarvis transport selection."""

from __future__ import annotations

import io
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

from src.aais_tools_mcp_client import (
    AaisOperatorToolsStdioClient,
    AaisToolsMcpClientError,
    jarvis_tools_mcp_enabled,
    resolve_mcp_command,
)


def _rpc_result(request_id: int, result: dict) -> str:
    return json.dumps({"jsonrpc": "2.0", "id": request_id, "result": result}) + "\n"


class _CapturingStdin(io.StringIO):
    def __init__(self) -> None:
        super().__init__()
        self.captured = ""

    def write(self, data: str) -> int:
        self.captured += data
        return super().write(data)

    def close(self) -> None:
        # Keep captured text readable after client.close() closes stdin.
        if not self.closed:
            super().close()


class FakeProc:
    def __init__(self, lines: list[str]) -> None:
        self.stdin = _CapturingStdin()
        self._lines = list(lines)
        self.stdout = self
        self.stderr = io.StringIO("")
        self.returncode = None

    def readline(self) -> str:
        if not self._lines:
            return ""
        return self._lines.pop(0)

    def poll(self):
        return self.returncode

    def terminate(self) -> None:
        self.returncode = 0

    def wait(self, timeout: float | None = None) -> int:
        return 0

    def kill(self) -> None:
        self.returncode = -9

    def __iter__(self):
        return iter(())


class JarvisToolsMcpFlagTests(unittest.TestCase):
    def test_flag_off_by_default(self) -> None:
        self.assertFalse(jarvis_tools_mcp_enabled({}))

    def test_flag_on_values(self) -> None:
        for value in ("1", "true", "YES", "on"):
            self.assertTrue(jarvis_tools_mcp_enabled({"AAIS_JARVIS_TOOLS_MCP": value}))

    def test_resolve_mcp_command_override(self) -> None:
        self.assertEqual(
            resolve_mcp_command({"AAIS_TOOLS_MCP_CMD": "python -m aais_tools_mcp"}),
            ["python", "-m", "aais_tools_mcp"],
        )


class AaisToolsMcpClientProtocolTests(unittest.TestCase):
    def test_handshake_and_call_tool(self) -> None:
        lines = [
            _rpc_result(
                1,
                {
                    "protocolVersion": "2024-11-05",
                    "capabilities": {"tools": {}},
                    "serverInfo": {"name": "aais-tools-mcp", "version": "0.1.0"},
                },
            ),
            _rpc_result(
                2,
                {
                    "content": [
                        {
                            "type": "text",
                            "text": json.dumps({"ok": True, "content": "hello-from-mcp"}),
                        }
                    ],
                    "isError": False,
                },
            ),
        ]
        fake = FakeProc(lines)

        with patch("src.aais_tools_mcp_client.subprocess.Popen", return_value=fake) as popen:
            with tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                (root / "note.txt").write_text("x", encoding="utf-8")
                client = AaisOperatorToolsStdioClient(
                    workspace_root=root,
                    command=["python", "-m", "aais_tools_mcp"],
                    cwd=root,
                    timeout_sec=2,
                )
                result = client.call_tool("read_file", {"path": "note.txt"})
                client.close()

        self.assertEqual(result["transport"], "mcp_stdio")
        self.assertTrue(result["result"]["ok"])
        self.assertIn("hello-from-mcp", result["result"]["content"])
        popen.assert_called_once()
        env = popen.call_args.kwargs["env"]
        self.assertEqual(env["AAIS_WORKSPACE_ROOT"], str(root.resolve()))
        written = fake.stdin.captured
        self.assertIn('"method": "initialize"', written)
        self.assertIn('"method": "notifications/initialized"', written)
        self.assertIn('"method": "tools/call"', written)

    def test_spawn_failure_raises(self) -> None:
        with patch(
            "src.aais_tools_mcp_client.subprocess.Popen",
            side_effect=OSError("boom"),
        ):
            client = AaisOperatorToolsStdioClient(
                workspace_root=Path("."),
                command=["python", "-m", "aais_tools_mcp"],
                timeout_sec=1,
            )
            with self.assertRaises(AaisToolsMcpClientError) as ctx:
                client.start()
        self.assertEqual(ctx.exception.reason_code, "MCP_SPAWN_FAILED")


class AaisToolsMcpAdapterTransportTests(unittest.TestCase):
    def test_flag_off_uses_local_adapter(self) -> None:
        from src.aais_tools_mcp_adapter import invoke_aais_operator_tool

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "note.txt").write_text("adapter-path\n", encoding="utf-8")
            with patch.dict(os.environ, {"AAIS_JARVIS_TOOLS_MCP": "0"}, clear=False):
                with patch(
                    "src.aais_tools_mcp_adapter.invoke_aais_operator_tool_stdio"
                ) as stdio:
                    result = invoke_aais_operator_tool(
                        "read_file",
                        {"path": "note.txt"},
                        workspace_root=root,
                    )
        stdio.assert_not_called()
        self.assertEqual(result["transport"], "local_adapter")
        self.assertTrue(result["result"]["ok"])
        self.assertIn("adapter-path", result["result"]["content"])

    def test_flag_on_invokes_stdio_client(self) -> None:
        from src.aais_tools_mcp_adapter import invoke_aais_operator_tool

        fake = {
            "capability_id": "aais_operator_tools",
            "tool": "list_dir",
            "result": {"ok": True, "entries": []},
            "transport": "mcp_stdio",
        }
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            with patch.dict(os.environ, {"AAIS_JARVIS_TOOLS_MCP": "1"}, clear=False):
                with patch(
                    "src.aais_tools_mcp_adapter.invoke_aais_operator_tool_stdio",
                    return_value=fake,
                ) as stdio:
                    result = invoke_aais_operator_tool(
                        "list_dir",
                        {"path": "."},
                        workspace_root=root,
                    )
        stdio.assert_called_once()
        self.assertEqual(result["transport"], "mcp_stdio")

    def test_flag_on_fail_open_to_adapter(self) -> None:
        from src.aais_tools_mcp_adapter import invoke_aais_operator_tool
        from src.aais_tools_mcp_client import AaisToolsMcpClientError

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "note.txt").write_text("fallback-ok\n", encoding="utf-8")
            with patch.dict(os.environ, {"AAIS_JARVIS_TOOLS_MCP": "1"}, clear=False):
                with patch(
                    "src.aais_tools_mcp_adapter.invoke_aais_operator_tool_stdio",
                    side_effect=AaisToolsMcpClientError("spawn failed", reason_code="MCP_SPAWN_FAILED"),
                ):
                    result = invoke_aais_operator_tool(
                        "read_file",
                        {"path": "note.txt"},
                        workspace_root=root,
                    )
        self.assertEqual(result["transport"], "local_adapter")
        self.assertTrue(result["mcp_fallback"])
        self.assertEqual(result["mcp_reason_code"], "MCP_SPAWN_FAILED")
        self.assertTrue(result["result"]["ok"])
        self.assertIn("fallback-ok", result["result"]["content"])


class JarvisOperatorToolRoutingTests(unittest.TestCase):
    def test_handle_tool_request_routes_operator_tools(self) -> None:
        from src.jarvis_operator import JarvisOperator

        operator = JarvisOperator.__new__(JarvisOperator)
        operator.workspace_tools = MagicMock()
        operator.workspace_tools._resolve_workspace_root.return_value = Path(".")
        operator.capability_bridge = MagicMock()

        fake = {
            "capability_id": "aais_operator_tools",
            "tool": "git_status",
            "result": {"ok": True, "output": "## main"},
            "transport": "local_adapter",
        }
        with patch.object(operator, "invoke_operator_tool", return_value=fake) as invoke:
            out = operator.handle_tool_request("git_status", {})

        invoke.assert_called_once_with("git_status", {})
        operator.capability_bridge.handle_tool_request.assert_not_called()
        self.assertEqual(out["tool_result"]["type"], "aais_operator_tool")
        self.assertEqual(out["tool_result"]["status"], "ok")


if __name__ == "__main__":
    unittest.main()
