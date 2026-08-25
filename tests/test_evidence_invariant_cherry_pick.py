"""Tests for cherry-picked evidence receipts + invariant registry."""

from __future__ import annotations

import unittest

from src.evidence_receipts import (
    EvidenceReceiptStore,
    create_cen_evidence_receipt,
    create_evidence_receipt,
    create_mri_evidence_receipt,
    verify_receipt_hash,
)
from src.invariant_registry import (
    CANONICAL_INVARIANTS,
    compile_invariant_dsl,
    create_invariant_registry,
    evaluate_threshold_invariant,
)
from src.organism_receipt import from_evidence_receipt, verify_receipt_id


class TestEvidenceReceipts(unittest.TestCase):
    def test_deterministic_receipt_ids(self):
        first = create_evidence_receipt(
            claim_label="trust-root-sealed",
            subsystem="trust-root",
            evidence_refs=["boot:ok", "measurement:h_trust_root"],
            subject={"hTrustRoot": "sha3-256:" + ("a" * 64)},
        )
        second = create_evidence_receipt(
            claim_label="trust-root-sealed",
            subsystem="trust-root",
            evidence_refs=["boot:ok", "measurement:h_trust_root"],
            subject={"hTrustRoot": "sha3-256:" + ("a" * 64)},
        )
        self.assertEqual(first.receipt_id, second.receipt_id)
        self.assertTrue(first.receipt_id.startswith("evidence:"))
        self.assertTrue(verify_receipt_hash(first))

    def test_kind_inference(self):
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

    def test_cen_and_mri_helpers(self):
        cen = create_cen_evidence_receipt(
            receipt_id="cen:abc",
            transition_id="transition:deny",
            verdict="DENY",
            reason_code="INVARIANT_VIOLATION",
            receipt_hash="sha3-256:" + ("a" * 64),
        )
        mri = create_mri_evidence_receipt(
            evidence_id="evidence:mri:1",
            provenance="system_log",
            recency=0.92,
            reliability=0.88,
            cross_evidence_consistency=0.81,
            subject={"continuity": 72},
        )
        self.assertEqual(cen.kind, "runtime")
        self.assertIn("cen:abc", cen.evidence_refs)
        self.assertEqual(mri.kind, "mri")
        self.assertTrue(verify_receipt_hash(mri))

    def test_store_roundtrip(self):
        store = EvidenceReceiptStore()
        receipt = create_evidence_receipt(
            claim_label="fault-recorded",
            subsystem="fault-journal",
            evidence_refs=["fault:1"],
            subject={"code": "E_TEST"},
            issued_at="2026-01-15T12:00:00Z",
        )
        stored = store.add(receipt.to_dict())
        self.assertEqual(store.get_by_id(receipt.receipt_id)["id"], receipt.receipt_id)
        self.assertEqual(store.get_latest()["id"], stored["id"])

    def test_bridges_into_organism_receipt(self):
        evidence = create_evidence_receipt(
            claim_label="runtime-ok",
            subsystem="runtime-law-spine",
            evidence_refs=["ok"],
            subject={"allowed": True},
            issued_at="2026-01-15T12:00:00Z",
        )
        organism = from_evidence_receipt(
            evidence,
            verdict="ACCEPT",
            actor_id="operator",
            action="admit",
        )
        self.assertTrue(verify_receipt_id(organism))
        self.assertEqual(organism["organ"]["dialect"], "lirl")
        self.assertEqual(organism["evidence"]["claim_label"], "runtime-ok")


class TestInvariantRegistry(unittest.TestCase):
    def test_canonical_seed(self):
        registry = create_invariant_registry()
        self.assertEqual(len(registry.list()), len(CANONICAL_INVARIANTS))
        self.assertEqual(registry.get("INV-021").severity, "critical")

    def test_threshold_evaluation(self):
        registry = create_invariant_registry()
        inv = registry.get("INV-007")
        ok = evaluate_threshold_invariant(inv, {"continuity": 80})
        bad = evaluate_threshold_invariant(inv, {"continuity": 10})
        self.assertTrue(ok.passed)
        self.assertFalse(bad.passed)

    def test_idsl_compile(self):
        evaluate = compile_invariant_dsl(
            "WHEN continuity < 40 THEN DENY IF VIOLATED THEN DENY"
        )
        passed = evaluate({"continuity": 80, "governance": 90, "memory": 90, "coordination": 90, "confidence": 90})
        failed = evaluate({"continuity": 10, "governance": 90, "memory": 90, "coordination": 90, "confidence": 90})
        self.assertTrue(passed.passed)
        self.assertFalse(failed.passed)
        self.assertEqual(failed.action, "DENY")


if __name__ == "__main__":
    unittest.main()
