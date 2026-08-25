"""Microsoft Graph Tasks / Calendar / Mail plugs.

# Mythic: Microsoft Tasks / Outlook
# Engineering: MicrosoftGraphMiddlewarePlugs
"""

from __future__ import annotations

from typing import Any

from src.operator_middleware_plugs.contract import (
    MiddlewarePlug,
    MiddlewarePlugAction,
    MiddlewarePlugDescriptor,
    env_any,
)


def _graph_token() -> str:
    return env_any(
        "AAIS_MS_GRAPH_TOKEN",
        "MICROSOFT_GRAPH_TOKEN",
        "MS_GRAPH_ACCESS_TOKEN",
        "AAIS_OUTLOOK_ACCESS_TOKEN",
    )


class MicrosoftTasksMiddlewarePlug(MiddlewarePlug):
    plug_id = "middleware.microsoft.tasks"
    # Also aliased as native pattern for workflow bundles
    aliases = ("native.microsoft.tasks",)

    def describe(self) -> MiddlewarePlugDescriptor:
        token = _graph_token()
        return MiddlewarePlugDescriptor(
            plug_id=self.plug_id,
            display_name="Microsoft Graph Tasks / To Do",
            provider="microsoft",
            authority_level="execute",
            actions=[
                MiddlewarePlugAction("list_tasks", "List tasks"),
                MiddlewarePlugAction("create_task", "Create task"),
            ],
            auth_status="ready" if token else "needs_auth",
            activation_hint=(
                None
                if token
                else "Set AAIS_MS_GRAPH_TOKEN (or MICROSOFT_GRAPH_TOKEN) for live Graph To Do."
            ),
        )

    def execute(self, action: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
        payload = dict(payload or {})
        action = (action or "list_tasks").strip() or "list_tasks"
        force_demo = bool(payload.get("force_demo", True))
        token = _graph_token()
        title = str(payload.get("title") or payload.get("text") or "AAIS task")
        if force_demo or not token:
            if not force_demo and not token:
                return self._needs_auth(action, "Set AAIS_MS_GRAPH_TOKEN for live Graph tasks.")
            tasks = [{"id": "demo-1", "title": title[:120], "status": "notStarted"}]
            return self._demo(action, f"Demo Graph tasks ({action}).", {"tasks": tasks})
        return self._deferred_live(
            action,
            "Graph token present but live To Do API execute is deferred — no silent substitute.",
        )


class MicrosoftCalendarMiddlewarePlug(MiddlewarePlug):
    """Implements native.calendar.schedule path — no longer pending_plug."""

    plug_id = "native.calendar.schedule"

    def describe(self) -> MiddlewarePlugDescriptor:
        token = _graph_token()
        return MiddlewarePlugDescriptor(
            plug_id=self.plug_id,
            display_name="Microsoft Calendar Schedule",
            provider="microsoft",
            authority_level="execute",
            actions=[
                MiddlewarePlugAction("schedule", "Schedule event"),
                MiddlewarePlugAction("list_events", "List events"),
            ],
            auth_status="ready" if token else "needs_auth",
            activation_hint=(
                None
                if token
                else "Set AAIS_MS_GRAPH_TOKEN for live Calendar. Demo without token."
            ),
        )

    def execute(self, action: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
        payload = dict(payload or {})
        action = (action or "schedule").strip() or "schedule"
        force_demo = bool(payload.get("force_demo", True))
        token = _graph_token()
        title = str(payload.get("title") or payload.get("subject") or "AAIS follow-up")
        when = str(payload.get("when") or payload.get("start") or "next business day 10:00")
        if force_demo or not token:
            if not force_demo and not token:
                return self._needs_auth(action, "Set AAIS_MS_GRAPH_TOKEN for live Calendar.")
            return self._demo(
                action,
                f"Demo calendar block: {title} @ {when}",
                {"event": {"title": title, "when": when, "provider": "microsoft_graph_calendar"}},
            )
        return self._deferred_live(
            action,
            "Graph token present but live Calendar API execute is deferred.",
        )


class MicrosoftMailMiddlewarePlug(MiddlewarePlug):
    plug_id = "middleware.microsoft.mail"

    def describe(self) -> MiddlewarePlugDescriptor:
        token = _graph_token()
        return MiddlewarePlugDescriptor(
            plug_id=self.plug_id,
            display_name="Microsoft Outlook / Graph Mail",
            provider="microsoft",
            authority_level="execute",
            actions=[
                MiddlewarePlugAction("send_mail", "Send mail"),
                MiddlewarePlugAction("email_send", "Email send (workflow)"),
            ],
            auth_status="ready" if token else "needs_auth",
            activation_hint=(
                None
                if token
                else "Set AAIS_MS_GRAPH_TOKEN or AAIS_OUTLOOK_ACCESS_TOKEN for live Outlook mail."
            ),
        )

    def execute(self, action: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
        payload = dict(payload or {})
        action = (action or "email_send").strip() or "email_send"
        force_demo = bool(payload.get("force_demo", True))
        token = _graph_token()
        to = str(payload.get("to") or "operator@local")
        subject = str(payload.get("subject") or "AAIS mail")
        body = str(payload.get("body") or "")
        if force_demo or not token:
            if not force_demo and not token:
                return self._needs_auth(action, "Set AAIS_MS_GRAPH_TOKEN for live Outlook send.")
            return self._demo(
                action,
                f"Demo Outlook draft to {to}",
                {"to": to, "subject": subject, "body": body[:2000]},
            )
        return self._deferred_live(action, "Outlook token present but live send deferred.")
