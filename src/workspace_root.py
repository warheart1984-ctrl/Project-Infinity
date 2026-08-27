"""Safe workspace-root resolution for Jarvis local file tools.

Mythic: Operator Workshop Boundary
Engineering: WorkspaceRootResolver

Inputs: optional env override, optional explicit root, calling module path
Outputs: absolute Path confined to the repo (never filesystem root)
Constraints: read-only resolution; never walk `/`, `/proc`, `/sys`, `/dev`
Failure modes: missing/invalid override → fall back to repo root; EPERM on
proc map introspection must not reach chat (walkers skip unsafe dirs)
"""

from __future__ import annotations

import os
from pathlib import Path

WORKSPACE_ROOT_ENV = "AAIS_WORKSPACE_ROOT"

# Never descend into these when walking a workspace. Container sandboxes often
# raise EPERM on `/proc/<pid>/map_files/...` (PID 1 is common under Docker).
UNSAFE_WALK_DIR_NAMES = frozenset(
    {
        "proc",
        "sys",
        "dev",
        "map_files",
        "run",
        "boot",
        "lost+found",
    }
)


def _looks_like_repo_root(candidate: Path) -> bool:
    return (candidate / "pyproject.toml").is_file() or (
        (candidate / "src").is_dir() and ((candidate / "app").is_dir() or (candidate / "aais").is_dir())
    )


def default_repo_root(*, module_file: Path | None = None) -> Path:
    """Locate the Project Infinity repo root from a module under ``src/``."""
    start = (module_file or Path(__file__)).resolve()
    for parent in start.parents:
        if _looks_like_repo_root(parent):
            return parent
    # Modules directly under src/ → parents[1]; nested src/<pkg>/ → parents[2].
    if start.parent.name == "src":
        return start.parents[1]
    if len(start.parents) > 1 and start.parents[1].name == "src":
        return start.parents[2]
    return start.parents[1]


def _is_filesystem_root(path: Path) -> bool:
    resolved = path.resolve()
    return resolved == Path(resolved.anchor)


def resolve_workspace_root(
    explicit: str | Path | None = None,
    *,
    env_var: str = WORKSPACE_ROOT_ENV,
    module_file: Path | None = None,
) -> Path:
    """Resolve the operator-visible workspace root.

    Prefer ``AAIS_WORKSPACE_ROOT`` (or ``env_var``), then an explicit constructor
    root, then the repo root inferred from ``module_file``. Filesystem root
    (``/``) is rejected because workspace walks would enter ``/proc`` and fail
    chat turns with ``[Errno 1] Operation not permitted: '/proc/1/map_files/...'``.
    """
    fallback = default_repo_root(module_file=module_file or Path(__file__))
    configured = os.getenv(env_var)
    if configured:
        candidate = Path(configured).expanduser().resolve()
    elif explicit is not None:
        candidate = Path(explicit).expanduser().resolve()
    else:
        candidate = fallback

    if _is_filesystem_root(candidate) or not candidate.is_dir():
        return fallback
    return candidate
