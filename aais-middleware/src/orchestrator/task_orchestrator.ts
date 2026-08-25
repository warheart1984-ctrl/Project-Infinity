/**
 * Mythic: Constitutional Task Bus ingress
 * Engineering: runRequest — Intent → Evidence → Authority → Decision
 */
import { normalizeRequest } from "../intent_bus/intent_normalizer.js";
import type { AdapterResult, TaskSkillsRequest } from "../intent_bus/interfaces.js";
import {
  authorityDecisionEvent,
  buildAuthorityChain,
} from "../policy_core/authority_chain.js";
import { evaluatePolicy } from "../policy_core/policy_engine.js";
import { deriveRiskLevel, riskProfileSnapshot } from "../policy_core/risk_profile.js";
import { EventLogger } from "../trace_store/event_logger.js";
import { EvidenceStore } from "../trace_store/evidence_store.js";
import type { OrchestratorResult } from "../trace_store/interfaces.js";
import { LineageTracker } from "../trace_store/lineage_tracker.js";
import { ReplayEngine } from "../trace_store/replay_engine.js";
import { NoopAdaptiveEngine, type AdaptiveEngine } from "./adaptive_engine_hook.js";
import { runImageGenLane, runMandalaLane } from "./picture_pipeline.js";
import { runClaudeWriterLane, runGptToolsLane } from "./skill_orchestrator.js";

export { runTaskLane } from "./task_lane.js";
import { runTaskLane } from "./task_lane.js";

const DEEP_LINKS = {
  imageGenerator: "/image-generator",
  adaptiveMusic: "/adaptive-music",
  workflows: "/workflows/templates",
  taskBus: "/task-bus",
  jarvis: "/jarvis",
};

function recordLane(
  events: EventLogger,
  evidence: EvidenceStore,
  lineage: LineageTracker,
  requestId: string,
  result: AdapterResult,
  input: Record<string, unknown>,
  decisionEvents: Record<string, unknown>[],
): void {
  events.log({
    requestId,
    provider: result.provider,
    lane: result.lane,
    input,
    output: result.output,
    error: result.ok ? undefined : result.justification,
  });
  evidence.seal({
    requestId,
    provider: result.provider,
    justification: result.justification,
    metadata: {
      status: result.status,
      reasonCode: result.reasonCode,
      ok: result.ok,
    },
  });
  decisionEvents.push({
    event: result.ok ? "lane_executed" : "lane_denied_or_failed",
    provider: result.provider,
    lane: result.lane,
    status: result.status,
    reasonCode: result.reasonCode,
    ok: result.ok,
  });
  lineage.record("policy", result.provider, result.reasonCode ?? "TASK_BUS_LANE");
}

/**
 * Single ingress for AAIS Middleware.
 * No silent provider reroutes — blocked lanes are recorded, never substituted.
 */
export function runRequest(
  input: unknown,
  opts?: { adaptiveEngine?: AdaptiveEngine },
): OrchestratorResult {
  const request: TaskSkillsRequest = normalizeRequest(input);
  const forceDemo = request.forceDemo !== false;
  const riskLevel = deriveRiskLevel(request);
  const policy = evaluatePolicy(request);
  const authority = buildAuthorityChain(request, riskLevel);

  const events = new EventLogger();
  const evidence = new EvidenceStore();
  const lineage = new LineageTracker();
  const decisionEvents: Record<string, unknown>[] = [];
  const reasonCodes: string[] = [];

  decisionEvents.push({
    event: "intent_classified",
    reasonCode: "TASK_BUS_INTENT_OK",
    type: request.intent.type,
    confidence: request.intent.confidence,
    tags: request.intent.tags,
  });
  evidence.seal({
    requestId: request.requestId,
    provider: "intent_bus",
    justification: `Intent classified as ${request.intent.type}`,
    metadata: { tags: request.intent.tags, confidence: request.intent.confidence },
  });

  decisionEvents.push({
    event: "policy_evaluated",
    reasonCode: "TASK_BUS_POLICY",
    matchedRuleIds: policy.matchedRuleIds,
    approvedProviders: policy.approvedProviders,
    blockedProviders: policy.blockedProviders,
    reason: policy.reason,
  });
  evidence.seal({
    requestId: request.requestId,
    provider: "policy_core",
    justification: policy.reason ?? "Policy evaluated",
    metadata: {
      matchedRuleIds: policy.matchedRuleIds,
      approvedProviders: policy.approvedProviders,
      blockedProviders: policy.blockedProviders,
    },
  });
  reasonCodes.push(...policy.matchedRuleIds.map((id) => `RULE:${id}`));

  decisionEvents.push(
    authorityDecisionEvent(authority, policy.approvedProviders, policy.blockedProviders),
  );

  const approved = new Set(policy.approvedProviders);
  const lanePlan = [
    ...policy.approvedProviders.map((p) => ({
      provider: p,
      allowed: true,
      reasonCode: "TASK_BUS_LANE_ALLOWED",
    })),
    ...policy.blockedProviders.map((p) => ({
      provider: p,
      allowed: false,
      reasonCode: "TASK_BUS_LANE_DENIED",
    })),
  ];

  const outputs: OrchestratorResult["outputs"] = {
    tasks: [],
    skills: [],
    pictures: [],
  };
  const laneResults: string[] = [];

  // ms_tasks
  if (request.tasks?.length || approved.has("ms_tasks") || policy.blockedProviders.includes("ms_tasks")) {
    const result = runTaskLane(request.tasks ?? [], {
      approved: approved.has("ms_tasks"),
      forceDemo,
      token: process.env.AAIS_MS_GRAPH_TOKEN || process.env.MICROSOFT_GRAPH_TOKEN,
    });
    recordLane(events, evidence, lineage, request.requestId, result, { tasks: request.tasks }, decisionEvents);
    reasonCodes.push(result.reasonCode ?? result.status);
    if (result.ok && result.output?.tasks) {
      outputs.tasks = result.output.tasks as Record<string, unknown>[];
      laneResults.push("ms_tasks");
    }
  }

  // gpt_tools
  if (request.skills?.length || approved.has("gpt_tools") || policy.blockedProviders.includes("gpt_tools")) {
    const result = runGptToolsLane(request.skills ?? [], {
      approved: approved.has("gpt_tools"),
      forceDemo,
      apiKey: process.env.OPENAI_API_KEY,
    });
    recordLane(events, evidence, lineage, request.requestId, result, { skills: request.skills }, decisionEvents);
    reasonCodes.push(result.reasonCode ?? result.status);
    if (result.ok && result.output?.skills) {
      outputs.skills = [
        ...(outputs.skills ?? []),
        ...(result.output.skills as Record<string, unknown>[]),
      ];
      laneResults.push("gpt_tools");
    }
  }

  // claude_writer
  if (
    request.skills?.length ||
    approved.has("claude_writer") ||
    policy.blockedProviders.includes("claude_writer")
  ) {
    const result = runClaudeWriterLane(request.skills ?? [], {
      approved: approved.has("claude_writer"),
      forceDemo,
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
    recordLane(events, evidence, lineage, request.requestId, result, { skills: request.skills }, decisionEvents);
    reasonCodes.push(result.reasonCode ?? result.status);
    if (result.ok && result.output?.drafts) {
      outputs.skills = [
        ...(outputs.skills ?? []),
        ...(result.output.drafts as Record<string, unknown>[]),
      ];
      laneResults.push("claude_writer");
    }
  }

  // image_gen + mandala
  const wantPictures =
    (request.pictures?.length ?? 0) > 0 ||
    approved.has("image_gen") ||
    approved.has("mandala") ||
    policy.blockedProviders.includes("image_gen");

  if (wantPictures) {
    const img = runImageGenLane(request.pictures ?? [], {
      approved: approved.has("image_gen"),
      forceDemo,
    });
    recordLane(events, evidence, lineage, request.requestId, img, { pictures: request.pictures }, decisionEvents);
    reasonCodes.push(img.reasonCode ?? img.status);
    if (img.ok) {
      outputs.pictures = [
        ...(outputs.pictures ?? []),
        ...((img.output?.pictures as Record<string, unknown>[]) ?? [img.output as Record<string, unknown>]),
      ];
      laneResults.push("image_gen");
    }

    const mandala = runMandalaLane(request.pictures ?? [], {
      approved: approved.has("mandala"),
      forceDemo,
    });
    recordLane(
      events,
      evidence,
      lineage,
      request.requestId,
      mandala,
      { pictures: request.pictures },
      decisionEvents,
    );
    reasonCodes.push(mandala.reasonCode ?? mandala.status);
    if (mandala.ok) laneResults.push("mandala");
  }

  const adaptive = (opts?.adaptiveEngine ?? new NoopAdaptiveEngine()).propose({
    intentType: request.intent.type,
    tags: request.intent.tags ?? [],
    laneResults,
  });

  const replay = new ReplayEngine().build(
    request.requestId,
    events.all(),
    evidence.all(),
    decisionEvents,
  );

  const anyOk = laneResults.length > 0;
  const onlyDenials =
    events.all().length > 0 && events.all().every((e) => Boolean(e.error));

  return {
    ok: anyOk && !onlyDenials,
    requestId: request.requestId,
    traceId: replay.traceId,
    intent: {
      raw: request.intent.raw,
      type: request.intent.type,
      confidence: request.intent.confidence,
      tags: request.intent.tags,
    },
    policy: {
      ...policy,
      risk: riskProfileSnapshot(request),
    },
    authority,
    lanePlan,
    outputs,
    trace: replay,
    reasonCodes: [...new Set(reasonCodes)],
    adaptive,
    deepLinks: {
      ...DEEP_LINKS,
      temporalReplay: new ReplayEngine().temporalReplayPath(replay),
    },
  };
}

export function catalogStatus(): Record<string, unknown> {
  return {
    bus: "AAIS Middleware",
    package: "aais-middleware",
    doctrine: "Intent → Evidence → Authority → Decision",
    lanes: [
      { provider: "ms_tasks", label: "Microsoft Tasks", authEnv: "AAIS_MS_GRAPH_TOKEN" },
      { provider: "gpt_tools", label: "ChatGPT Skills", authEnv: "OPENAI_API_KEY" },
      { provider: "claude_writer", label: "Claude Skills", authEnv: "ANTHROPIC_API_KEY" },
      { provider: "image_gen", label: "Picture Engine", authEnv: null, imagePath: "/api/image/generate" },
      { provider: "mandala", label: "Mandala Hook", authEnv: null },
    ],
    notClaimed: [
      "Full Microsoft 365 / Graph OAuth UX",
      "ChatGPT skill store parity",
      "Claude Computer Use",
      "Silent cross-provider fallback",
    ],
  };
}
