"""Repo-level smoke for the Jarvis AAIS tools MCP adapter shim."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path


class AaisToolsMcpAdapterTests(unittest.TestCase):
    def test_invoke_read_via_src_shim(self) -> None:
        import os
        from unittest.mock import patch

        from src.aais_tools_mcp_adapter import get_aais_operator_tools, invoke_aais_operator_tool

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            sample = root / "note.txt"
            sample.write_text("adapter-ok\n", encoding="utf-8")
            cap = get_aais_operator_tools(root)
            self.assertIn("read_file", cap.list_tools())
            with patch.dict(os.environ, {"AAIS_JARVIS_TOOLS_MCP": "0"}, clear=False):
                result = invoke_aais_operator_tool(
                    "read_file", {"path": "note.txt"}, workspace_root=root
                )
            self.assertEqual(result["transport"], "local_adapter")
            self.assertTrue(result["result"]["ok"])
            self.assertIn("adapter-ok", result["result"]["content"])


if __name__ == "__main__":
    unittest.main()
