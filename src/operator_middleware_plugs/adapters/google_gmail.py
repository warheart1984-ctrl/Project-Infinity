"""Google Gmail / email workflow plug.

# Mythic: Google email workflows
# Engineering: GoogleGmailMiddlewarePlug
"""

from __future__ import annotations

from typing import Any

from src.operator_middleware_plugs.contract import (
    MiddlewarePlug,
    MiddlewarePlugAction,
    MiddlewarePlugDescriptor,
    env_any,
)


class GoogleGmailMiddlewarePlug(MiddlewarePlug):
    plug_id = "middleware.google.gmail"

    def describe(self) -> MiddlewarePlugDescriptor:
        token = env_any(
            "AAIS_GMAIL_ACCESS_TOKEN",
            "GMAIL_ACCESS_TOKEN",
            "GOOGLE_OAUTH_ACCESS_TOKEN",
        )
        return MiddlewarePlugDescriptor(
            plug_id=self.plug_id,
            display_name="Google Gmail / Email Workflows",
            provider="google",
            authority_level="execute",
            actions=[
                MiddlewarePlugAction("list_drafts", "List drafts", "List or simulate drafts"),
                MiddlewarePlugAction("send_draft", "Send / prepare draft", "Send when live; else demo draft"),
                MiddlewarePlugAction("email_send", "Email send", "Workflow email.send path"),
            ],
            auth_status="ready" if token else "needs_auth",
            activation_hint=(
                None
                if token
                else "Set AAIS_GMAIL_ACCESS_TOKEN (or GMAIL_ACCESS_TOKEN / GOOGLE_OAUTH_ACCESS_TOKEN)."
            ),
        )

    def execute(self, action: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
        payload = dict(payload or {})
        action = (action or "email_send").strip() or "email_send"
        force_demo = bool(payload.get("force_demo", True))
        token = env_any(
            "AAIS_GMAIL_ACCESS_TOKEN",
            "GMAIL_ACCESS_TOKEN",
            "GOOGLE_OAUTH_ACCESS_TOKEN",
        )
        to = str(payload.get("to") or "operator@local")
        subject = str(payload.get("subject") or "AAIS email")
        body = str(payload.get("body") or payload.get("text") or "")

        if force_demo or not token:
            if not force_demo and not token:
                return self._needs_auth(
                    action,
                    "Set AAIS_GMAIL_ACCESS_TOKEN for live Gmail send.",
                )
            return self._demo(
                action,
                f"Demo email draft to {to} (no Gmail API call).",
                {"to": to, "subject": subject, "body": body[:2000], "provider": "google_gmail"},
            )

        # Token present — honest deferral until full Gmail client ships
        return self._deferred_live(
            action,
            "Gmail token present but live Gmail API send is deferred — no pretend success.",
        )
