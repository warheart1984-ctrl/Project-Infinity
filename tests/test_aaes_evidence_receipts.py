"""Vitest-parity suite for @aaes-os/evidence-receipts Python port."""

from __future__ import annotations

import unittest

from src.aaes_evidence_receipts import (
    GOLDEN_CEN_RECEIPT_ID,
    GOLDEN_MRI_RECEIPT_ID,
    GOLDEN_TRUST_ROOT_RECEIPT_ID,
    EvidenceReceiptStore,
    create_cen_evidence_receipt,
    create_evidence_receipt,
    create_mri_evidence_receipt,
    create_receipts_for_subjects,
    hash_json,
    stable_stringify,
    verify_receipt_hash,
)


class TestAaesEvidenceReceipts(unittest.TestCase):
    def test_deterministic_trust_root_golden(self):
        first = create_evidence_receipt(
            claim_label="trust-root-sealed",
            subsystem="trust-root",
            evidence_refs=["boot:ok", "measurement:h_trust_root"],
            subject={"hTrustRoot": "sha3-256:" + ("a" * 64)},
        )
        second = create_evidence_receipt(
            claimLabel="trust-root-sealed",
            subsystem="trust-root",
            evidenceRefs=["boot:ok", "measurement:h_trust_root"],
            subject={"hTrustRoot": "sha3-256:" + ("a" * 64)},
        )
        self.assertEqual(first.receipt_id, second.receipt_id)
        self.assertEqual(first.receipt_id, GOLDEN_TRUST_ROOT_RECEIPT_ID)
        self.assertEqual(first.kind, "trust")

    def test_cen_golden_camel_and_snake_helpers(self):
        cen = create_cen_evidence_receipt(
            {
                "receiptId": "cen:abc",
                "transitionId": "transition:deny",
                "verdict": "DENY",
                "reasonCode": "INVARIANT_VIOLATION",
                "receiptHash": "sha3-256:" + ("a" * 64),
            }
        )
        again = create_cen_evidence_receipt(
            receipt_id="cen:abc",
            transition_id="transition:deny",
            verdict="DENY",
            reason_code="INVARIANT_VIOLATION",
            receipt_hash="sha3-256:" + ("a" * 64),
        )
        self.assertEqual(cen.receipt_id, GOLDEN_CEN_RECEIPT_ID)
        self.assertEqual(cen.receipt_id, again.receipt_id)
        self.assertEqual(cen.kind, "runtime")
        self.assertTrue(verify_receipt_hash(cen))

    def test_mri_golden(self):
        mri = create_mri_evidence_receipt(
            evidenceId="evidence:mri:1",
            provenance="system_log",
            recency=0.92,
            reliability=0.88,
            crossEvidenceConsistency=0.81,
            subject={"continuity": 72},
        )
        self.assertEqual(mri.receipt_id, GOLDEN_MRI_RECEIPT_ID)
        self.assertEqual(mri.kind, "mri")
        self.assertTrue(verify_receipt_hash(mri))

    def test_kind_inference_runtime_and_mri(self):
        runtime = create_evidence_receipt(
            claim_label="runtime-initialized",
            subsystem="runtime-law-spine",
            evidence_refs=["registration:ok"],
            subject={"allowed": True},
        )
        mri = create_evidence_receipt(
            claim_label="mri-continuity-report",
            subsystem="mri-instrument",
            evidence_refs=["mri:comparison"],
            subject={"continuity": 72},
        )
        self.assertEqual(runtime.kind, "runtime")
        self.assertEqual(mri.kind, "mri")

    def test_stable_stringify_matches_sorted_keys(self):
        self.assertEqual(stable_stringify({"b": 1, "a": 2}), '{"a":2,"b":1}')
        self.assertTrue(hash_json({"continuity": 72}).startswith("sha3-256:"))

    def test_camel_vs_snake_subject_keys_differ_deliberately(self):
        """Protocol v1: camelCase vs snake_case subject keys → different ids.

        Changing this would be evidence_receipt.v2, not a cleanup.
        """
        camel = create_cen_evidence_receipt(
            receiptId="cen:x",
            transitionId="t:1",
            verdict="ALLOW",
            reasonCode="OK",
            receiptHash="sha3-256:" + ("b" * 64),
        )
        # Force snake_case subject hashing path by building via create_evidence_receipt
        snake = create_evidence_receipt(
            claim_label="cen:allow:ok",
            subsystem="constitutional-enforcement-node",
            evidence_refs=["cen:x", "t:1", "sha3-256:" + ("b" * 64)],
            subject={
                "receipt_id": "cen:x",
                "transition_id": "t:1",
                "verdict": "ALLOW",
                "reason_code": "OK",
                "receipt_hash": "sha3-256:" + ("b" * 64),
            },
            kind="runtime",
        )
        self.assertNotEqual(camel.receipt_id, snake.receipt_id)

    def test_batch_create(self):
        rows = create_receipts_for_subjects(
            [
                {
                    "claimLabel": "fault-recorded",
                    "subsystem": "fault-journal",
                    "evidenceRefs": ["fault:1"],
                    "subject": {"code": "E1"},
                }
            ]
        )
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0].kind, "fault")

    def test_store_roundtrip(self):
        store = EvidenceReceiptStore()
        receipt = create_evidence_receipt(
            claim_label="patch-applied",
            subsystem="patch-forge",
            evidence_refs=["patch:1"],
            subject={"ok": True},
            issued_at="2026-01-15T12:00:00Z",
        )
        store.add(receipt.to_dict())
        self.assertEqual(store.get_latest()["id"], receipt.receipt_id)
        self.assertIsNotNone(store.get_by_id(receipt.receipt_id))


if __name__ == "__main__":
    unittest.main()
