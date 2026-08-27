"""Governed workspace tool implementations for AAIS / Jarvis.

Mythic: Operator Workshop Toolkit
Engineering: AaisOperatorToolCatalog (+ per-tool classes)

Inputs: tool name + JSON-compatible args
Outputs: result dict with ok/error and reason_code on failure
Constraints: sandboxed paths; writes gated; commands allowlisted only
Failure modes: sandbox deny, policy deny, OS errors → structured error dict
"""

from __future__ import annotations

import os
import re
import subprocess
import sys
from pathlib import Path
from typing import Any, Callable

from aais_tools_mcp.evidence import MutationEvidenceLog, writes_allowed
from aais_tools_mcp.sandbox import WorkspacePathSandbox, WorkspaceSandboxError

MAX_READ_CHARS = 200_000
MAX_LIST_ENTRIES = 500
MAX_SEARCH_MATCHES = 50
MAX_COMMAND_OUTPUT = 40_000
MAX_DIFF_CHARS = 80_000

IGNORED_DIR_NAMES = frozenset(
    {
        ".git",
        ".hg",
        ".svn",
        ".venv",
        "venv",
        "node_modules",
        "__pycache__",
        ".pytest_cache",
        ".mypy_cache",
        ".ruff_cache",
        ".tox",
        "dist",
        "build",
        ".runtime",
        "proc",
        "sys",
        "dev",
        "map_files",
    }
)

ALLOWLISTED_COMMANDS: dict[str, list[str]] = {
    "pytest": [sys.executable, "-m", "pytest", "-q"],
    "npm_test": ["npm", "test", "--", "--watchAll=false"],
}


class WorkspaceFileReadTool:
    """Read a sandboxed workspace text file."""

    name = "read_file"

    def __init__(self, sandbox: WorkspacePathSandbox) -> None:
        self.sandbox = sandbox

    def run(self, path: str, max_chars: int = MAX_READ_CHARS) -> dict[str, Any]:
        target = self.sandbox.resolve_path(path)
        if not target.is_file():
            return {"ok": False, "reason_code": "FILE_NOT_FOUND", "error": f"Not a file: {path}"}
        limit = max(1, min(int(max_chars or MAX_READ_CHARS), MAX_READ_CHARS))
        try:
            text = target.read_text(encoding="utf-8", errors="replace")
        except OSError as exc:
            return {"ok": False, "reason_code": "READ_FAILED", "error": str(exc)}
        truncated = len(text) > limit
        root = self.sandbox.resolve_root()
        return {
            "ok": True,
            "path": str(target.relative_to(root)),
            "content": text[:limit],
            "truncated": truncated,
            "bytes": target.stat().st_size,
        }


class WorkspaceFileWriteTool:
    """Write a sandboxed workspace text file when policy allows."""

    name = "write_file"

    def __init__(self, sandbox: WorkspacePathSandbox, evidence: MutationEvidenceLog) -> None:
        self.sandbox = sandbox
        self.evidence = evidence

    def run(
        self,
        path: str,
        content: str,
        *,
        allow_write: bool = False,
        create_parents: bool = True,
    ) -> dict[str, Any]:
        if not writes_allowed(explicit_allow=bool(allow_write)):
            return {
                "ok": False,
                "reason_code": "WRITE_POLICY_DENIED",
                "error": (
                    "Writes require AAIS_TOOLS_MCP_ALLOW_WRITES=1 and allow_write=true"
                ),
            }
        target = self.sandbox.resolve_path(path, for_write=True)
        root = self.sandbox.resolve_root()
        try:
            if create_parents:
                target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(str(content), encoding="utf-8")
        except OSError as exc:
            return {"ok": False, "reason_code": "WRITE_FAILED", "error": str(exc)}
        event = self.evidence.record(
            {
                "tool": self.name,
                "path": str(target.relative_to(root)),
                "bytes_written": len(str(content).encode("utf-8")),
                "action": "write",
            }
        )
        return {
            "ok": True,
            "path": str(target.relative_to(root)),
            "bytes_written": event.get("bytes_written"),
            "evidence": event,
        }


class WorkspaceApplyPatchTool:
    """Apply a unified-diff style patch to one file (simple hunk-less replace mode).

    For MVP, accepts either:
    - ``content`` full-file replacement, or
    - ``old_string`` / ``new_string`` unique substring replace.
    """

    name = "apply_patch"

    def __init__(self, sandbox: WorkspacePathSandbox, evidence: MutationEvidenceLog) -> None:
        self.sandbox = sandbox
        self.evidence = evidence

    def run(
        self,
        path: str,
        *,
        content: str | None = None,
        old_string: str | None = None,
        new_string: str | None = None,
        allow_write: bool = False,
    ) -> dict[str, Any]:
        if not writes_allowed(explicit_allow=bool(allow_write)):
            return {
                "ok": False,
                "reason_code": "WRITE_POLICY_DENIED",
                "error": (
                    "Patches require AAIS_TOOLS_MCP_ALLOW_WRITES=1 and allow_write=true"
                ),
            }
        target = self.sandbox.resolve_path(path, for_write=True)
        root = self.sandbox.resolve_root()
        if not target.is_file():
            return {"ok": False, "reason_code": "FILE_NOT_FOUND", "error": f"Not a file: {path}"}
        try:
            original = target.read_text(encoding="utf-8", errors="replace")
            if content is not None:
                updated = str(content)
                mode = "replace_file"
            else:
                if old_string is None or new_string is None:
                    return {
                        "ok": False,
                        "reason_code": "PATCH_ARGS_REQUIRED",
                        "error": "Provide content, or both old_string and new_string",
                    }
                if old_string not in original:
                    return {
                        "ok": False,
                        "reason_code": "PATCH_OLD_NOT_FOUND",
                        "error": "old_string not found in file",
                    }
                if original.count(old_string) != 1:
                    return {
                        "ok": False,
                        "reason_code": "PATCH_OLD_NOT_UNIQUE",
                        "error": "old_string matches multiple locations; refine the patch",
                    }
                updated = original.replace(old_string, new_string, 1)
                mode = "substring_replace"
            target.write_text(updated, encoding="utf-8")
        except OSError as exc:
            return {"ok": False, "reason_code": "PATCH_FAILED", "error": str(exc)}
        event = self.evidence.record(
            {
                "tool": self.name,
                "path": str(target.relative_to(root)),
                "action": mode,
                "bytes_written": len(updated.encode("utf-8")),
            }
        )
        return {
            "ok": True,
            "path": str(target.relative_to(root)),
            "mode": mode,
            "evidence": event,
        }


class WorkspaceListDirTool:
    """List a sandboxed directory."""

    name = "list_dir"

    def __init__(self, sandbox: WorkspacePathSandbox) -> None:
        self.sandbox = sandbox

    def run(self, path: str = ".", *, include_hidden: bool = False) -> dict[str, Any]:
        target = self.sandbox.resolve_path(path or ".")
        if not target.is_dir():
            return {"ok": False, "reason_code": "DIR_NOT_FOUND", "error": f"Not a directory: {path}"}
        root = self.sandbox.resolve_root()
        entries: list[dict[str, Any]] = []
        try:
            children = sorted(target.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower()))
        except OSError as exc:
            return {"ok": False, "reason_code": "LIST_FAILED", "error": str(exc)}
        for child in children:
            if not include_hidden and child.name.startswith("."):
                continue
            if child.name in IGNORED_DIR_NAMES:
                continue
            try:
                kind = "dir" if child.is_dir() else "file"
                size = child.stat().st_size if child.is_file() else None
            except OSError:
                continue
            entries.append(
                {
                    "name": child.name,
                    "path": str(child.relative_to(root)),
                    "kind": kind,
                    "size": size,
                }
            )
            if len(entries) >= MAX_LIST_ENTRIES:
                break
        return {
            "ok": True,
            "path": str(target.relative_to(root)),
            "entries": entries,
            "truncated": len(entries) >= MAX_LIST_ENTRIES,
        }


class WorkspaceSearchCodeTool:
    """Grep-like bounded search under the workspace root."""

    name = "search_code"

    def __init__(self, sandbox: WorkspacePathSandbox) -> None:
        self.sandbox = sandbox

    def run(
        self,
        pattern: str,
        path: str = ".",
        *,
        max_matches: int = MAX_SEARCH_MATCHES,
        case_insensitive: bool = False,
    ) -> dict[str, Any]:
        cleaned = str(pattern or "").strip()
        if not cleaned:
            return {"ok": False, "reason_code": "PATTERN_REQUIRED", "error": "pattern is required"}
        flags = re.IGNORECASE if case_insensitive else 0
        try:
            regex = re.compile(cleaned, flags)
        except re.error as exc:
            return {"ok": False, "reason_code": "PATTERN_INVALID", "error": str(exc)}

        start = self.sandbox.resolve_path(path or ".")
        root = self.sandbox.resolve_root()
        if start.is_file():
            files = [start]
        elif start.is_dir():
            files = list(self._iter_text_files(start))
        else:
            return {"ok": False, "reason_code": "PATH_NOT_FOUND", "error": f"Not found: {path}"}

        matches: list[dict[str, Any]] = []
        limit = max(1, min(int(max_matches or MAX_SEARCH_MATCHES), MAX_SEARCH_MATCHES))
        for file_path in files:
            try:
                text = file_path.read_text(encoding="utf-8", errors="replace")
            except OSError:
                continue
            for line_no, line in enumerate(text.splitlines(), start=1):
                if regex.search(line):
                    matches.append(
                        {
                            "path": str(file_path.relative_to(root)),
                            "line": line_no,
                            "text": line[:240],
                        }
                    )
                    if len(matches) >= limit:
                        return {
                            "ok": True,
                            "pattern": cleaned,
                            "matches": matches,
                            "truncated": True,
                        }
        return {"ok": True, "pattern": cleaned, "matches": matches, "truncated": False}

    def _iter_text_files(self, start: Path):
        def _onerror(_exc: OSError) -> None:
            return None

        for current, dirs, files in os.walk(start, onerror=_onerror):
            dirs[:] = [
                d
                for d in dirs
                if d not in IGNORED_DIR_NAMES and not d.startswith(".")
            ]
            for name in files:
                path = Path(current) / name
                if path.suffix.lower() in {
                    ".py",
                    ".ts",
                    ".tsx",
                    ".js",
                    ".jsx",
                    ".json",
                    ".md",
                    ".toml",
                    ".yml",
                    ".yaml",
                    ".txt",
                    ".css",
                    ".html",
                    ".sh",
                    ".rs",
                    ".go",
                } or name.lower().startswith("readme"):
                    try:
                        if path.is_file() and path.stat().st_size <= 1_000_000:
                            yield path
                    except OSError:
                        continue


class WorkspaceRunTestsTool:
    """Run allowlisted test commands only (no arbitrary shell)."""

    name = "run_tests"

    def __init__(self, sandbox: WorkspacePathSandbox, evidence: MutationEvidenceLog) -> None:
        self.sandbox = sandbox
        self.evidence = evidence

    def run(self, command: str = "pytest", *, extra_args: list[str] | None = None) -> dict[str, Any]:
        key = str(command or "pytest").strip().lower().replace("-", "_")
        if key not in ALLOWLISTED_COMMANDS:
            return {
                "ok": False,
                "reason_code": "COMMAND_NOT_ALLOWLISTED",
                "error": f"Command '{command}' is not allowlisted. Allowed: {sorted(ALLOWLISTED_COMMANDS)}",
            }
        argv = list(ALLOWLISTED_COMMANDS[key])
        safe_flags = {"-q", "-v", "-x", "--tb=short", "--maxfail=1"}
        for arg in list(extra_args or []):
            text = str(arg)
            if text.startswith("-"):
                if text not in safe_flags:
                    return {
                        "ok": False,
                        "reason_code": "COMMAND_ARG_DENIED",
                        "error": f"Unsafe extra arg refused: {text}",
                    }
            elif not re.fullmatch(r"[A-Za-z0-9_./\\-]+", text):
                return {
                    "ok": False,
                    "reason_code": "COMMAND_ARG_DENIED",
                    "error": f"Unsafe extra arg refused: {text}",
                }
            argv.append(text)

        root = self.sandbox.resolve_root()
        try:
            completed = subprocess.run(
                argv,
                cwd=str(root),
                capture_output=True,
                text=True,
                timeout=300,
                check=False,
            )
        except (OSError, subprocess.TimeoutExpired) as exc:
            return {"ok": False, "reason_code": "COMMAND_FAILED", "error": str(exc)}

        stdout = (completed.stdout or "")[:MAX_COMMAND_OUTPUT]
        stderr = (completed.stderr or "")[:MAX_COMMAND_OUTPUT]
        event = self.evidence.record(
            {
                "tool": self.name,
                "action": "run_tests",
                "command": key,
                "argv": argv,
                "exit_code": completed.returncode,
            }
        )
        return {
            "ok": completed.returncode == 0,
            "reason_code": "OK" if completed.returncode == 0 else "TESTS_FAILED",
            "command": key,
            "argv": argv,
            "exit_code": completed.returncode,
            "stdout": stdout,
            "stderr": stderr,
            "evidence": event,
        }


class WorkspaceGitStatusTool:
    """Read-only git status."""

    name = "git_status"

    def __init__(self, sandbox: WorkspacePathSandbox) -> None:
        self.sandbox = sandbox

    def run(self) -> dict[str, Any]:
        root = self.sandbox.resolve_root()
        try:
            completed = subprocess.run(
                ["git", "status", "--short", "--branch"],
                cwd=str(root),
                capture_output=True,
                text=True,
                timeout=30,
                check=False,
            )
        except (OSError, subprocess.TimeoutExpired) as exc:
            return {"ok": False, "reason_code": "GIT_FAILED", "error": str(exc)}
        return {
            "ok": completed.returncode == 0,
            "exit_code": completed.returncode,
            "output": (completed.stdout or "")[:MAX_COMMAND_OUTPUT],
            "stderr": (completed.stderr or "")[:MAX_COMMAND_OUTPUT],
        }


class WorkspaceGitDiffTool:
    """Read-only git diff (no apply)."""

    name = "git_diff"

    def __init__(self, sandbox: WorkspacePathSandbox) -> None:
        self.sandbox = sandbox

    def run(self, path: str | None = None, *, staged: bool = False) -> dict[str, Any]:
        root = self.sandbox.resolve_root()
        argv = ["git", "diff"]
        if staged:
            argv.append("--cached")
        if path:
            resolved = self.sandbox.resolve_path(path)
            argv.extend(["--", str(resolved.relative_to(root))])
        try:
            completed = subprocess.run(
                argv,
                cwd=str(root),
                capture_output=True,
                text=True,
                timeout=60,
                check=False,
            )
        except (OSError, subprocess.TimeoutExpired) as exc:
            return {"ok": False, "reason_code": "GIT_FAILED", "error": str(exc)}
        output = (completed.stdout or "")[:MAX_DIFF_CHARS]
        return {
            "ok": completed.returncode == 0,
            "exit_code": completed.returncode,
            "staged": bool(staged),
            "path": path,
            "output": output,
            "truncated": len(completed.stdout or "") > MAX_DIFF_CHARS,
            "stderr": (completed.stderr or "")[:MAX_COMMAND_OUTPUT],
        }


class AaisOperatorToolCatalog:
    """Facade that dispatches named tools with shared sandbox + evidence."""

    def __init__(self, workspace_root: str | Path | None = None) -> None:
        self.sandbox = WorkspacePathSandbox(workspace_root)
        root = self.sandbox.resolve_root()
        self.evidence = MutationEvidenceLog(root)
        self.read_file = WorkspaceFileReadTool(self.sandbox)
        self.write_file = WorkspaceFileWriteTool(self.sandbox, self.evidence)
        self.apply_patch = WorkspaceApplyPatchTool(self.sandbox, self.evidence)
        self.list_dir = WorkspaceListDirTool(self.sandbox)
        self.search_code = WorkspaceSearchCodeTool(self.sandbox)
        self.run_tests = WorkspaceRunTestsTool(self.sandbox, self.evidence)
        self.git_status = WorkspaceGitStatusTool(self.sandbox)
        self.git_diff = WorkspaceGitDiffTool(self.sandbox)
        self._dispatch: dict[str, Callable[..., dict[str, Any]]] = {
            "read_file": self._call_read_file,
            "write_file": self._call_write_file,
            "apply_patch": self._call_apply_patch,
            "list_dir": self._call_list_dir,
            "search_code": self._call_search_code,
            "run_tests": self._call_run_tests,
            "git_status": self._call_git_status,
            "git_diff": self._call_git_diff,
        }

    def list_tool_names(self) -> list[str]:
        return sorted(self._dispatch)

    def call(self, name: str, arguments: dict[str, Any] | None = None) -> dict[str, Any]:
        handler = self._dispatch.get(str(name or ""))
        if handler is None:
            return {"ok": False, "reason_code": "UNKNOWN_TOOL", "error": f"Unknown tool: {name}"}
        try:
            return handler(dict(arguments or {}))
        except WorkspaceSandboxError as exc:
            return {"ok": False, "reason_code": exc.reason_code, "error": exc.message}

    def _call_read_file(self, args: dict[str, Any]) -> dict[str, Any]:
        return self.read_file.run(str(args.get("path") or ""), max_chars=int(args.get("max_chars") or MAX_READ_CHARS))

    def _call_write_file(self, args: dict[str, Any]) -> dict[str, Any]:
        return self.write_file.run(
            str(args.get("path") or ""),
            str(args.get("content") if args.get("content") is not None else ""),
            allow_write=bool(args.get("allow_write")),
            create_parents=bool(args.get("create_parents", True)),
        )

    def _call_apply_patch(self, args: dict[str, Any]) -> dict[str, Any]:
        return self.apply_patch.run(
            str(args.get("path") or ""),
            content=args.get("content"),
            old_string=args.get("old_string"),
            new_string=args.get("new_string"),
            allow_write=bool(args.get("allow_write")),
        )

    def _call_list_dir(self, args: dict[str, Any]) -> dict[str, Any]:
        return self.list_dir.run(
            str(args.get("path") or "."),
            include_hidden=bool(args.get("include_hidden")),
        )

    def _call_search_code(self, args: dict[str, Any]) -> dict[str, Any]:
        return self.search_code.run(
            str(args.get("pattern") or ""),
            str(args.get("path") or "."),
            max_matches=int(args.get("max_matches") or MAX_SEARCH_MATCHES),
            case_insensitive=bool(args.get("case_insensitive")),
        )

    def _call_run_tests(self, args: dict[str, Any]) -> dict[str, Any]:
        extra = args.get("extra_args")
        return self.run_tests.run(
            str(args.get("command") or "pytest"),
            extra_args=list(extra) if isinstance(extra, list) else None,
        )

    def _call_git_status(self, _args: dict[str, Any]) -> dict[str, Any]:
        return self.git_status.run()

    def _call_git_diff(self, args: dict[str, Any]) -> dict[str, Any]:
        path = args.get("path")
        return self.git_diff.run(
            str(path) if path else None,
            staged=bool(args.get("staged")),
        )
