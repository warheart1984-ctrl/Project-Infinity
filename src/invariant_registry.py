"""Invariant registry — cherry-pick of aaes-os/invariant-registry.

Mythic: Law Gate Registry
Engineering: InvariantRegistryLayer

Ports CANONICAL_INVARIANTS + IDSL expression evaluation without pulling the
full TypeScript constitutional-enforcement-node package.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Callable, Literal

Severity = Literal["low", "medium", "high", "critical"]
AuthorityToken = Literal["VT", "FT", "MRT", "RT"]
EnforcementAction = Literal["ALLOW", "DENY", "FREEZE", "MANDATORY_REVIEW"]
Dimension = Literal["continuity", "governance", "memory", "coordination", "confidence"]

DIMENSIONS: tuple[Dimension, ...] = (
    "continuity",
    "governance",
    "memory",
    "coordination",
    "confidence",
)

INVARIANT_REGISTRY_VERSION = "invariant_registry.v1"


@dataclass(frozen=True, slots=True)
class InvariantDefinition:
    id: str
    name: str
    measured_dimensions: tuple[Dimension, ...]
    threshold: float
    expression: str
    severity: Severity
    subsystem: str = "constitutional-enforcement-node"
    required_authority_token: AuthorityToken | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "measuredDimensions": list(self.measured_dimensions),
            "threshold": self.threshold,
            "expression": self.expression,
            "requiredAuthorityToken": self.required_authority_token,
            "receiptMetadata": {
                "subsystem": self.subsystem,
                "severity": self.severity,
            },
        }


@dataclass(frozen=True, slots=True)
class InvariantEvaluation:
    invariant_id: str
    passed: bool
    action: EnforcementAction
    message: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "invariantId": self.invariant_id,
            "passed": self.passed,
            "action": self.action,
            "message": self.message,
        }


def _canonical(
    invariant_id: str,
    name: str,
    measured: tuple[Dimension, ...],
    threshold: float,
    expression: str,
    severity: Severity,
    token: AuthorityToken | None = None,
) -> InvariantDefinition:
    return InvariantDefinition(
        id=invariant_id,
        name=name,
        measured_dimensions=measured,
        threshold=threshold,
        expression=expression,
        severity=severity,
        required_authority_token=token,
    )


CANONICAL_INVARIANTS: tuple[InvariantDefinition, ...] = (
    _canonical("INV-007", "Resource Floor", ("continuity",), 50, "continuity >= 50", "high"),
    _canonical("INV-014", "Temporal Regularity", ("coordination",), 55, "coordination >= 55", "medium"),
    _canonical("INV-021", "Identity Boundary", ("memory",), 60, "memory >= 60", "critical", "VT"),
    _canonical("INV-003", "Governance Drift", ("governance",), 70, "governance >= 70", "high"),
    _canonical("INV-031", "Coordination Floor", ("coordination",), 60, "coordination >= 60", "high"),
    _canonical("INV-041", "Confidence Floor", ("confidence",), 70, "confidence >= 70", "medium"),
)


class InvariantRegistry:
    """Mutable registry keyed by invariant id."""

    def __init__(self, seed: list[InvariantDefinition] | None = None) -> None:
        self._items: dict[str, InvariantDefinition] = {}
        for item in seed or []:
            self.register(item)

    def register(self, definition: InvariantDefinition) -> InvariantDefinition:
        self._items[definition.id] = definition
        return definition

    def get(self, invariant_id: str) -> InvariantDefinition:
        if invariant_id not in self._items:
            raise KeyError(f"invariant not found: {invariant_id}")
        return self._items[invariant_id]

    def list(self) -> list[InvariantDefinition]:
        return [self._items[key] for key in sorted(self._items)]

    def evaluate_all(self, dimensions: dict[str, float]) -> list[InvariantEvaluation]:
        results: list[InvariantEvaluation] = []
        for definition in self.list():
            results.append(evaluate_threshold_invariant(definition, dimensions))
        return results


def create_invariant_registry(
    seed: list[InvariantDefinition] | None = None,
    *,
    include_canonical: bool = True,
) -> InvariantRegistry:
    items = list(CANONICAL_INVARIANTS) if include_canonical else []
    if seed:
        items.extend(seed)
    return InvariantRegistry(items)


def evaluate_threshold_invariant(
    definition: InvariantDefinition,
    dimensions: dict[str, float],
) -> InvariantEvaluation:
    """Evaluate simple `dimension >= threshold` canonical expressions."""
    match = re.fullmatch(
        r"(continuity|governance|memory|coordination|confidence)\s*(>=|<=|==|>|<)\s*(-?\d+(?:\.\d+)?)",
        definition.expression.strip(),
        flags=re.I,
    )
    if not match:
        return InvariantEvaluation(
            invariant_id=definition.id,
            passed=False,
            action="DENY",
            message=f"unsupported expression: {definition.expression}",
        )
    dimension = match.group(1).lower()
    operator = match.group(2)
    threshold = float(match.group(3))
    value = float(dimensions.get(dimension, 0.0))
    passed = _compare(value, operator, threshold)
    return InvariantEvaluation(
        invariant_id=definition.id,
        passed=passed,
        action="ALLOW" if passed else "DENY",
        message="threshold satisfied" if passed else f"{dimension} {operator} {threshold} failed ({value})",
    )


def compile_invariant_dsl(source: str) -> Callable[[dict[str, float]], InvariantEvaluation]:
    """Compile IDSL: WHEN <expr> THEN <ACTION> IF VIOLATED THEN DENY."""
    normalized = re.sub(r"\s+", " ", source.strip())
    match = re.fullmatch(
        r"WHEN (.+) THEN (ALLOW|DENY|FREEZE|MANDATORY_REVIEW) IF VIOLATED THEN DENY",
        normalized,
        flags=re.I,
    )
    if not match:
        raise ValueError(f"unsupported IDSL syntax: {source}")
    expression = match.group(1)
    action = match.group(2).upper()  # type: ignore[assignment]
    if not re.fullmatch(
        r"(continuity|governance|memory|coordination|confidence|\d|\s|[<>=.!()ANDORNOT-])+",
        expression,
        flags=re.I,
    ):
        raise ValueError(f"unsupported IDSL syntax: {source}")
    invariant_id = f"idsl:{_hash_label(expression)}:{action.lower()}"

    def _evaluate(dimensions: dict[str, float]) -> InvariantEvaluation:
        violated = _evaluate_expression(expression, dimensions)
        return InvariantEvaluation(
            invariant_id=invariant_id,
            passed=not violated,
            action="ALLOW" if not violated else action,  # type: ignore[arg-type]
            message=(
                "IDSL condition satisfied"
                if not violated
                else f"IDSL condition violated: {expression}"
            ),
        )

    return _evaluate


def _hash_label(value: str) -> str:
    cleaned = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return cleaned[:48]


def _evaluate_expression(expression: str, dimensions: dict[str, float]) -> bool:
    or_parts = re.split(r"\s+OR\s+", expression, flags=re.I)
    return any(
        all(_evaluate_clause(part.strip(), dimensions) for part in re.split(r"\s+AND\s+", or_part, flags=re.I))
        for or_part in or_parts
    )


def _evaluate_clause(clause: str, dimensions: dict[str, float]) -> bool:
    negated = bool(re.match(r"^NOT\s+", clause, flags=re.I))
    clean = re.sub(r"^NOT\s+", "", clause, flags=re.I).replace("(", "").replace(")", "").strip()
    match = re.fullmatch(
        r"(continuity|governance|memory|coordination|confidence)\s*(<=|>=|==|<|>)\s*(-?\d+(?:\.\d+)?)",
        clean,
        flags=re.I,
    )
    if not match:
        raise ValueError(f"unsupported IDSL clause: {clause}")
    value = float(dimensions.get(match.group(1).lower(), 0.0))
    result = _compare(value, match.group(2), float(match.group(3)))
    return (not result) if negated else result


def _compare(value: float, operator: str, threshold: float) -> bool:
    if operator == "<":
        return value < threshold
    if operator == "<=":
        return value <= threshold
    if operator == ">":
        return value > threshold
    if operator == ">=":
        return value >= threshold
    if operator == "==":
        return value == threshold
    raise ValueError(f"unsupported operator: {operator}")
