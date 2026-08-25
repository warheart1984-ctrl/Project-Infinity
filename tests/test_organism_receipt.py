"""Tests for organism_receipt.v1 — the unified AI Organism receipt."""

import unittest

from src.organism_receipt import (
    canonical_json,
    from_amul,
    from_lirl,
    sha256_hex,
    validate_organism_receipt,
    verify_receipt_id,
)


def _lirl_stored(verdict: str = "ACCEPT", **overrides) -> dict:
    base = {
        "receiptId": "evidence:fd794caedeadbeef",
        "issuedAt": "2026-08-23T12:00:00Z",
        "verdict": verdict,
        "intentId": "intent-1",
        "actorId": "operator",
        "action": "memory.write",
        "memoryWritten": True,
        "reasons": ["actor lawful", "action in allowlist"],
        "claimLabel": f"lirl:{verdict.lower()}:memory.write",
        "subsystem": "lirl-vertical-slice",
        "subjectHash": "a" * 64,
        "evidenceRefs": ["intent-1", "run-1", "span-1"],
    }
    base.update(overrides)
    return base


class TestCanonicalForm(unittest.TestCase):
    def test_sorted_keys_no_whitespace(self):
        self.assertEqual(canonical_json({"b": 1, "a": 2}), '{"a":2,"b":1}')

    def test_nested_and_arrays(self):
        self.assertEqual(canonical_json({"z": [1, {"k": "v"}]}), '{"z":[1,{"k":"v"}]}')

    def test_sha256_known_vector(self):
        self.assertEqual(sha256_hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")


class TestLirlDialect(unittest.TestCase):
    def test_accept_receipt_is_valid_and_tamper_evident(self):
        receipt = from_lirl(_lirl_stored())
        valid, errors = validate_organism_receipt(receipt)
        self.assertTrue(valid, errors)
        self.assertEqual(receipt["decision"]["outcome"], "accept")
        self.assertTrue(receipt["effect"]["performed"])
        self.assertTrue(verify_receipt_id(receipt))
        receipt["effect"]["performed"] = False
        self.assertFalse(verify_receipt_id(receipt))

    def test_refusal_is_first_class_receipt(self):
        receipt = from_lirl(
            _lirl_stored(
                verdict="REJECT",
                actorId="anonymous",
                action="rm.rf.all",
                memoryWritten=False,
                reasons=["anonymous actor is not lawful under LIRL", "action not in allowlist"],
                claimLabel="lirl:reject:rm.rf.all",
            )
        )
        valid, errors = validate_organism_receipt(receipt)
        # Structurally complete — a refusal is still a lawful receipt.
        self.assertTrue(valid, errors)
        self.assertEqual(receipt["decision"]["outcome"], "reject")
        self.assertFalse(receipt["effect"]["performed"])
        checks = receipt["evidence"]["verification_result"]
        self.assertFalse(checks[0]["allowed"])

    def test_matches_node_adapter_canonical_id(self):
        receipt_py = from_lirl(_lirl_stored())
        py_id = receipt_py["receipt_id"]
        import subprocess, json as _json

        script = f"""
        import {{ fromLirl }} from '/media/jon/New Volume/Project Finish/Sovereign-X-Constitutional-Compute/src/lirl/organismReceipt.js';
        const stored = {_json.dumps(_lirl_stored())};
        console.log(fromLirl(stored).receipt_id);
        """
        out = subprocess.run(
            ["node", "--input-type=module", "-e", script],
            capture_output=True, text=True, timeout=60,
        )
        if out.returncode == 0 and out.stdout.strip().startswith("org:"):
            self.assertEqual(py_id, out.stdout.strip())
        else:
            self.fail(f"node adapter failed: {out.stderr[:300]}")


class TestAmulDialect(unittest.TestCase):
    def _gdp_result(self) -> dict:
        return {
            "ok": True,
            "error": None,
            "value": {"ok": True, "doubled": 42},
            "intent": {"record_id": "ir-1", "kind": "capability", "text": "double it"},
            "evidence": {
                "request_snapshot": {"args": {"value": 21}, "operator_id": "operator"},
                "response_snapshot": {"keys": ["ok"], "ok": True},
                "timing": {"started_utc": "t0", "finished_utc": "t1", "duration_ms": 3},
                "constraints_applied": {"governance_mode": "strict"},
                "verification_result": [{"check": "replay_integrity", "allowed": True, "reason": "chain intact"}],
                "annotations": {
                    "pipeline_id": "aais.governed_direct_pipeline.amul",
                    "pipeline_version": "0.1-amul",
                    "intent_record": "ir-1",
                    "governance_record": "gr-1",
                },
            },
            "replay": {
                "packet_hash": "c" * 64,
                "prev_hash": "d" * 64,
                "deterministic": True,
                "non_determinism_reason": "",
            },
            "constitutional_state": {
                "pipeline_id": "aais.governed_direct_pipeline.amul",
                "governance_record": {
                    "record_id": "gr-1",
                    "ok": True,
                    "reason": "governance approved",
                    "authority_chain": [{"check": "justification", "allowed": True, "reason": "accepted"}],
                    "validation_chain": [{"check": "contract_inputs", "allowed": True, "reason": "satisfies"}],
                },
                "csr": {
                    "pipeline_id": "aais.governed_direct_pipeline.amul",
                    "entry_count": 7,
                    "head_hash": "e" * 64,
                    "continuity_intact": True,
                },
            },
            "decision_support": {"decision": "accept", "reason": "verified end to end"},
        }

    def test_gdp_result_maps_to_valid_receipt(self):
        receipt = from_amul(self._gdp_result(), organ_name="infinity-backend")
        valid, errors = validate_organism_receipt(receipt)
        self.assertTrue(valid, errors)
        self.assertEqual(receipt["organ"]["dialect"], "amul")
        self.assertEqual(receipt["decision"]["outcome"], "accept")
        self.assertEqual(receipt["continuity"]["spine_id"], "aais.governed_direct_pipeline.amul")
        self.assertEqual(receipt["continuity"]["sequence"], 7)
        self.assertTrue(receipt["replay"]["deterministic"])
        self.assertTrue(verify_receipt_id(receipt))

    def test_escalate_outcome_preserved_for_provider_backed(self):
        result = self._gdp_result()
        result["replay"]["deterministic"] = False
        result["replay"]["non_determinism_reason"] = "provider-backed"
        result["value"]["decision_support"] = {"outcome": "escalate"}
        receipt = from_amul(result)
        valid, errors = validate_organism_receipt(receipt)
        self.assertTrue(valid, errors)
        self.assertEqual(receipt["decision"]["outcome"], "escalate")
        self.assertEqual(receipt["effect"]["adapter_kind"], "provider")


class TestValidatorLaws(unittest.TestCase):
    def test_missing_section_rejected(self):
        receipt = from_lirl(_lirl_stored())
        receipt.pop("replay")
        valid, errors = validate_organism_receipt(receipt)
        self.assertFalse(valid)
        self.assertTrue(any("replay" in e for e in errors))

    def test_unknown_dialect_rejected(self):
        receipt = from_lirl(_lirl_stored())
        receipt["organ"]["dialect"] = "carrier-pigeon"
        valid, errors = validate_organism_receipt(receipt)
        self.assertFalse(valid)
        self.assertTrue(any("dialect" in e for e in errors))


if __name__ == "__main__":
    unittest.main()
