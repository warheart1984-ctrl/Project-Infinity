import type { AdapterResult, ParsedSkill } from "../intent_bus/interfaces.js";
import { ClaudeWriterAdapter } from "../provider_adapters/claude_writer_adapter.js";
import { GptToolsAdapter } from "../provider_adapters/gpt_tools_adapter.js";
import { SkillStoreRegistry } from "../provider_adapters/skill_store.js";

export function runGptToolsLane(
  skills: ParsedSkill[],
  opts: { approved: boolean; forceDemo: boolean; apiKey?: string; fetchImpl?: typeof fetch },
): AdapterResult {
  if (!opts.approved) {
    return {
      provider: "gpt_tools",
      lane: "openai_tools",
      status: "denied",
      ok: false,
      justification: "GPT tools blocked by policy — no silent Claude substitute.",
      reasonCode: "TASK_BUS_LANE_DENIED",
    };
  }
  return new GptToolsAdapter({
    forceDemo: opts.forceDemo,
    apiKey: opts.apiKey,
    fetchImpl: opts.fetchImpl,
  }).executeSkills(skills);
}

export async function runGptToolsLaneLive(
  skills: ParsedSkill[],
  opts: { approved: boolean; forceDemo: boolean; apiKey?: string; fetchImpl?: typeof fetch },
): Promise<AdapterResult> {
  if (!opts.approved) {
    return runGptToolsLane(skills, opts);
  }
  return new GptToolsAdapter({
    forceDemo: opts.forceDemo,
    apiKey: opts.apiKey,
    fetchImpl: opts.fetchImpl,
  }).executeSkillsLive(skills);
}

export function runClaudeWriterLane(
  skills: ParsedSkill[],
  opts: { approved: boolean; forceDemo: boolean; apiKey?: string; fetchImpl?: typeof fetch },
): AdapterResult {
  if (!opts.approved) {
    return {
      provider: "claude_writer",
      lane: "anthropic_writer",
      status: "denied",
      ok: false,
      justification: "Claude writer blocked by policy — no silent OpenAI substitute.",
      reasonCode: "TASK_BUS_LANE_DENIED",
    };
  }
  return new ClaudeWriterAdapter({
    forceDemo: opts.forceDemo,
    apiKey: opts.apiKey,
    fetchImpl: opts.fetchImpl,
  }).write(skills);
}

export async function runClaudeWriterLaneLive(
  skills: ParsedSkill[],
  opts: { approved: boolean; forceDemo: boolean; apiKey?: string; fetchImpl?: typeof fetch },
): Promise<AdapterResult> {
  if (!opts.approved) {
    return runClaudeWriterLane(skills, opts);
  }
  return new ClaudeWriterAdapter({
    forceDemo: opts.forceDemo,
    apiKey: opts.apiKey,
    fetchImpl: opts.fetchImpl,
  }).writeLive(skills);
}

export function listSkillStore(runtimeRoot?: string): Record<string, unknown> {
  return new SkillStoreRegistry({ runtimeRoot }).catalogStatus();
}

export function invokeSkillStore(
  skillId: string,
  args?: Record<string, unknown>,
  opts?: { operatorApproved?: boolean; runtimeRoot?: string },
): AdapterResult {
  return new SkillStoreRegistry({ runtimeRoot: opts?.runtimeRoot }).invoke({
    skillId,
    args,
    operatorApproved: opts?.operatorApproved,
  });
}
