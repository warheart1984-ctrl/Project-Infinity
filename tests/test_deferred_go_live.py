"""Tests for deferred go-live: Excel session, skill store, sync conflicts."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest import mock

import httpx

from src.aais_tasks.aais_task_store import AaisTaskStore
from src.aais_tasks.graph_sync import sync_from_graph
from src.operator_middleware_plugs import operator_middleware_plug_registry
from src.operator_middleware_plugs.clients.excel_workbook_client import run_workbook_session_flow
from src.operator_middleware_plugs.skill_store import SkillStoreRegistry


class TestExcelWorkbook(unittest.TestCase):
    def test_needs_auth_without_token(self) -> None:
        result = run_workbook_session_flow(None, item_path="/AAIS/exports/x.xlsx")
        self.assertFalse(result["ok"])
        self.assertEqual(result["reason_code"], "EXCEL_NEEDS_AUTH")

    def test_session_flow_with_mock_transport(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            url = str(request.url)
            if "createSession" in url:
                return httpx.Response(201, json={"id": "sess-1"})
            if request.method == "PATCH":
                return httpx.Response(200, json={"values": [["a", 1]]})
            if request.method == "GET":
                return httpx.Response(200, json={"values": [["metric", "value"], ["demo", 1]]})
            return httpx.Response(204, json={})

        transport = httpx.MockTransport(handler)
        result = run_workbook_session_flow(
            "tok",
            item_path="/AAIS/exports/demo.xlsx",
            transport=transport,
        )
        self.assertTrue(result["ok"])
        self.assertEqual(result["reason_code"], "EXCEL_SESSION_FLOW_OK")
        self.assertGreaterEqual(len(result["steps"]), 4)

    def test_spreadsheet_plug_demo(self) -> None:
        result = operator_middleware_plug_registry.execute(
            "middleware.microsoft.spreadsheet",
            action="workbook_session",
            payload={"force_demo": True, "name": "report"},
        )
        self.assertTrue(result["ok"])
        self.assertEqual(result["outcome"], "demo")


class TestSkillStore(unittest.TestCase):
    def test_list_and_invoke(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            store = SkillStoreRegistry(file_path=Path(tmp) / "catalog.json")
            catalog = store.catalog()
            self.assertGreaterEqual(catalog["count"], 4)
            ok = store.invoke("longform_writer", args={"target": "brief"})
            self.assertTrue(ok["ok"])
            missing = store.invoke("nope")
            self.assertFalse(missing["ok"])


class TestSyncConflicts(unittest.TestCase):
    def test_report_does_not_overwrite(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            store = AaisTaskStore(runtime_root=Path(tmp))
            store.create(title="AAIS title", status="notStarted", source="aais", graph_id="g1")
            with mock.patch(
                "src.operator_middleware_plugs.clients.graph_client.graph_list_todo_tasks",
                return_value={
                    "ok": True,
                    "data": {"value": [{"id": "g1", "title": "Graph title", "status": "completed"}]},
                },
            ):
                result = sync_from_graph(store, "tok", conflict_policy="report")
            self.assertTrue(result["ok"])
            self.assertTrue(any(c.get("resolution") == "reported" for c in result.get("conflicts") or []))
            self.assertEqual(store.list()[0].title, "AAIS title")


if __name__ == "__main__":
    unittest.main()
