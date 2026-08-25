# AAES Evidence Receipt Protocol (`evidence_receipt.v1`)

Status: **normative for Python port at commit `b9852d7`**  
Engineering: `EvidenceReceiptAdapter` (`src/aaes_evidence_receipts.py`)  
Upstream: `@aaes-os/evidence-receipts` (TypeScript)  
Shim: `src/evidence_receipts.py` re-exports the adapter

## Identity material

Receipt ids are deterministic:

```text
evidence: = sha3-256( claimLabel | subsystem | evidenceRefsJoined | subjectHash )
subjectHash = sha3-256( stable_stringify(subject) )
```

`stable_stringify`:

- objects: keys sorted lexicographically, then each `JSON.stringify(key):stable_stringify(value)`
- arrays: order-preserving
- scalars: `JSON.stringify` (UTF-8)

This must match the TypeScript implementation byte-for-byte for the same subject tree.

## Canonicalization rule (non-negotiable for v1)

**Subject object keys are hashed as given.**  
`camelCase` and `snake_case` spellings of the “same” logical field are **distinct hash inputs**.

| Subject A | Subject B | Same logical CEN? | Same `receiptId` under v1? |
|-----------|-----------|-------------------|----------------------------|
| `{ "receiptId": "…" }` | `{ "receipt_id": "…" }` | yes (operator intent) | **no** |

This is **not** a bug and **not** a cleanup candidate. It is part of the effective receipt protocol for `evidence_receipt.v1`, faithful to the TypeScript source.

### Versioning implication

Any change that normalizes key case (or otherwise remaps subject keys before hashing) is a **versioned protocol change** (e.g. `evidence_receipt.v2`), not a silent fix. Callers and cross-runtime replays must pin the version they seal under.

Helper APIs (`create_cen_evidence_receipt`, `create_mri_evidence_receipt`) may *accept* camelCase or snake_case kwargs for ergonomics; when they seal, they emit a fixed subject key shape (CEN uses camelCase fields). Direct `create_evidence_receipt(..., subject=…)` hashes whatever keys the caller supplies.

## Golden anchors (Node-generated)

Pinned in `src/aaes_evidence_receipts.py` and asserted by tests:

| Fixture | Constant |
|---------|----------|
| trust-root | `GOLDEN_TRUST_ROOT_RECEIPT_ID` |
| CEN deny | `GOLDEN_CEN_RECEIPT_ID` |
| MRI provenance | `GOLDEN_MRI_RECEIPT_ID` |

Checkpoint commit for identity/invariant baselines: **`b9852d7`**. If downstream identity breaks, compare against that commit before blaming later integration.

## Related invariant registry note

`src/invariant_registry.py` (IDSL-1): payload dimension values override `context.mriSnapshot` when both are present. Conflicting snapshot/payload pairs are intentional resolution semantics, not ambiguity.

## Adversarial conformance (next)

Against this exact protocol/commit, prioritize:

- malformed receipts
- single-byte mutation of claim/refs/subject
- reordered object keys (must still match after sort)
- unknown invariant ids
- authority-token mismatch (`INV-021` / `VT`)
- conflicting snapshot vs payload dimensions
- cross-runtime replay (Python ↔ Node) under `evidence_receipt.v1`
