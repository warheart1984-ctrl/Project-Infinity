"""Workspace path sandbox for AAIS operator tools.

Mythic: Operator Workshop Boundary
Engineering: WorkspacePathSandbox

Inputs: relative path string, workspace root Path
Outputs: resolved Path inside root, or PolicyDenial
Constraints: no `..` escape, no absolute root escape, deny secrets/.env/oauth
Failure modes: escape or deny-list match → raise WorkspaceSandboxError with reason_code
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass
from pathlib import Path

WORKSPACE_ROOT_ENV = "AAIS_WORKSPACE_ROOT"

# Basename / relative path fragments that must never be read or written.
DENIED_BASENAME_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"^\.env($|\.)", re.IGNORECASE),
    re.compile(r"^credentials(\.|$)", re.IGNORECASE),
    re.compile(r".*secret.*", re.IGNORECASE),
    re.compile(r".*\.pem$", re.IGNORECASE),
    re.compile(r".*\.key$", re.IGNORECASE),
    re.compile(r"^id_rsa", re.IGNORECASE),
    re.compile(r"^id_ed25519", re.IGNORECASE),
)

DENIED_PATH_FRAGMENTS: tuple[str, ...] = (
    ".runtime/oauth",
    ".runtime/secrets",
    "secrets/",
    "/secrets/",
    ".aws/",
    ".ssh/",
    "node_modules/",
    ".git/objects/",
)


@dataclass(frozen=True)
class WorkspaceSandboxError(Exception):
    """Path refused by sandbox policy."""

    reason_code: str
    message: str

    def __str__(self) -> str:
        return f"{self.reason_code}: {self.message}"


class WorkspacePathSandbox:
    """Confine all file ops to an allowed workspace root."""

    def __init__(self, workspace_root: str | Path | None = None) -> None:
        self._explicit = Path(workspace_root) if workspace_root is not None else None

    def resolve_root(self) -> Path:
        configured = os.getenv(WORKSPACE_ROOT_ENV)
        if configured:
            root = Path(configured).expanduser().resolve()
        elif self._explicit is not None:
            root = self._explicit.expanduser().resolve()
        else:
            # services/aais-tools-mcp/aais_tools_mcp/sandbox.py → repo root
            root = Path(__file__).resolve().parents[3]
        if not root.is_dir():
            raise WorkspaceSandboxError(
                "WORKSPACE_ROOT_MISSING",
                f"Workspace root is not a directory: {root}",
            )
        if root.resolve() == Path(root.resolve().anchor):
            raise WorkspaceSandboxError(
                "WORKSPACE_ROOT_INVALID",
                "Filesystem root is not an allowed workspace",
            )
        return root

    def resolve_path(self, relative_path: str, *, for_write: bool = False) -> Path:
        raw = str(relative_path or "").strip()
        if not raw:
            raise WorkspaceSandboxError("PATH_REQUIRED", "Path is required")
        if Path(raw).is_absolute():
            raise WorkspaceSandboxError(
                "PATH_ABSOLUTE_DENIED",
                "Absolute paths are not allowed; use a path relative to the workspace root",
            )
        parts = Path(raw).parts
        if any(part == ".." for part in parts):
            raise WorkspaceSandboxError(
                "PATH_TRAVERSAL_DENIED",
                "Path traversal ('..') is not allowed",
            )
        root = self.resolve_root()
        candidate = (root / raw).resolve()
        try:
            relative = candidate.relative_to(root)
        except ValueError as exc:
            raise WorkspaceSandboxError(
                "PATH_ESCAPE_DENIED",
                "Path must stay inside the workspace root",
            ) from exc

        rel_posix = relative.as_posix()
        self._assert_not_denied(rel_posix, candidate.name)
        if for_write:
            # Evidence log dir is writable by the server itself, not by tool clients.
            if rel_posix.startswith(".runtime/aais-tools-mcp/"):
                raise WorkspaceSandboxError(
                    "PATH_EVIDENCE_RESERVED",
                    "Evidence log paths are reserved for the tool server",
                )
        return candidate

    def _assert_not_denied(self, rel_posix: str, basename: str) -> None:
        lowered = rel_posix.lower()
        for fragment in DENIED_PATH_FRAGMENTS:
            if fragment.lower() in lowered:
                raise WorkspaceSandboxError(
                    "PATH_SECRET_DENIED",
                    f"Access denied for protected path fragment: {fragment}",
                )
        for pattern in DENIED_BASENAME_PATTERNS:
            if pattern.search(basename):
                raise WorkspaceSandboxError(
                    "PATH_SECRET_DENIED",
                    f"Access denied for protected file name: {basename}",
                )
            # Also match any path component (e.g. nested .env)
            for part in Path(rel_posix).parts:
                if pattern.search(part):
                    raise WorkspaceSandboxError(
                        "PATH_SECRET_DENIED",
                        f"Access denied for protected path component: {part}",
                    )
