"""Microsoft Graph Excel workbook session client.

# Mythic: Excel Workbook Session
# Engineering: ExcelWorkbookSessionClient
"""

from __future__ import annotations

from typing import Any

import httpx

from src.operator_middleware_plugs.clients.graph_client import call_graph


def _workbook_base(*, item_path: str | None = None, item_id: str | None = None) -> str:
    if item_id:
        return f"me/drive/items/{item_id}/workbook"
    raw = (item_path or "/AAIS/exports/aais.xlsx").lstrip("/")
    safe = "".join(c if c.isalnum() or c in "._/-" else "_" for c in raw)[:200]
    return f"me/drive/root:/{safe}:/workbook"


def create_workbook_session(
    token: str | None,
    *,
    item_path: str | None = None,
    item_id: str | None = None,
    persist_changes: bool = True,
    transport: httpx.BaseTransport | None = None,
) -> dict[str, Any]:
    if not token:
        return {
            "ok": False,
            "reason_code": "EXCEL_NEEDS_AUTH",
            "error": "Graph token required for Excel workbook session",
        }
    base = _workbook_base(item_path=item_path, item_id=item_id)
    res = call_graph(
        token,
        f"{base}/createSession",
        method="POST",
        body={"persistChanges": persist_changes},
        transport=transport,
    )
    if not res.get("ok"):
        return res
    data = res.get("data") if isinstance(res.get("data"), dict) else {}
    session_id = str((data or {}).get("id") or "")
    if not session_id and not res.get("simulated"):
        return {
            "ok": False,
            "reason_code": "EXCEL_SESSION_MISSING_ID",
            "error": "createSession returned no id",
            "data": data,
        }
    return {
        **res,
        "reason_code": "EXCEL_SESSION_SIMULATE" if res.get("simulated") else "EXCEL_SESSION_CREATED",
        "session": {"workbookPath": base, "sessionId": session_id or "sim-session"},
    }


def _session_call(
    token: str | None,
    path: str,
    *,
    method: str,
    body: dict[str, Any] | None,
    session_id: str,
    transport: httpx.BaseTransport | None = None,
) -> dict[str, Any]:
    """call_graph does not accept custom headers; use httpx directly for session header."""
    if not token:
        return {"ok": False, "reason_code": "EXCEL_NEEDS_AUTH", "error": "Graph token required"}
    if not token:
        return call_graph(None, path, method=method, body=body, transport=transport)
    try:
        with httpx.Client(timeout=30.0, transport=transport) as client:
            res = client.request(
                method.upper(),
                f"https://graph.microsoft.com/v1.0/{path.lstrip('/')}",
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                    "workbook-session-id": session_id,
                },
                json=body,
            )
        try:
            data: Any = res.json()
        except Exception:
            data = {"raw": res.text[:2000]}
        if res.status_code >= 400:
            return {
                "ok": False,
                "status": res.status_code,
                "data": data,
                "error": f"Graph HTTP {res.status_code}",
                "reason_code": "GRAPH_HTTP_ERROR",
            }
        return {"ok": True, "status": res.status_code, "data": data, "reason_code": "GRAPH_LIVE_OK"}
    except httpx.HTTPError as exc:
        return {"ok": False, "status": 0, "error": str(exc), "reason_code": "GRAPH_NETWORK_ERROR"}


def get_workbook_range(
    token: str | None,
    session: dict[str, str],
    address: str = "A1:B2",
    *,
    transport: httpx.BaseTransport | None = None,
) -> dict[str, Any]:
    path = f"{session['workbookPath']}/worksheets/Sheet1/range(address='{address}')"
    return _session_call(
        token, path, method="GET", body=None, session_id=session["sessionId"], transport=transport
    )


def update_workbook_range(
    token: str | None,
    session: dict[str, str],
    address: str,
    values: list[list[Any]],
    *,
    transport: httpx.BaseTransport | None = None,
) -> dict[str, Any]:
    path = f"{session['workbookPath']}/worksheets/Sheet1/range(address='{address}')"
    return _session_call(
        token,
        path,
        method="PATCH",
        body={"values": values},
        session_id=session["sessionId"],
        transport=transport,
    )


def close_workbook_session(
    token: str | None,
    session: dict[str, str],
    *,
    transport: httpx.BaseTransport | None = None,
) -> dict[str, Any]:
    return _session_call(
        token,
        f"{session['workbookPath']}/closeSession",
        method="POST",
        body={},
        session_id=session["sessionId"],
        transport=transport,
    )


def run_workbook_session_flow(
    token: str | None,
    *,
    item_path: str | None = None,
    item_id: str | None = None,
    address: str = "A1:B2",
    values: list[list[Any]] | None = None,
    transport: httpx.BaseTransport | None = None,
) -> dict[str, Any]:
    steps: list[dict[str, Any]] = []
    created = create_workbook_session(
        token, item_path=item_path, item_id=item_id, transport=transport
    )
    steps.append({"step": "createSession", **created})
    if not created.get("ok") or not created.get("session"):
        return {
            "ok": False,
            "reason_code": created.get("reason_code"),
            "error": created.get("error"),
            "steps": steps,
        }
    session = created["session"]
    vals = values or [["metric", "value"], ["demo", 1]]
    written = update_workbook_range(token, session, address, vals, transport=transport)
    steps.append({"step": "updateRange", **written})
    if not written.get("ok"):
        close_workbook_session(token, session, transport=transport)
        return {
            "ok": False,
            "reason_code": written.get("reason_code"),
            "error": written.get("error"),
            "steps": steps,
            "sessionId": session.get("sessionId"),
        }
    read = get_workbook_range(token, session, address, transport=transport)
    steps.append({"step": "getRange", **read})
    closed = close_workbook_session(token, session, transport=transport)
    steps.append({"step": "closeSession", **closed})
    data = read.get("data") if isinstance(read.get("data"), dict) else {}
    return {
        "ok": bool(read.get("ok") and closed.get("ok")),
        "reason_code": "EXCEL_SESSION_FLOW_OK" if read.get("ok") else read.get("reason_code"),
        "error": None if read.get("ok") else read.get("error"),
        "steps": steps,
        "sessionId": session.get("sessionId"),
        "values": (data or {}).get("values"),
    }
