"""Stdio JSON-RPC MCP client for AAIS operator tools.

Mythic: Workshop Remote Plug
Engineering: AaisOperatorToolsStdioClient

Inputs: tool name + args; optional command/cwd/env/workspace_root
Outputs: structured invoke dict (same shape as local adapter)
Constraints: line-delimited JSON-RPC only; no arbitrary shell beyond configured MCP spawn
Failure modes: spawn/protocol/timeout → raise AaisToolsMcpClientError (caller fail-opens)
"""

from __future__ import annotations

import json
import os
import shlex
import subprocess
import sys
import threading
import time
from pathlib import Path
from typing import Any

WORKSPACE_ROOT_ENV = "AAIS_WORKSPACE_ROOT"
WRITES_ENV = "AAIS_TOOLS_MCP_ALLOW_WRITES"
MCP_ENABLE_ENV = "AAIS_JARVIS_TOOLS_MCP"
MCP_CMD_ENV = "AAIS_TOOLS_MCP_CMD"
MCP_TIMEOUT_ENV = "AAIS_TOOLS_MCP_TIMEOUT_SEC"

DEFAULT_TIMEOUT_SEC = 30.0
PROTOCOL_VERSION = "2024-11-05"

__all__ = [
    "AaisOperatorToolsStdioClient",
    "AaisToolsMcpClientError",
    "DEFAULT_TIMEOUT_SEC",
    "MCP_CMD_ENV",
    "MCP_ENABLE_ENV",
    "MCP_TIMEOUT_ENV",
    "invoke_aais_operator_tool_stdio",
    "jarvis_tools_mcp_enabled",
    "resolve_mcp_command",
    "resolve_mcp_cwd",
]


class AaisToolsMcpClientError(RuntimeError):
    """Stdio MCP spawn or protocol failure."""

    def __init__(self, message: str, *, reason_code: str = "MCP_CLIENT_ERROR") -> None:
        super().__init__(message)
        self.reason_code = reason_code


def jarvis_tools_mcp_enabled(env: dict[str, str] | None = None) -> bool:
    source = env if env is not None else os.environ
    raw = str(source.get(MCP_ENABLE_ENV, "") or "").strip().lower()
    return raw in {"1", "true", "yes", "on"}


def _repo_root() -> Path:
    try:
        from src.workspace_root import default_repo_root

        return default_repo_root(module_file=Path(__file__))
    except Exception:  # noqa: BLE001 — client must stay usable without workspace_root
        return Path(__file__).resolve().parents[1]


def resolve_mcp_cwd(*, repo_root: Path | None = None) -> Path:
    root = repo_root or _repo_root()
    service = root / "services" / "aais-tools-mcp"
    return service if service.is_dir() else root


def resolve_mcp_command(env: dict[str, str] | None = None) -> list[str]:
    source = env if env is not None else os.environ
    configured = str(source.get(MCP_CMD_ENV, "") or "").strip()
    if configured:
        return shlex.split(configured)
    return [sys.executable or "python3", "-m", "aais_tools_mcp"]


def _resolve_workspace_root(explicit: str | Path | None = None) -> Path:
    try:
        from src.workspace_root import resolve_workspace_root

        return resolve_workspace_root(explicit, module_file=Path(__file__))
    except Exception:  # noqa: BLE001
        configured = os.getenv(WORKSPACE_ROOT_ENV)
        if configured:
            return Path(configured).expanduser().resolve()
        if explicit is not None:
            return Path(explicit).expanduser().resolve()
        return _repo_root()


def _timeout_sec(env: dict[str, str] | None = None) -> float:
    source = env if env is not None else os.environ
    raw = str(source.get(MCP_TIMEOUT_ENV, "") or "").strip()
    if not raw:
        return DEFAULT_TIMEOUT_SEC
    try:
        value = float(raw)
    except ValueError as exc:
        raise AaisToolsMcpClientError(
            f"Invalid {MCP_TIMEOUT_ENV}={raw!r}",
            reason_code="MCP_TIMEOUT_INVALID",
        ) from exc
    return max(1.0, value)


class AaisOperatorToolsStdioClient:
    """Thin line-delimited JSON-RPC client over a spawned aais-tools-mcp process."""

    def __init__(
        self,
        *,
        workspace_root: str | Path | None = None,
        command: list[str] | None = None,
        cwd: str | Path | None = None,
        env: dict[str, str] | None = None,
        timeout_sec: float | None = None,
        allow_writes: bool | None = None,
    ) -> None:
        self.workspace_root = _resolve_workspace_root(workspace_root)
        self.command = list(command or resolve_mcp_command(env))
        self.cwd = Path(cwd) if cwd is not None else resolve_mcp_cwd()
        self.timeout_sec = float(timeout_sec if timeout_sec is not None else _timeout_sec(env))
        self._extra_env = dict(env or {})
        self._allow_writes = allow_writes
        self._proc: subprocess.Popen[str] | None = None
        self._next_id = 1
        self._stderr_tail: list[str] = []
        self._lock = threading.Lock()

    def __enter__(self) -> "AaisOperatorToolsStdioClient":
        self.start()
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        self.close()

    def start(self) -> None:
        if self._proc is not None:
            return
        child_env = os.environ.copy()
        child_env.update(self._extra_env)
        child_env[WORKSPACE_ROOT_ENV] = str(self.workspace_root)
        if self._allow_writes is not None:
            child_env[WRITES_ENV] = "1" if self._allow_writes else "0"
        try:
            self._proc = subprocess.Popen(
                self.command,
                cwd=str(self.cwd),
                env=child_env,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                bufsize=1,
            )
        except OSError as exc:
            raise AaisToolsMcpClientError(
                f"Failed to spawn MCP server: {exc}",
                reason_code="MCP_SPAWN_FAILED",
            ) from exc
        self._start_stderr_drain()
        self._handshake()

    def close(self) -> None:
        proc = self._proc
        self._proc = None
        if proc is None:
            return
        try:
            if proc.stdin and not proc.stdin.closed:
                proc.stdin.close()
        except OSError:
            pass
        try:
            proc.terminate()
            proc.wait(timeout=2)
        except Exception:  # noqa: BLE001
            try:
                proc.kill()
            except Exception:  # noqa: BLE001
                pass

    def call_tool(self, tool_name: str, arguments: dict[str, Any] | None = None) -> dict[str, Any]:
        self.start()
        response = self._request(
            "tools/call",
            {"name": str(tool_name), "arguments": dict(arguments or {})},
        )
        return self._parse_tool_result(tool_name, response)

    def list_tools(self) -> list[str]:
        self.start()
        response = self._request("tools/list", {})
        tools = response.get("tools") if isinstance(response, dict) else None
        if not isinstance(tools, list):
            raise AaisToolsMcpClientError(
                "tools/list returned unexpected payload",
                reason_code="MCP_PROTOCOL_ERROR",
            )
        names: list[str] = []
        for item in tools:
            if isinstance(item, dict) and item.get("name"):
                names.append(str(item["name"]))
        return names

    def _handshake(self) -> None:
        self._request(
            "initialize",
            {
                "protocolVersion": PROTOCOL_VERSION,
                "capabilities": {},
                "clientInfo": {"name": "aais-jarvis-tools-mcp-client", "version": "0.1.0"},
            },
        )
        self._notify("notifications/initialized", {})

    def _request(self, method: str, params: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            request_id = self._next_id
            self._next_id += 1
            message = {"jsonrpc": "2.0", "id": request_id, "method": method, "params": params}
            self._write(message)
            response = self._read_matching(request_id)
        if "error" in response:
            error = response.get("error") or {}
            raise AaisToolsMcpClientError(
                str(error.get("message") or error),
                reason_code="MCP_RPC_ERROR",
            )
        result = response.get("result")
        if not isinstance(result, dict):
            raise AaisToolsMcpClientError(
                f"Missing result for {method}",
                reason_code="MCP_PROTOCOL_ERROR",
            )
        return result

    def _notify(self, method: str, params: dict[str, Any]) -> None:
        with self._lock:
            self._write({"jsonrpc": "2.0", "method": method, "params": params})

    def _write(self, message: dict[str, Any]) -> None:
        proc = self._proc
        if proc is None or proc.stdin is None:
            raise AaisToolsMcpClientError("MCP process is not running", reason_code="MCP_NOT_RUNNING")
        try:
            proc.stdin.write(json.dumps(message) + "\n")
            proc.stdin.flush()
        except OSError as exc:
            raise AaisToolsMcpClientError(
                f"Failed writing to MCP stdin: {exc}",
                reason_code="MCP_STDIN_FAILED",
            ) from exc

    def _read_matching(self, request_id: int) -> dict[str, Any]:
        deadline = time.monotonic() + self.timeout_sec
        while time.monotonic() < deadline:
            line = self._readline(deadline)
            try:
                payload = json.loads(line)
            except json.JSONDecodeError as exc:
                raise AaisToolsMcpClientError(
                    f"Invalid JSON from MCP: {line[:200]!r}",
                    reason_code="MCP_PARSE_ERROR",
                ) from exc
            if not isinstance(payload, dict):
                continue
            if payload.get("id") == request_id:
                return payload
        raise AaisToolsMcpClientError(
            f"Timed out waiting for MCP response id={request_id}",
            reason_code="MCP_TIMEOUT",
        )

    def _readline(self, deadline: float) -> str:
        proc = self._proc
        if proc is None or proc.stdout is None:
            raise AaisToolsMcpClientError("MCP process is not running", reason_code="MCP_NOT_RUNNING")
        remaining = max(0.05, deadline - time.monotonic())
        holder: dict[str, Any] = {}

        def _reader() -> None:
            try:
                holder["line"] = proc.stdout.readline()
            except Exception as exc:  # noqa: BLE001
                holder["error"] = exc

        thread = threading.Thread(target=_reader, daemon=True)
        thread.start()
        thread.join(timeout=remaining)
        if thread.is_alive():
            raise AaisToolsMcpClientError(
                "Timed out reading MCP stdout",
                reason_code="MCP_TIMEOUT",
            )
        if "error" in holder:
            raise AaisToolsMcpClientError(
                f"Failed reading MCP stdout: {holder['error']}",
                reason_code="MCP_STDOUT_FAILED",
            )
        line = holder.get("line")
        if not line:
            code = proc.poll()
            stderr = "\n".join(self._stderr_tail[-20:]).strip()
            detail = f"exit={code}" if code is not None else "eof"
            if stderr:
                detail = f"{detail}; stderr={stderr[:500]}"
            raise AaisToolsMcpClientError(
                f"MCP stdout closed unexpectedly ({detail})",
                reason_code="MCP_PROCESS_EXITED",
            )
        return str(line).strip()

    def _start_stderr_drain(self) -> None:
        proc = self._proc
        if proc is None or proc.stderr is None:
            return

        def _drain() -> None:
            try:
                for line in proc.stderr:
                    text = str(line).rstrip()
                    if text:
                        self._stderr_tail.append(text)
                        if len(self._stderr_tail) > 100:
                            del self._stderr_tail[:-50]
            except Exception:  # noqa: BLE001
                return

        threading.Thread(target=_drain, daemon=True).start()

    @staticmethod
    def _parse_tool_result(tool_name: str, mcp_result: dict[str, Any]) -> dict[str, Any]:
        content = mcp_result.get("content")
        text = ""
        if isinstance(content, list):
            for block in content:
                if isinstance(block, dict) and block.get("type") == "text":
                    text = str(block.get("text") or "")
                    break
        payload: dict[str, Any]
        if text:
            try:
                decoded = json.loads(text)
                payload = decoded if isinstance(decoded, dict) else {"ok": True, "value": decoded}
            except json.JSONDecodeError:
                payload = {
                    "ok": not bool(mcp_result.get("isError")),
                    "raw_text": text,
                }
        else:
            payload = {"ok": not bool(mcp_result.get("isError")), "raw": mcp_result}
        if mcp_result.get("isError") and payload.get("ok", True):
            payload = dict(payload)
            payload["ok"] = False
            payload.setdefault("reason_code", "MCP_TOOL_ERROR")
        return {
            "capability_id": "aais_operator_tools",
            "tool": tool_name,
            "result": payload,
            "transport": "mcp_stdio",
        }


def invoke_aais_operator_tool_stdio(
    tool_name: str,
    args: dict[str, Any] | None = None,
    *,
    workspace_root: str | Path | None = None,
    command: list[str] | None = None,
    cwd: str | Path | None = None,
    env: dict[str, str] | None = None,
    timeout_sec: float | None = None,
) -> dict[str, Any]:
    """One-shot stdio invoke: spawn → handshake → tools/call → close."""
    with AaisOperatorToolsStdioClient(
        workspace_root=workspace_root,
        command=command,
        cwd=cwd,
        env=env,
        timeout_sec=timeout_sec,
    ) as client:
        return client.call_tool(tool_name, args)
