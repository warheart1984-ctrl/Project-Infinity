"""Free-cloud chat failover for AAIS Jarvis.

Mythic: Free Cloud Failover
Engineering: FreeCloudFailoverRouter

When a free/cloud chat provider fails transiently, pick the next available
provider from FrontierModelLibrary.FREE_CLOUD_CHAT_FAILOVER_ORDER and record
a UL lineage capability_call for provenance.
"""

from __future__ import annotations

from typing import Any, Callable

from src.providers.frontier_model_library import FREE_CLOUD_CHAT_FAILOVER_ORDER


def next_free_cloud_provider(
    failed_provider: str | None,
    *,
    can_invoke: Callable[[str], bool],
    already_tried: set[str] | None = None,
    order: tuple[str, ...] | None = None,
) -> str | None:
    """Return the next invokable free-cloud (or local) provider after a failure."""
    failed = str(failed_provider or "").strip().lower()
    tried = {str(item).strip().lower() for item in (already_tried or set()) if str(item).strip()}
    if failed:
        tried.add(failed)
    chain = order or FREE_CLOUD_CHAT_FAILOVER_ORDER
    for provider_id in chain:
        if provider_id in tried:
            continue
        if can_invoke(provider_id):
            return provider_id
    return None


def record_failover_lineage(
    *,
    session_id: str | None,
    session_metadata: dict[str, Any] | None,
    failed_provider: str,
    next_provider: str,
    reason: str,
) -> dict[str, Any] | None:
    """Emit a capability_call lineage node for one failover hop."""
    try:
        from src.ul_lineage import record_lineage_event

        return record_lineage_event(
            node_type="capability_call",
            cisiv_stage="implementation",
            session_id=session_id,
            session_metadata=session_metadata,
            claim_label="asserted",
            source_module="src.providers.free_cloud_failover",
            payload={
                "capability": "free_cloud_provider_failover",
                "failed_provider": failed_provider,
                "next_provider": next_provider,
                "reason": reason,
            },
        )
    except Exception:
        return None
