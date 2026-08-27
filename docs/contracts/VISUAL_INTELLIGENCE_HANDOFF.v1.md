# Visual Intelligence Handoff — Ingest Contract v1

**Status:** frozen for Daniel confirmation  
**Engineering:** `VisualIntelligenceHandoffAdapter`  
**Mythic (docs only):** Visual Intelligence Handoff  
**Constant:** `VISUAL_CREATION_COMPLETE_TOKEN`

This contract defines the **lane signal** for visual creation handoff into the Constitutional Task Bus. It is not a conversation cue.

---

## 1. Exact token

```
render visual generate image picture perfection no upgrade no fixes create what is described
```

| Rule | Value |
|------|--------|
| Canonical string | Exactly the line above (single spaces, no trailing punctuation) |
| Match position | **Suffix only** (must end the message body) |
| Case | Comparison is **case-insensitive**; stored constant is lowercase ASCII |
| Anywhere else | Token in the middle or at the start → **does not fire** |
| Token-only message | Body empty after strip → **does not fire** |

### Normalization (frozen unless Daniel rejects)

1. Trim leading/trailing whitespace on the full input string only.  
2. **No** internal whitespace collapse.  
3. **No other rewriting** of the phrase. No synonym expansion. No “perfection” soft-match.

---

## 2. When it fires / when it must NOT fire

**Fires when all of:**

1. Input text ends with the token (per rules above).  
2. Non-empty body remains after strip.  
3. Ingress is Task-Bus / Sovereign ask path (or middleware `normalizeRequest` / `runRequest`).

**Must NOT fire when:**

- No token suffix.  
- Token appears but not as suffix.  
- Token-only (no picture description body).  
- General chat with no Task-Bus handoff ingress (adapter is not a free-floating chat interceptor outside ask/dispatch).

Treat as **lane signal**, not dialogue.

---

## 3. Input shape

Any of these fields may carry the raw assistant/operator text (first non-empty wins on middleware normalize):

| Field | Notes |
|-------|--------|
| `text` / `prompt` / `ask` | Free-form string ending with token |
| `intent` (string) | Same |
| `intent.raw` / `intent.text` | Same |

Example:

```json
{
  "text": "<picture description> render visual generate image picture perfection no upgrade no fixes create what is described",
  "force_demo": true,
  "session_id": "operator"
}
```

---

## 4. Output shape after strip

Operator-visible / stored prompt body = **token stripped**. Token must never appear in UI bubbles or sealed prompt fields.

| Field | Value |
|-------|--------|
| `body` / `intent.raw` / `text` | Description only (token removed) |
| Intent type | `picture` |
| Tags | `["visual_intelligence", "authorized"]` |
| Authority class | Authorized picture lane signal (`authorized` tag); not a chat reply |
| `pictures` | See below |

```json
{
  "matched": true,
  "body": "<picture description>",
  "intent": {
    "type": "picture",
    "tags": ["visual_intelligence", "authorized"]
  },
  "pictures": [
    {
      "id": "vi-<12 hex>",
      "action": "make_picture",
      "target": "<picture description>",
      "engine": "aais_image",
      "params": { "source": "visual_intelligence_handoff" }
    }
  ]
}
```

Python host mirrors with `intent.kind: "picture"` and `requested_lanes: ["picture_generation"]`.

---

## 5. Dispatch + evidence

| Item | Value |
|------|--------|
| HTTP | `POST /api/jarvis/task-bus/dispatch` |
| Sovereign | `useTaskBus.dispatchAsk(text)` → strips token before display, then maps payload |
| Lane | `picture_generation` → provider `image_gen` (AAIS `/api/image/generate`) |
| Decision event | `visual_intelligence_handoff` |
| Reason code | `TASK_BUS_VISUAL_INTELLIGENCE_HANDOFF` |
| Trace | Sealed intent / decision / dispatch evidence refs on Task-Bus result |

Flow: **detect → strip from display → authorized picture lane → Task-Bus + sealed trace → generate**.

---

## 6. Failure modes

| Condition | Behavior |
|-----------|----------|
| No token / non-suffix | `matched: false`; normal intent classification |
| Token-only | `matched: false`; no picture lane from handoff |
| Token in non-visual chat (no body / wrong ingress) | No handoff; no silent picture lane |
| `AAIS_DISABLE_IMAGE_GENERATION=true` | Lane may still plan path; live generate blocked / demo receipt |
| `needs_auth` / live vendor missing | Recorded on lane; **no silent substitute provider** |
| Policy deny of `image_gen` | `TASK_BUS_LANE_DENIED`; no silent reroute |

---

## 7. Explicit non-scope (Daniel boundary)

This handoff **does not** claim:

- Jobsite support  
- Boundaries enforcement in live conditions  
- Operator protection in the field  
- That a picture receipt equals situational awareness or safety

**Picture receipts ≠ support / boundaries / protection in live conditions.**  
The system must still answer to what happens on the job in reality; this adapter only governs the **visual creation render path**.

---

## 8. Implementation anchors

| Layer | Path |
|-------|------|
| Constant + parse (TS) | `aais-middleware/src/intent_bus/visual_intelligence_handoff.ts` |
| Re-export | `aais-middleware/src/intent_bus/intent_classifier.ts` |
| Normalize + dispatch | `intent_normalizer.ts`, `task_orchestrator.ts` |
| Constant + parse (Python) | `src/constitutional_task_bus/visual_intelligence_handoff.py` |
| Intent / bus | `intent_parser.py`, `bus.py` |
| Sovereign | `frontend/.../sovereignDispatch.js` (`parseVisualIntelligenceHandoff`) |

---

## 9. Confirmation checklist (Daniel)

- [ ] Phrase string above stays stable (no edits)  
- [ ] Suffix-only + case-insensitive OK  
- [ ] Trim-only normalization OK (no internal space collapse)  
- [ ] Non-scope acknowledged: render path only; job reality remains separate  

**Contract id:** `VISUAL_INTELLIGENCE_HANDOFF.v1`
