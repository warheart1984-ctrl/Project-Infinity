"""OperatorMiddlewarePlugRegistry — catalog + governed execute for middleware plugs.

# Mythic: Middleware Plug Registry
# Engineering: OperatorMiddlewarePlugRegistry
"""

from __future__ import annotations

from typing import Any

from src.operator_middleware_plugs.adapters.google_gmail import GoogleGmailMiddlewarePlug
from src.operator_middleware_plugs.adapters.microsoft_graph import (
    MicrosoftCalendarMiddlewarePlug,
    MicrosoftMailMiddlewarePlug,
    MicrosoftTasksMiddlewarePlug,
)
from src.operator_middleware_plugs.adapters.spreadsheet_export import SpreadsheetExportMiddlewarePlug
from src.operator_middleware_plugs.contract import MiddlewarePlug


class OperatorMiddlewarePlugRegistry:
    """Catalogs middleware plugs; execute fail-closed with demo / needs_auth / deferred live."""

    def __init__(self, plugs: list[MiddlewarePlug] | None = None) -> None:
        self._plugs: dict[str, MiddlewarePlug] = {}
        for plug in plugs or self._default_plugs():
            self.register(plug)

    @staticmethod
    def _default_plugs() -> list[MiddlewarePlug]:
        return [
            GoogleGmailMiddlewarePlug(),
            MicrosoftTasksMiddlewarePlug(),
            MicrosoftCalendarMiddlewarePlug(),
            MicrosoftMailMiddlewarePlug(),
            SpreadsheetExportMiddlewarePlug(),
        ]

    def register(self, plug: MiddlewarePlug) -> None:
        self._plugs[plug.plug_id] = plug
        for alias in getattr(plug, "aliases", ()) or ():
            self._plugs[str(alias)] = plug

    def list_plugs(self) -> list[dict[str, Any]]:
        seen: set[str] = set()
        rows: list[dict[str, Any]] = []
        for plug in self._plugs.values():
            if plug.plug_id in seen:
                continue
            seen.add(plug.plug_id)
            rows.append(plug.describe().to_dict())
        return rows

    def get(self, plug_id: str) -> MiddlewarePlug | None:
        return self._plugs.get(plug_id)

    def catalog(self) -> dict[str, Any]:
        plugs = self.list_plugs()
        return {
            "registry": "OperatorMiddlewarePlugRegistry",
            "plug_class": "middleware",
            "plug_count": len(plugs),
            "plugs": plugs,
            "not_claimed": [
                "Full Gmail/Outlook OAuth UX",
                "Live Graph To Do/Calendar/Mail client (token → deferred until wired)",
            ],
        }

    def execute(
        self,
        plug_id: str,
        *,
        action: str | None = None,
        payload: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        plug = self._plugs.get(plug_id)
        if not plug:
            return {
                "ok": False,
                "outcome": "not_found",
                "plug_id": plug_id,
                "reason_code": "MIDDLEWARE_PLUG_NOT_FOUND",
            }
        desc = plug.describe()
        act = (action or "").strip()
        if not act and desc.actions:
            act = desc.actions[0].action_id
        result = plug.execute(act, payload)
        result.setdefault("plug_id", plug.plug_id)
        result.setdefault("provider", desc.provider)
        return result


operator_middleware_plug_registry = OperatorMiddlewarePlugRegistry()
