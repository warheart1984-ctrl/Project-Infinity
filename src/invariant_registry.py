"""Invariant registry — cherry-pick of aaes-os/invariant-registry.

Mythic: Law Gate Registry
Engineering: InvariantRegistryLayer

Ports CANONICAL_INVARIANTS + IDSL-1 compiler (WHEN…THEN… and legacy
`require <dim> >= <floor>`) without the full TypeScript CEN package.

Baseline checkpoint with evidence receipts: commit b9852d7.
IDSL-1 resolution: payload dimension values override context.mriSnapshot.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Literal

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


@dataclass(frozen=True, slots=True)
class CompiledInvariant:
    """TS-shaped compiled invariant: .invariant_id + .evaluate(transition)."""

    invariant_id: str
    expression: str
    action: EnforcementAction
    mode: Literal["idsl", "require"]

    def evaluate(self, transition: dict[str, Any] | None = None) -> InvariantEvaluation:
        dimensions = _resolve_dimensions(transition or {})
        if self.mode == "require":
            violated = not _evaluate_expression(self.expression, dimensions)
        else:
            violated = _evaluate_expression(self.expression, dimensions)
        return InvariantEvaluation(
            invariant_id=self.invariant_id,
            passed=not violated,
            action="ALLOW" if not violated else self.action,
            message=(
                "IDSL condition satisfied"
                if not violated
                else f"IDSL condition violated: {self.expression}"
            ),
        )

    def __call__(self, transition: dict[str, Any] | None = None) -> InvariantEvaluation:
        return self.evaluate(transition)


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
        return [evaluate_threshold_invariant(item, dimensions) for item in self.list()]


def create_invariant_registry(
    seed: list[InvariantDefinition] | None = None,
    *,
    include_canonical: bool = True,
) -> InvariantRegistry:
    # Matching TS createInvariantRegistry(seed): empty seed → empty map unless we
    # explicitly ask for canonical defaults (Python convenience).
    if seed is not None:
        return InvariantRegistry(list(seed))
    items = list(CANONICAL_INVARIANTS) if include_canonical else []
    return InvariantRegistry(items)


def register_invariant(registry: InvariantRegistry, definition: InvariantDefinition) -> InvariantDefinition:
    return registry.register(definition)


def get_invariant(registry: InvariantRegistry, invariant_id: str) -> InvariantDefinition:
    return registry.get(invariant_id)


def evaluate_threshold_invariant(
    definition: InvariantDefinition,
    dimensions: dict[str, float],
) -> InvariantEvaluation:
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
        message=(
            "threshold satisfied"
            if passed
            else f"{dimension} {operator} {threshold} failed ({value})"
        ),
    )


def compile_invariant_dsl(source: str) -> CompiledInvariant:
    """Compile IDSL-1 or legacy `require <dim> >= <floor>` (TS-matching ids)."""
    normalized = re.sub(r"\s+", " ", source.strip())

    require = re.fullmatch(
        r"require\s+(continuity|governance|memory|coordination|confidence)\s*>=\s*(-?\d+(?:\.\d+)?)",
        normalized,
        flags=re.I,
    )
    if require:
        dimension = require.group(1).lower()
        threshold = float(require.group(2))
        threshold_label = str(int(threshold)) if threshold.is_integer() else str(threshold)
        return CompiledInvariant(
            invariant_id=f"idsl:{dimension}:min:{threshold_label}",
            expression=f"{dimension} >= {threshold_label}",
            action="DENY",
            mode="require",
        )

    match = re.fullmatch(
        r"WHEN (.+) THEN (ALLOW|DENY|FREEZE|MANDATORY_REVIEW) IF VIOLATED THEN DENY",
        normalized,
        flags=re.I,
    )
    if not match:
        raise ValueError(f"unsupported IDSL syntax: {source}")
    expression = match.group(1)
    action = match.group(2).upper()
    if not re.fullmatch(
        r"(continuity|governance|memory|coordination|confidence|\d|\s|[<>=.!()ANDORNOT-])+",
        expression,
        flags=re.I,
    ):
        raise ValueError(f"unsupported IDSL syntax: {source}")
    return CompiledInvariant(
        invariant_id=f"idsl:{_hash_label(expression)}:{action.lower()}",
        expression=expression,
        action=action,  # type: ignore[arg-type]
        mode="idsl",
    )


def _resolve_dimensions(transition: dict[str, Any]) -> dict[str, float]:
    """Payload overrides MRI snapshot (TS readDimension)."""
    context = transition.get("context") if isinstance(transition.get("context"), dict) else {}
    snapshot = context.get("mriSnapshot") if isinstance(context, dict) else {}
    if not isinstance(snapshot, dict):
        snapshot = {}
    payload = transition.get("payload") if isinstance(transition.get("payload"), dict) else {}
    dims: dict[str, float] = {}
    for name in DIMENSIONS:
        if isinstance(payload, dict) and isinstance(payload.get(name), (int, float)):
            dims[name] = float(payload[name])
        elif isinstance(snapshot, dict) and isinstance(snapshot.get(name), (int, float)):
            dims[name] = float(snapshot[name])
        elif isinstance(transition.get(name), (int, float)):
            dims[name] = float(transition[name])
        else:
            dims[name] = 0.0
    return dims


def _hash_label(value: str) -> str:
    cleaned = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return cleaned[:48]


def _evaluate_expression(expression: str, dimensions: dict[str, float]) -> bool:
    or_parts = re.split(r"\s+OR\s+", expression, flags=re.I)
    return any(
        all(
            _evaluate_clause(part.strip(), dimensions)
            for part in re.split(r"\s+AND\s+", or_part, flags=re.I)
        )
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
