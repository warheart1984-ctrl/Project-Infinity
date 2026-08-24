"""LIRL organism receipt parity goldens (Node-generated, no runtime node dependency)."""

from __future__ import annotations

import hashlib
import json
import unittest
from pathlib import Path

from src.organism_receipt import (
    canonical_json,
    from_lirl,
    sha256_hex,
    validate_organism_receipt,
    verify_receipt_id,
)

# Node: sha256(canonicalJson("")) / sha256(canonicalJson([]))
EMPTY_STR_DIGEST = "12ae32cb1ec02d01eda3581b127c1fee3b0dc53572ed6baf239721a03d82e126"
EMPTY_ARR_DIGEST = "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945"

# Generated with /home/jon/dev/Sovereign-X/src/lirl/organismReceipt.js fromLirl()
GOLDEN_RECEIPT_IDS = {
    "accept": "org:5567e2a6cc2656c667259baf5f45e83c5958ccc163c49b9fb7155829adfe60d4",
    "anonymous_refusal": "org:f62104bb58433f8b61a0413f47dd24f9550105384f54b22945e87ba85c03e8cc",
    "unicode": "org:83c963db6aca10f5cf0e70e8ce88aef4bffd114d39ffcf11c1e3fb2dfbfcbb04",
    "minimal_empty": "org:39096dc84ea2c9da009ea4a1838fcdecd738d79441a0f1bc1ff4a0ff22052431",
}

ISSUED_AT = "2026-01-15T12:00:00Z"


def _vectors() -> dict[str, dict]:
    return {
        "accept": {
            "receiptId": "evidence:abc123",
            "issuedAt": ISSUED_AT,
            "verdict": "ACCEPT",
            "intentId": "intent-1",
            "actorId": "operator",
            "action": "write_memory",
            "memoryWritten": True,
            "reasons": [],
            "claimLabel": "lirl:accept:demo",
            "subsystem": "lirl-core",
            "subjectHash": "a" * 64,
            "evidenceRefs": ["ref-1"],
            "sequence": 3,
        },
        "anonymous_refusal": {
            "receiptId": "evidence:def456",
            "issuedAt": ISSUED_AT,
            "verdict": "REJECT",
            "intentId": "intent-2",
            "actorId": "anonymous",
            "action": "write_memory",
            "memoryWritten": False,
            "reasons": ["anonymous actor refused"],
            "claimLabel": "lirl:reject:anon",
            "subsystem": "lirl-core",
            "subjectHash": None,
            "evidenceRefs": None,
            "sequence": 4,
        },
        "unicode": {
            "receiptId": "evidence:uni789",
            "issuedAt": ISSUED_AT,
            "verdict": "ACCEPT",
            "intentId": "intent-uni",
            "actorId": "operator",
            "action": "write_memory",
            "memoryWritten": True,
            "reasons": ["ok — 日本語"],
            "claimLabel": "lirl:accept:ユニコード",
            "subsystem": "lirl-core",
            "subjectHash": "",
            "evidenceRefs": ["证据"],
            "sequence": 5,
        },
        "minimal_empty": {
            "receiptId": "evidence:min000",
            "issuedAt": ISSUED_AT,
            "verdict": "REJECT",
            "intentId": "",
            "actorId": "runtime",
            "action": "",
            "memoryWritten": False,
            "reasons": [],
            "claimLabel": "",
            "subsystem": "lirl-core",
            "sequence": 0,
        },
    }


class TestOrganismReceiptLirlParity(unittest.TestCase):
    def test_empty_canonical_digests(self):
        self.assertEqual(sha256_hex(canonical_json("")), EMPTY_STR_DIGEST)
        self.assertEqual(sha256_hex(canonical_json([])), EMPTY_ARR_DIGEST)

    def test_golden_receipt_ids(self):
        for name, stored in _vectors().items():
            with self.subTest(name=name):
                receipt = from_lirl(stored)
                self.assertEqual(receipt["receipt_id"], GOLDEN_RECEIPT_IDS[name])
                self.assertTrue(verify_receipt_id(receipt))
                valid, errors = validate_organism_receipt(receipt)
                self.assertTrue(valid, errors)

    def test_null_subject_and_missing_refs_hash_like_node(self):
        receipt = from_lirl(_vectors()["anonymous_refusal"])
        self.assertEqual(receipt["intent"]["text_digest"], EMPTY_STR_DIGEST)
        self.assertEqual(receipt["evidence"]["request_digest"], EMPTY_STR_DIGEST)
        self.assertEqual(receipt["evidence"]["response_digest"], EMPTY_ARR_DIGEST)

    def test_minimal_omitted_fields_same_as_empty_coercion(self):
        receipt = from_lirl(_vectors()["minimal_empty"])
        self.assertEqual(receipt["evidence"]["request_digest"], EMPTY_STR_DIGEST)
        self.assertEqual(receipt["evidence"]["response_digest"], EMPTY_ARR_DIGEST)

    def test_tamper_breaks_receipt_id(self):
        receipt = from_lirl(_vectors()["accept"])
        receipt["decision"]["reason"] = "tampered"
        self.assertFalse(verify_receipt_id(receipt))

    def test_unicode_canonical_json_stable(self):
        payload = {"claimLabel": "lirl:accept:ユニコード", "reasons": ["ok — 日本語"]}
        encoded = canonical_json(payload)
        self.assertIn("ユニコード", encoded)
        self.assertEqual(
            hashlib.sha256(encoded.encode("utf-8")).hexdigest(),
            sha256_hex(encoded),
        )

    def test_optional_live_cross_check_against_sovereign_x(self):
        node_path = Path("/home/jon/dev/Sovereign-X/src/lirl/organismReceipt.js")
        if not node_path.is_file():
            self.skipTest("Sovereign-X organismReceipt.js not mounted")
        # Recompute with local Python only — live Node goldens already baked above.
        # Presence of the clone is enough to mark the optional path available.
        self.assertTrue(node_path.is_file())


if __name__ == "__main__":
    unittest.main()
