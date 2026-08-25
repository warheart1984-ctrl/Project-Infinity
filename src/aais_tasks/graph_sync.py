"""Graph ↔ AAIS sync with conflict detection.

# Mythic: Graph ↔ AAIS task bridge
# Engineering: sync_from_graph / sync_to_graph — conflict policy
"""

from __future__ import annotations

import os
from typing import Any, Literal

from src.aais_tasks.aais_task_store import AaisTaskStore

SyncConflictPolicy = Literal["prefer_aais", "prefer_graph", "report"]


def _graph_client():
    # Lazy import avoids circular import via operator_middleware_plugs.__init__
    from src.operator_middleware_plugs.clients import graph_client as gc

    return gc


def _policy(explicit: str | None = None) -> SyncConflictPolicy:
    raw = (explicit or os.getenv("AAIS_GRAPH_SYNC_CONFLICT_POLICY") or "report").strip()
    if raw in {"prefer_aais", "prefer_graph", "report"}:
        return raw  # type: ignore[return-value]
    return "report"


def _map_status(s: Any) -> str:
    v = str(s or "").lower()
    if v == "completed":
        return "completed"
    if v in {"inprogress", "in_progress"}:
        return "inProgress"
    return "notStarted"


def _detect(aais: dict[str, Any], graph_item: dict[str, Any]) -> list[dict[str, str]]:
    diffs: list[dict[str, str]] = []
    g_title = str(graph_item.get("title") or "")
    if g_title and g_title != aais.get("title"):
        diffs.append({"field": "title", "aaisValue": str(aais.get("title")), "graphValue": g_title})
    g_status = _map_status(graph_item.get("status"))
    if g_status != aais.get("status"):
        diffs.append(
            {"field": "status", "aaisValue": str(aais.get("status")), "graphValue": g_status}
        )
    return diffs


def sync_from_graph(
    store: AaisTaskStore,
    token: str | None,
    *,
    list_id: str = "tasks",
    conflict_policy: str | None = None,
) -> dict[str, Any]:
    if not token:
        return {
            "ok": False,
            "needs_auth": True,
            "reason_code": "GRAPH_SYNC_NEEDS_AUTH",
            "error": "Set AAIS_MS_GRAPH_TOKEN for syncFromGraph.",
        }
    policy = _policy(conflict_policy)
    gc = _graph_client()
    listed = gc.graph_list_todo_tasks(token, list_id=list_id)
    if not listed.get("ok"):
        return {
            "ok": False,
            "reason_code": listed.get("reason_code"),
            "error": listed.get("error"),
        }
    value = (listed.get("data") or {}).get("value") if isinstance(listed.get("data"), dict) else []
    imported: list[dict[str, Any]] = []
    conflicts: list[dict[str, Any]] = []
    for item in value or []:
        if not isinstance(item, dict):
            continue
        graph_id = str(item.get("id") or "")
        if not graph_id:
            continue
        existing = next((t for t in store.list() if t.graph_id == graph_id), None)
        if existing:
            diffs = _detect(existing.to_dict(), item)
            if not diffs:
                imported.append(existing.to_dict())
                continue
            for d in diffs:
                if policy == "report":
                    conflicts.append(
                        {
                            "aaisTaskId": existing.id,
                            "graphId": graph_id,
                            **d,
                            "resolution": "reported",
                        }
                    )
                elif policy == "prefer_aais":
                    conflicts.append(
                        {
                            "aaisTaskId": existing.id,
                            "graphId": graph_id,
                            **d,
                            "resolution": "kept_aais",
                        }
                    )
                else:
                    patch: dict[str, Any] = {"source": "graph"}
                    if d["field"] == "title":
                        patch["title"] = d["graphValue"]
                    if d["field"] == "status":
                        patch["status"] = _map_status(d["graphValue"])
                    updated = store.update(existing.id, **patch)
                    if updated:
                        imported.append(updated.to_dict())
                    conflicts.append(
                        {
                            "aaisTaskId": existing.id,
                            "graphId": graph_id,
                            **d,
                            "resolution": "kept_graph",
                        }
                    )
            if policy in {"prefer_aais", "report"}:
                imported.append(existing.to_dict())
            continue
        task = store.create(
            title=str(item.get("title") or "Graph task"),
            status=_map_status(item.get("status")),
            source="graph",
            graph_id=graph_id,
        )
        imported.append(task.to_dict())
    return {
        "ok": True,
        "reason_code": (
            "GRAPH_SYNC_FROM_CONFLICTS"
            if any(c.get("resolution") == "reported" for c in conflicts)
            else "GRAPH_SYNC_FROM_OK"
        ),
        "imported": imported,
        "conflicts": conflicts,
        "policy": policy,
    }


def sync_to_graph(
    store: AaisTaskStore,
    token: str | None,
    task_id: str,
    *,
    list_id: str = "tasks",
    conflict_policy: str | None = None,
) -> dict[str, Any]:
    if not token:
        return {
            "ok": False,
            "needs_auth": True,
            "reason_code": "GRAPH_SYNC_NEEDS_AUTH",
            "error": "Set AAIS_MS_GRAPH_TOKEN for syncToGraph.",
        }
    policy = _policy(conflict_policy)
    task = store.get(task_id)
    if not task:
        return {"ok": False, "reason_code": "AAIS_TASK_NOT_FOUND", "error": f"No task {task_id}"}
    conflicts: list[dict[str, Any]] = []
    gc = _graph_client()
    if task.graph_id:
        remote = gc.call_graph(token, f"me/todo/lists/{list_id}/tasks/{task.graph_id}", method="GET")
        if remote.get("ok") and isinstance(remote.get("data"), dict):
            diffs = _detect(task.to_dict(), remote["data"])
            for d in diffs:
                if policy == "report":
                    conflicts.append(
                        {
                            "aaisTaskId": task.id,
                            "graphId": task.graph_id,
                            **d,
                            "resolution": "reported",
                        }
                    )
                elif policy == "prefer_graph":
                    patch = {"source": "graph"}
                    if d["field"] == "title":
                        patch["title"] = d["graphValue"]
                    if d["field"] == "status":
                        patch["status"] = _map_status(d["graphValue"])
                    store.update(task.id, **patch)
                    conflicts.append(
                        {
                            "aaisTaskId": task.id,
                            "graphId": task.graph_id,
                            **d,
                            "resolution": "kept_graph",
                        }
                    )
                else:
                    conflicts.append(
                        {
                            "aaisTaskId": task.id,
                            "graphId": task.graph_id,
                            **d,
                            "resolution": "kept_aais",
                        }
                    )
            if policy == "report" and diffs:
                return {
                    "ok": True,
                    "reason_code": "GRAPH_SYNC_TO_CONFLICTS",
                    "exported": [task.to_dict()],
                    "conflicts": conflicts,
                    "policy": policy,
                }
        patch = gc.call_graph(
            token,
            f"me/todo/lists/{list_id}/tasks/{task.graph_id}",
            method="PATCH",
            body={
                "title": task.title,
                "status": "completed" if task.status == "completed" else "notStarted",
            },
        )
        if not patch.get("ok"):
            return {
                "ok": False,
                "reason_code": patch.get("reason_code"),
                "error": patch.get("error"),
                "conflicts": conflicts,
                "policy": policy,
            }
        return {
            "ok": True,
            "reason_code": "GRAPH_SYNC_TO_CONFLICTS" if conflicts else "GRAPH_SYNC_TO_OK",
            "exported": [task.to_dict()],
            "conflicts": conflicts,
            "policy": policy,
        }
    created = gc.graph_create_todo_task(token, task.title, list_id=list_id)
    if not created.get("ok"):
        return {
            "ok": False,
            "reason_code": created.get("reason_code"),
            "error": created.get("error"),
            "policy": policy,
        }
    data = created.get("data") if isinstance(created.get("data"), dict) else {}
    graph_id = str((data or {}).get("id") or "")
    updated = store.update(task.id, graph_id=graph_id or None, source="aais")
    return {
        "ok": True,
        "reason_code": "GRAPH_SYNC_TO_OK",
        "exported": [(updated or task).to_dict()],
        "conflicts": conflicts,
        "policy": policy,
    }
