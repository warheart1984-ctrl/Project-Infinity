/**
 * Mythic: Claude Skills Lane
 * Engineering: ClaudeWriterAdapter — live Messages tool loop when key present
 */
import type { AdapterResult, ParsedSkill } from "../intent_bus/interfaces.js";

export interface ClaudeWriterConfig {
  apiKey?: string;
  forceDemo?: boolean;
  fetchImpl?: typeof fetch;
  model?: string;
  maxToolRounds?: number;
}

export type ClaudeToolHandler = (
  name: string,
  args: Record<string, unknown>,
) => Promise<unknown> | unknown;

const CLAUDE_TOOLS = [
  {
    name: "aais_draft_outline",
    description: "Produce a governed writing outline",
    input_schema: {
      type: "object",
      properties: {
        target: { type: "string" },
        style: { type: "string" },
      },
      required: ["target"],
    },
  },
  {
    name: "aais_list_skills",
    description: "List governed AAIS writer skills",
    input_schema: { type: "object", properties: {} },
  },
];

function defaultClaudeTool(name: string, args: Record<string, unknown>): unknown {
  if (name === "aais_list_skills") {
    return { skills: [{ id: "longform_writer", label: "Longform Writer" }] };
  }
  return {
    outline: ["intent", "constraints", "draft"],
    target: args.target,
    style: args.style || "governed",
  };
}

export class ClaudeWriterAdapter {
  constructor(private readonly config: ClaudeWriterConfig = {}) {}

  write(skills: ParsedSkill[]): AdapterResult {
    const demo = this.config.forceDemo !== false || !this.config.apiKey;
    if (!demo && !this.config.apiKey) {
      return {
        provider: "claude_writer",
        lane: "anthropic_writer",
        status: "needs_auth",
        ok: false,
        justification: "Set ANTHROPIC_API_KEY for live Claude writing.",
        reasonCode: "TASK_BUS_NEEDS_AUTH",
      };
    }
    if (!demo) {
      return {
        provider: "claude_writer",
        lane: "anthropic_writer",
        status: "ok",
        ok: true,
        justification: "Live Messages tool-loop available — use writeLive for full rounds.",
        reasonCode: "TASK_BUS_ANTHROPIC_LIVE_READY",
        output: {
          drafts: skills.map((s) => ({
            skillId: s.id,
            draft: `live_pending:${s.action}:${s.target}`,
          })),
        },
      };
    }
    const drafts = skills.map((s) => ({
      skillId: s.id,
      draft: `[AAIS Claude-style demo]\nAction: ${s.action}\nTarget: ${s.target}\nStyle: ${s.style ?? "governed"}`,
    }));
    return {
      provider: "claude_writer",
      lane: "anthropic_writer",
      status: "demo",
      ok: true,
      justification: "Demo Claude-style writer (not Computer Use).",
      reasonCode: "TASK_BUS_DEMO_CLAUDE_WRITER",
      output: { drafts },
    };
  }

  async writeLive(
    skills: ParsedSkill[],
    opts?: { toolHandler?: ClaudeToolHandler },
  ): Promise<AdapterResult> {
    if (this.config.forceDemo !== false || !this.config.apiKey) {
      return this.write(skills);
    }
    const fetchImpl = this.config.fetchImpl ?? globalThis.fetch;
    if (!fetchImpl) {
      return {
        provider: "claude_writer",
        lane: "anthropic_writer",
        status: "error",
        ok: false,
        justification: "fetch unavailable for Claude tool loop",
        reasonCode: "TASK_BUS_ANTHROPIC_NO_FETCH",
      };
    }

    const toolHandler = opts?.toolHandler ?? defaultClaudeTool;
    const rounds: Record<string, unknown>[] = [];
    const maxRounds = this.config.maxToolRounds ?? 3;
    const userContent = skills
      .map((s) => `Write skill ${s.id}: ${s.action} → ${s.target} (style=${s.style ?? "governed"})`)
      .join("\n");

    type Block = { type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> };
    type Msg = { role: string; content: string | Block[] };
    const messages: Msg[] = [{ role: "user", content: userContent }];
    const drafts: { skillId: string; draft: string }[] = [];

    try {
      for (let round = 0; round < maxRounds; round++) {
        const res = await fetchImpl("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": this.config.apiKey!,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model:
              this.config.model ||
              process.env.AAIS_CLAUDE_MODEL ||
              "claude-3-5-haiku-latest",
            max_tokens: 1024,
            tools: CLAUDE_TOOLS,
            messages,
          }),
        });
        const text = await res.text();
        let data: Record<string, unknown>;
        try {
          data = JSON.parse(text) as Record<string, unknown>;
        } catch {
          return {
            provider: "claude_writer",
            lane: "anthropic_writer",
            status: "error",
            ok: false,
            justification: `Claude non-JSON HTTP ${res.status}`,
            reasonCode: "TASK_BUS_ANTHROPIC_HTTP_ERROR",
            output: { raw: text.slice(0, 500) },
          };
        }
        if (!res.ok) {
          return {
            provider: "claude_writer",
            lane: "anthropic_writer",
            status: "error",
            ok: false,
            justification: `Claude HTTP ${res.status}`,
            reasonCode: "TASK_BUS_ANTHROPIC_HTTP_ERROR",
            output: { data },
          };
        }
        const content = (data.content as Block[]) || [];
        rounds.push({ round, stop_reason: data.stop_reason, content });
        messages.push({ role: "assistant", content });

        const toolUses = content.filter((b) => b.type === "tool_use");
        const texts = content.filter((b) => b.type === "text").map((b) => b.text || "");
        if (texts.length) {
          for (const s of skills) {
            drafts.push({ skillId: s.id, draft: texts.join("\n") });
          }
        }
        if (!toolUses.length || data.stop_reason === "end_turn") break;

        const toolResults: Block[] = [];
        for (const tu of toolUses) {
          const result = await toolHandler(tu.name || "unknown", tu.input || {});
          rounds.push({ round, tool: tu.name, input: tu.input, result });
          toolResults.push({
            type: "tool_result",
            // Anthropic expects tool_use_id — encode as id field for our Block
            id: tu.id,
            text: JSON.stringify(result),
          } as Block);
        }
        // Anthropic tool_result shape
        messages.push({
          role: "user",
          content: toolUses.map((tu, i) => ({
            type: "tool_result",
            tool_use_id: tu.id,
            content: JSON.stringify(
              (rounds[rounds.length - toolUses.length + i] as { result?: unknown })?.result ?? {},
            ),
          })) as unknown as Block[],
        });
      }

      if (!drafts.length) {
        for (const s of skills) {
          drafts.push({
            skillId: s.id,
            draft: `[AAIS Claude live]\nAction: ${s.action}\nTarget: ${s.target}`,
          });
        }
      }

      return {
        provider: "claude_writer",
        lane: "anthropic_writer",
        status: "ok",
        ok: true,
        justification: `Live Claude tool loop (${rounds.length} events)`,
        reasonCode: "TASK_BUS_ANTHROPIC_TOOL_LOOP_OK",
        output: { drafts, toolLoop: rounds },
      };
    } catch (err) {
      return {
        provider: "claude_writer",
        lane: "anthropic_writer",
        status: "error",
        ok: false,
        justification: err instanceof Error ? err.message : String(err),
        reasonCode: "TASK_BUS_ANTHROPIC_NETWORK_ERROR",
      };
    }
  }
}
