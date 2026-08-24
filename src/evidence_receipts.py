"""Evidence receipt adapter — cherry-pick of aaes-os/evidence-receipts.

Mythic: Evidence Spine
Engineering: EvidenceReceiptAdapter

Ports createEvidenceReceipt / verifyReceiptHash / ReceiptStore from
@aaes-os/evidence-receipts (sha3-256 subject + evidence: ids).
"""

from __future__ import annotations

import copy
import hashlib
import json
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Literal

EvidenceReceiptKind = Literal[
    "fault", "patch", "mri", "trust", "attestation", "runtime", "generic"
]

EVIDENCE_RECEIPT_VERSION = "evidence_receipt.v1"


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stable_stringify(value: Any) -> str:
    if isinstance(value, list):
        return "[" + ",".join(stable_stringify(item) for item in value) + "]"
    if isinstance(value, dict):
        return "{" + ",".join(
            f"{json.dumps(str(key), ensure_ascii=False)}:{stable_stringify(value[key])}"
            for key in sorted(value.keys(), key=str)
        ) + "}"
    return json.dumps(value, ensure_ascii=False)


def hash_json(value: Any) -> str:
    digest = hashlib.sha3_256(stable_stringify(value).encode("utf-8")).hexdigest()
    return f"sha3-256:{digest}"


def infer_kind(subsystem: str, claim_label: str) -> EvidenceReceiptKind:
    blob = f"{subsystem} {claim_label}".lower()
    for kind in ("mri", "trust", "attestation", "runtime", "patch", "fault"):
        if kind in blob:
            return kind  # type: ignore[return-value]
    return "generic"


@dataclass(slots=True)
class EvidenceReceipt:
    receipt_id: str
    kind: EvidenceReceiptKind
    claim_label: str
    subsystem: str
    evidence_refs: list[str]
    subject_hash: str
    issued_at: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "receiptId": self.receipt_id,
            "kind": self.kind,
            "claimLabel": self.claim_label,
            "subsystem": self.subsystem,
            "evidenceRefs": list(self.evidence_refs),
            "subjectHash": self.subject_hash,
            "issuedAt": self.issued_at,
        }

    def to_lirl_stored(self, **extra: Any) -> dict[str, Any]:
        """Shape usable by organism_receipt.from_lirl."""
        payload = {
            "receiptId": self.receipt_id,
            "issuedAt": self.issued_at,
            "claimLabel": self.claim_label,
            "subsystem": self.subsystem,
            "evidenceRefs": list(self.evidence_refs),
            "subjectHash": self.subject_hash,
        }
        payload.update(extra)
        return payload


def create_evidence_receipt(
    *,
    claim_label: str,
    subsystem: str,
    evidence_refs: list[str],
    subject: Any,
    kind: EvidenceReceiptKind | None = None,
    issued_at: str | None = None,
) -> EvidenceReceipt:
    refs = list(evidence_refs)
    subject_hash = hash_json(subject)
    resolved_kind = kind or infer_kind(subsystem, claim_label)
    material = "|".join([claim_label, subsystem, ",".join(refs), subject_hash])
    receipt_id = "evidence:" + hashlib.sha3_256(material.encode("utf-8")).hexdigest()
    return EvidenceReceipt(
        receipt_id=receipt_id,
        kind=resolved_kind,
        claim_label=claim_label,
        subsystem=subsystem,
        evidence_refs=refs,
        subject_hash=subject_hash,
        issued_at=issued_at or _utc_now_iso(),
    )


def create_cen_evidence_receipt(
    *,
    receipt_id: str,
    transition_id: str,
    verdict: str,
    reason_code: str,
    receipt_hash: str,
) -> EvidenceReceipt:
    return create_evidence_receipt(
        claim_label=f"cen:{verdict.lower()}:{reason_code.lower()}",
        subsystem="constitutional-enforcement-node",
        evidence_refs=[receipt_id, transition_id, receipt_hash],
        subject={
            "receiptId": receipt_id,
            "transitionId": transition_id,
            "verdict": verdict,
            "reasonCode": reason_code,
            "receiptHash": receipt_hash,
        },
        kind="runtime",
    )


def create_mri_evidence_receipt(
    *,
    evidence_id: str,
    provenance: str,
    recency: float,
    reliability: float,
    cross_evidence_consistency: float,
    subject: Any,
) -> EvidenceReceipt:
    return create_evidence_receipt(
        claim_label="mri-evidence-provenance",
        subsystem="mri-instrument",
        evidence_refs=[
            evidence_id,
            f"provenance:{provenance}",
            f"recency:{recency}",
            f"reliability:{reliability}",
            f"crossEvidenceConsistency:{cross_evidence_consistency}",
        ],
        subject=subject,
        kind="mri",
    )


def verify_receipt_hash(receipt: EvidenceReceipt | dict[str, Any]) -> bool:
    if isinstance(receipt, EvidenceReceipt):
        subject_hash = receipt.subject_hash
        receipt_id = receipt.receipt_id
    else:
        subject_hash = str(receipt.get("subjectHash") or receipt.get("subject_hash") or "")
        receipt_id = str(receipt.get("receiptId") or receipt.get("receipt_id") or "")
    return subject_hash.startswith("sha3-256:") and receipt_id.startswith("evidence:")


@dataclass
class StoredReceipt:
    id: str
    timestamp: str
    envelope: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        payload = dict(self.envelope)
        payload["id"] = self.id
        payload["timestamp"] = self.timestamp
        return payload


class EvidenceReceiptStore:
    """In-memory receipt store (aaes-os ReceiptStore)."""

    def __init__(self) -> None:
        self._receipts: dict[str, StoredReceipt] = {}

    def add(self, envelope: dict[str, Any]) -> dict[str, Any]:
        receipt_id = str(envelope.get("receiptId") or envelope.get("proposalHash") or uuid.uuid4())
        timestamp = str(envelope.get("issuedAt") or envelope.get("timestamp") or _utc_now_iso())
        record = StoredReceipt(id=receipt_id, timestamp=timestamp, envelope=copy.deepcopy(envelope))
        self._receipts[receipt_id] = record
        return copy.deepcopy(record.to_dict())

    def list(self) -> list[dict[str, Any]]:
        rows = sorted(
            self._receipts.values(),
            key=lambda item: (item.timestamp, item.id),
        )
        return [copy.deepcopy(item.to_dict()) for item in rows]

    def get_latest(self) -> dict[str, Any] | None:
        rows = self.list()
        return rows[-1] if rows else None

    def get_by_id(self, receipt_id: str) -> dict[str, Any] | None:
        item = self._receipts.get(receipt_id)
        return copy.deepcopy(item.to_dict()) if item else None

    def clear(self) -> None:
        self._receipts.clear()
