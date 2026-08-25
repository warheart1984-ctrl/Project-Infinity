"""Vitest-parity suite for @aaes-os/invariant-registry Python port."""

from __future__ import annotations

import unittest

from src.invariant_registry import (
    CANONICAL_INVARIANTS,
    InvariantDefinition,
    compile_invariant_dsl,
    create_invariant_registry,
    get_invariant,
    register_invariant,
)


class TestInvariantRegistry(unittest.TestCase):
    def test_registers_canonical_with_receipt_metadata(self):
        registry = create_invariant_registry(list(CANONICAL_INVARIANTS))
        invariant = get_invariant(registry, "INV-007")
        self.assertEqual(invariant.name, "Resource Floor")
        self.assertIn("continuity", invariant.measured_dimensions)
        self.assertEqual(invariant.subsystem, "constitutional-enforcement-node")
        self.assertEqual(invariant.to_dict()["receiptMetadata"]["severity"], "high")

    def test_all_six_canonical_ids(self):
        ids = {item.id for item in CANONICAL_INVARIANTS}
        self.assertEqual(
            ids,
            {"INV-003", "INV-007", "INV-014", "INV-021", "INV-031", "INV-041"},
        )

    def test_idsl_boolean_freeze_without_eval(self):
        invariant = compile_invariant_dsl(
            "WHEN governance < 70 AND confidence >= 80 THEN FREEZE IF VIOLATED THEN DENY"
        )
        failed = invariant.evaluate(
            {
                "transitionId": "idsl:freeze",
                "transitionType": "law_mutation",
                "payload": {},
                "context": {
                    "actor": "operator",
                    "mriSnapshot": {
                        "continuity": 72,
                        "governance": 68,
                        "memory": 75,
                        "coordination": 63,
                        "confidence": 81,
                    },
                },
            }
        )
        self.assertFalse(failed.passed)
        self.assertEqual(failed.action, "FREEZE")

    def test_payload_overrides_snapshot(self):
        invariant = compile_invariant_dsl(
            "WHEN governance < 70 THEN DENY IF VIOLATED THEN DENY"
        )
        # Snapshot would fail (<70), payload overrides to pass.
        result = invariant.evaluate(
            {
                "payload": {"governance": 90},
                "context": {
                    "mriSnapshot": {
                        "continuity": 0,
                        "governance": 10,
                        "memory": 0,
                        "coordination": 0,
                        "confidence": 0,
                    }
                },
            }
        )
        self.assertTrue(result.passed)

    def test_require_syntax_ts_matching_id(self):
        compiled = compile_invariant_dsl("require governance >= 70")
        self.assertEqual(compiled.invariant_id, "idsl:governance:min:70")
        ok = compiled.evaluate({"governance": 80})
        bad = compiled.evaluate({"governance": 10})
        self.assertTrue(ok.passed)
        self.assertFalse(bad.passed)

    def test_rejects_unsupported_syntax(self):
        with self.assertRaises(ValueError):
            compile_invariant_dsl("eval process.exit()")

    def test_custom_register(self):
        registry = create_invariant_registry(seed=[], include_canonical=False)
        register_invariant(
            registry,
            InvariantDefinition(
                id="INV-CUSTOM",
                name="Custom Confidence Floor",
                measured_dimensions=("confidence",),
                threshold=70,
                expression="require confidence >= 70",
                severity="medium",
                subsystem="test",
            ),
        )
        self.assertEqual(get_invariant(registry, "INV-CUSTOM").threshold, 70)

    def test_identity_boundary_requires_vt(self):
        registry = create_invariant_registry(list(CANONICAL_INVARIANTS))
        self.assertEqual(get_invariant(registry, "INV-021").required_authority_token, "VT")

    def test_default_python_registry_includes_canonical(self):
        registry = create_invariant_registry()
        self.assertEqual(len(registry.list()), 6)


if __name__ == "__main__":
    unittest.main()
