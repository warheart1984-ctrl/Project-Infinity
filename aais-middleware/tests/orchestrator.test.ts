import assert from "node:assert/strict";
import test from "node:test";
import { runRequest } from "../src/orchestrator/task_orchestrator.js";

test("runRequest mixed intent fills replay trace — no silent reroute", () => {
  const result = runRequest({
    intent: "Plan my week, write the email, generate the image",
    context: { user: "operator" },
    policy: { riskLevel: "normal" },
    forceDemo: true,
  });
  assert.ok(result.requestId);
  assert.ok(result.traceId);
  assert.ok(result.trace.events.length > 0);
  assert.ok(result.trace.evidence.length > 0);
  assert.ok(result.trace.decisionEvents.length > 0);
  assert.equal(result.intent.type, "mixed");
  for (const ev of result.trace.decisionEvents) {
    assert.ok(!String(ev.event ?? "").toLowerCase().includes("silent"));
  }
  assert.ok(
    result.reasonCodes.some((c) => c.includes("IMAGE") || c.includes("DEMO") || c.includes("RULE")),
  );
});

test("runRequest high-risk code denies gpt_tools without substitute", () => {
  const result = runRequest({
    intent: { raw: "code a dangerous workflow", type: "skill", tags: ["code", "skill"] },
    context: { user: "op" },
    policy: { riskLevel: "high" },
    skills: [{ id: "s1", action: "code", target: "exploit" }],
    forceDemo: true,
  });
  assert.ok(result.policy.blockedProviders.includes("gpt_tools"));
  const gptEvents = result.trace.events.filter((e) => e.provider === "gpt_tools");
  assert.ok(gptEvents.length >= 1);
  assert.ok(gptEvents.every((e) => e.error));
  // No silent swap to claude for the blocked gpt call
  assert.ok(!result.trace.decisionEvents.some((e) => String(e.event).includes("silent")));
});
