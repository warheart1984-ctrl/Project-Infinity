"""Regression tests for workspace root resolution and proc-map fail-open."""

from __future__ import annotations

import errno
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from src.jarvis_operator import WorkspaceTools
from src.workspace_root import default_repo_root, resolve_workspace_root


class TestWorkspaceRootResolver(unittest.TestCase):
    def test_default_repo_root_is_project_infinity_not_filesystem_parent(self):
        root = default_repo_root(module_file=Path(__file__))
        self.assertTrue((root / "pyproject.toml").is_file())
        self.assertTrue((root / "src" / "jarvis_operator.py").is_file())
        self.assertNotEqual(root, Path(root.anchor))

    def test_workspace_tools_default_root_stays_inside_repo(self):
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop("AAIS_WORKSPACE_ROOT", None)
            tools = WorkspaceTools()
            root = tools._resolve_workspace_root()
        self.assertTrue((root / "src" / "jarvis_operator.py").is_file())
        self.assertNotEqual(str(root), "/")

    def test_filesystem_root_override_falls_back_to_repo(self):
        with patch.dict(os.environ, {"AAIS_WORKSPACE_ROOT": "/"}, clear=False):
            root = resolve_workspace_root(module_file=Path(__file__))
        self.assertTrue((root / "pyproject.toml").is_file())
        self.assertNotEqual(root, Path("/"))


class TestWorkspaceWalkFailOpen(unittest.TestCase):
    def test_iter_files_skips_proc_map_files_tree(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            root = Path(tmp_dir)
            (root / "notes.md").write_text("hello jarvis", encoding="utf-8")
            map_dir = root / "proc" / "1" / "map_files"
            map_dir.mkdir(parents=True)
            (map_dir / "5f76c53f6000-5f76c53f7000").write_text("do-not-read", encoding="utf-8")

            tools = WorkspaceTools(workspace_root=root)
            found = [path.name for path in tools._iter_files()]

        self.assertIn("notes.md", found)
        self.assertNotIn("5f76c53f6000-5f76c53f7000", found)

    def test_is_text_file_fail_open_on_eperm(self):
        tools = WorkspaceTools(workspace_root=Path("/tmp"))
        blocked = Path("/proc/1/map_files/5f76c53f6000-5f76c53f7000")
        error = PermissionError(errno.EPERM, "Operation not permitted", str(blocked))
        with patch.object(Path, "is_file", side_effect=error):
            self.assertFalse(tools._is_text_file(blocked))

    def test_search_survives_eperm_during_walk(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            root = Path(tmp_dir)
            (root / "readme.md").write_text("remember project notes", encoding="utf-8")
            tools = WorkspaceTools(workspace_root=root)
            real_walk = os.walk

            def walk_with_eperm(top, *args, **kwargs):
                onerror = kwargs.get("onerror")
                if onerror is not None:
                    onerror(
                        PermissionError(
                            errno.EPERM,
                            "Operation not permitted",
                            "/proc/1/map_files/5f76c53f6000-5f76c53f7000",
                        )
                    )
                yield from real_walk(top, *args, **kwargs)

            with patch("src.jarvis_operator.os.walk", side_effect=walk_with_eperm):
                result = tools.search("remember project", limit=5)

        self.assertGreaterEqual(len(result["results"]), 1)
        self.assertIn("remember project notes", result["results"][0]["snippet"])
