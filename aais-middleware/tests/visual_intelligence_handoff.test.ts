import assert from "node:assert/strict";
import test from "node:test";
import {
  VISUAL_CREATION_COMPLETE_TOKEN,
  parseVisualIntelligenceHandoff,
} from "../src/intent_bus/visual_intelligence_handoff.js";
import { normalizeRequest } from "../src/intent_bus/intent_normalizer.js";
import { runRequest } from "../src/orchestrator/task_orchestrator.js";

test("parseVisualIntelligenceHandoff detects suffix token case-insensitively", () => {
  const body = "A serene lighthouse at dusk with golden light";
  const raw = `${body} ${VISUAL_CREATION_COMPLETE_TOKEN.toUpperCase()}`;
  const result = parseVisualIntelligenceHandoff(raw);
  assert.equal(result.matched, true);
  assert.equal(result.body, body);
  assert.equal(result.intent?.type, "picture");
  assert.deepEqual(result.intent?.tags, ["visual_intelligence", "authorized"]);
  assert.equal(result.pictures?.length, 1);
  assert.equal(result.pictures?.[0]?.action, "make_picture");
  assert.equal(result.pictures?.[0]?.target, body);
  assert.ok(!result.body.includes("perfection"));
});

test("parseVisualIntelligenceHandoff rejects token-only and non-suffix", () => {
  assert.equal(parseVisualIntelligenceHandoff(VISUAL_CREATION_COMPLETE_TOKEN).matched, false);
  assert.equal(
    parseVisualIntelligenceHandoff(`${VISUAL_CREATION_COMPLETE_TOKEN} extra`).matched,
    false,
  );
  assert.equal(parseVisualIntelligenceHandoff("draw a cat").matched, false);
});

test("normalizeRequest strips token and shapes picture intent", () => {
  const body = "Mandala with cobalt spirals";
  const req = normalizeRequest({
    text: `${body} ${VISUAL_CREATION_COMPLETE_TOKEN}`,
    forceDemo: true,
  });
  assert.equal(req.intent.type, "picture");
  assert.equal(req.intent.raw, body);
  assert.ok(req.intent.tags?.includes("visual_intelligence"));
  assert.ok(req.intent.tags?.includes("authorized"));
  assert.equal(req.pictures?.length, 1);
  assert.equal(req.pictures?.[0]?.action, "make_picture");
  assert.equal(req.pictures?.[0]?.target, body);
  assert.ok(!req.intent.raw.includes("perfection"));
});

test("runRequest dispatches visual intelligence handoff to image_gen lane", async () => {
  const body = "Storyboard frame: hero on cliff";
  const result = await runRequest({
    text: `${body} ${VISUAL_CREATION_COMPLETE_TOKEN}`,
    forceDemo: true,
  });
  assert.equal(result.intent.type, "picture");
  assert.ok(
    Array.isArray(result.intent.tags) &&
      result.intent.tags.includes("visual_intelligence"),
  );
  assert.ok(
    (result.trace.decisionEvents || []).some(
      (e) => e.event === "visual_intelligence_handoff",
    ),
  );
  assert.ok(result.trace.events.some((e) => e.provider === "image_gen"));
  assert.ok(result.ok);
});
