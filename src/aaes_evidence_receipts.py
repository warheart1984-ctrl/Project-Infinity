"""AAES-OS evidence receipts — Python port of @aaes-os/evidence-receipts.

Mythic: Evidence Spine
Engineering: EvidenceReceiptAdapter

Deterministic `evidence:` ids via sha3-256 over
claim|subsystem|refs|subjectHash. Stable stringify matches the TypeScript
byte-for-byte.

Protocol (`evidence_receipt.v1`): subject keys are hashed as given.
camelCase and snake_case are distinct hash inputs — not a bug. Key
normalization would be a versioned protocol change, not a cleanup.
See docs/contracts/AAES_EVIDENCE_RECEIPT_PROTOCOL.md (checkpoint b9852d7).
"""

from __future__ import annotations

import copy
import hashlib
import json
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Literal, Mapping

EvidenceReceiptKind = Literal[
    "fault", "patch", "mri", "trust", "attestation", "runtime", "generic"
]

# Normative protocol id. Bump only for breaking identity/canonicalization changes.
EVIDENCE_RECEIPT_VERSION = "evidence_receipt.v1"

# Node-generated goldens (trust-root / CEN / MRI) for regression anchors.
# Baseline commit: b9852d7 (docs/contracts/AAES_EVIDENCE_RECEIPT_PROTOCOL.md).
GOLDEN_TRUST_ROOT_RECEIPT_ID = (
    "evidence:70df716782241b7b201feeab1f5b3354dadb85c249058010c57095e7995da7f4"
)
GOLDEN_CEN_RECEIPT_ID = (
    "evidence:84c8ae8e1c50463f721079cc67e52485871e726c882f6ecbeb7ba6d0977243f9"
)
GOLDEN_MRI_RECEIPT_ID = (
    "evidence:9107db7c30ce378d8304a521c813df15677ecda6ac3ee74f9ce6a3ac1bbe95e4"
)


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _pick(mapping: Mapping[str, Any], *keys: str, default: Any = None) -> Any:
    for key in keys:
        if key in mapping and mapping[key] is not None:
            return mapping[key]
    return default


def stable_stringify(value: Any) -> str:
    """Canonical JSON for hashing (TS-compatible).

    Keys are sorted, but key *spellings* are not normalized: camelCase and
    snake_case remain distinct under evidence_receipt.v1.
    """
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
    claim_label: str | None = None,
    subsystem: str | None = None,
    evidence_refs: list[str] | None = None,
    subject: Any = None,
    kind: EvidenceReceiptKind | None = None,
    issued_at: str | None = None,
    # TS-native aliases
    claimLabel: str | None = None,
    evidenceRefs: list[str] | None = None,
    issuedAt: str | None = None,
) -> EvidenceReceipt:
    resolved_claim = str(claim_label if claim_label is not None else claimLabel or "")
    resolved_subsystem = str(subsystem or "")
    refs = list(evidence_refs if evidence_refs is not None else evidenceRefs or [])
    if not resolved_claim or not resolved_subsystem:
        raise ValueError("claim_label/claimLabel and subsystem are required")
    subject_hash = hash_json(subject)
    resolved_kind = kind or infer_kind(resolved_subsystem, resolved_claim)
    material = "|".join([resolved_claim, resolved_subsystem, ",".join(refs), subject_hash])
    receipt_id = "evidence:" + hashlib.sha3_256(material.encode("utf-8")).hexdigest()
    return EvidenceReceipt(
        receipt_id=receipt_id,
        kind=resolved_kind,
        claim_label=resolved_claim,
        subsystem=resolved_subsystem,
        evidence_refs=refs,
        subject_hash=subject_hash,
        issued_at=(issued_at if issued_at is not None else issuedAt) or _utc_now_iso(),
    )


def create_cen_evidence_receipt(
    subject: Mapping[str, Any] | None = None,
    /,
    *,
    receipt_id: str | None = None,
    transition_id: str | None = None,
    verdict: str | None = None,
    reason_code: str | None = None,
    receipt_hash: str | None = None,
    **aliases: Any,
) -> EvidenceReceipt:
    """Seal a CEN decision. Accepts camelCase (TS) or snake_case keys."""
    payload = dict(subject or {})
    payload.update(aliases)
    rid = str(
        receipt_id
        or _pick(payload, "receipt_id", "receiptId", default="")
    )
    tid = str(
        transition_id
        or _pick(payload, "transition_id", "transitionId", default="")
    )
    verd = str(verdict or _pick(payload, "verdict", default=""))
    reason = str(
        reason_code
        or _pick(payload, "reason_code", "reasonCode", default="")
    )
    rhash = str(
        receipt_hash
        or _pick(payload, "receipt_hash", "receiptHash", default="")
    )
    return create_evidence_receipt(
        claim_label=f"cen:{verd.lower()}:{reason.lower()}",
        subsystem="constitutional-enforcement-node",
        evidence_refs=[rid, tid, rhash],
        subject={
            "receiptId": rid,
            "transitionId": tid,
            "verdict": verd,
            "reasonCode": reason,
            "receiptHash": rhash,
        },
        kind="runtime",
    )


def create_mri_evidence_receipt(
    input_payload: Mapping[str, Any] | None = None,
    /,
    *,
    evidence_id: str | None = None,
    provenance: str | None = None,
    recency: float | None = None,
    reliability: float | None = None,
    cross_evidence_consistency: float | None = None,
    subject: Any = None,
    **aliases: Any,
) -> EvidenceReceipt:
    payload = dict(input_payload or {})
    payload.update(aliases)
    eid = str(evidence_id or _pick(payload, "evidence_id", "evidenceId", default=""))
    prov = str(provenance or _pick(payload, "provenance", default=""))
    rec = float(recency if recency is not None else _pick(payload, "recency", default=0.0))
    rel = float(
        reliability if reliability is not None else _pick(payload, "reliability", default=0.0)
    )
    cross = float(
        cross_evidence_consistency
        if cross_evidence_consistency is not None
        else _pick(payload, "cross_evidence_consistency", "crossEvidenceConsistency", default=0.0)
    )
    subj = subject if subject is not None else payload.get("subject")
    return create_evidence_receipt(
        claim_label="mri-evidence-provenance",
        subsystem="mri-instrument",
        evidence_refs=[
            eid,
            f"provenance:{prov}",
            f"recency:{rec}",
            f"reliability:{rel}",
            f"crossEvidenceConsistency:{cross}",
        ],
        subject=subj,
        kind="mri",
    )


def create_receipts_for_subjects(inputs: list[dict[str, Any]]) -> list[EvidenceReceipt]:
    rows: list[EvidenceReceipt] = []
    for item in inputs:
        rows.append(
            create_evidence_receipt(
                claim_label=item.get("claim_label") or item.get("claimLabel"),
                subsystem=str(item.get("subsystem") or ""),
                evidence_refs=list(item.get("evidence_refs") or item.get("evidenceRefs") or []),
                subject=item.get("subject"),
                kind=item.get("kind"),
                issued_at=item.get("issued_at") or item.get("issuedAt"),
            )
        )
    return rows


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
        rows = sorted(self._receipts.values(), key=lambda item: (item.timestamp, item.id))
        return [copy.deepcopy(item.to_dict()) for item in rows]

    def get_latest(self) -> dict[str, Any] | None:
        rows = self.list()
        return rows[-1] if rows else None

    def get_by_id(self, receipt_id: str) -> dict[str, Any] | None:
        item = self._receipts.get(receipt_id)
        return copy.deepcopy(item.to_dict()) if item else None

    def clear(self) -> None:
        self._receipts.clear()
