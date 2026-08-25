/**
 * Mythic: ChatGPT Skills Lane
 * Engineering: GptToolsAdapter — live Chat Completions tool loop when key present
 */
import type { AdapterResult, ParsedSkill } from "../intent_bus/interfaces.js";

export interface GptToolsConfig {
  apiKey?: string;
  forceDemo?: boolean;
  fetchImpl?: typeof fetch;
  model?: string;
  maxToolRounds?: number;
}

export type ToolHandler = (name: string, args: Record<string, unknown>) => Promise<unknown> | unknown;

const DEFAULT_TOOLS = [
  {
    type: "function",
    function: {
      name: "aais_capability_bridge",
      description: "Compose an AAIS capability bridge plan for a skill target",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string" },
          target: { type: "string" },
        },
        required: ["action", "target"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "aais_list_skills",
      description: "List governed AAIS skill-store entries",
      parameters: { type: "object", properties: {} },
    },
  },
];

function defaultToolHandler(name: string, args: Record<string, unknown>): unknown {
  if (name === "aais_list_skills") {
    return {
      skills: [
        { id: "capability_bridge", label: "Capability Bridge" },
        { id: "workflow_compose", label: "Workflow Compose" },
      ],
    };
  }
  return {
    composed: true,
    action: args.action,
    target: args.target,
    hops: ["capability_bridge", "workflows"],
  };
}

export class GptToolsAdapter {
  constructor(private readonly config: GptToolsConfig = {}) {}

  executeSkills(skills: ParsedSkill[]): AdapterResult {
    // Sync demo/needs_auth path for existing callers
    const demo = this.config.forceDemo !== false || !this.config.apiKey;
    if (!demo && !this.config.apiKey) {
      return {
        provider: "gpt_tools",
        lane: "openai_tools",
        status: "needs_auth",
        ok: false,
        justification: "Set OPENAI_API_KEY for live tool calls.",
        reasonCode: "TASK_BUS_NEEDS_AUTH",
      };
    }
    if (!demo) {
      // Live is async — callers should use executeSkillsLive
      return {
        provider: "gpt_tools",
        lane: "openai_tools",
        status: "ok",
        ok: true,
        justification: "Live tool-loop available — use executeSkillsLive for full rounds.",
        reasonCode: "TASK_BUS_OPENAI_LIVE_READY",
        output: {
          skills: skills.map((s) => ({
            skillId: s.id,
            action: s.action,
            target: s.target,
            livePending: true,
          })),
        },
      };
    }
    return {
      provider: "gpt_tools",
      lane: "openai_tools",
      status: "demo",
      ok: true,
      justification: "Demo GPT-style skill pack compose (not a ChatGPT store clone).",
      reasonCode: "TASK_BUS_DEMO_GPT_TOOLS",
      output: {
        skills: skills.map((s) => ({
          skillId: s.id,
          action: s.action,
          compose: ["capability_bridge", "workflows"],
          target: s.target,
        })),
      },
    };
  }

  async executeSkillsLive(
    skills: ParsedSkill[],
    opts?: { toolHandler?: ToolHandler },
  ): Promise<AdapterResult> {
    if (this.config.forceDemo !== false && !this.config.apiKey) {
      return this.executeSkills(skills);
    }
    if (!this.config.apiKey) {
      return {
        provider: "gpt_tools",
        lane: "openai_tools",
        status: "needs_auth",
        ok: false,
        justification: "Set OPENAI_API_KEY for live tool calls.",
        reasonCode: "TASK_BUS_NEEDS_AUTH",
      };
    }
    if (this.config.forceDemo !== false) {
      return this.executeSkills(skills);
    }

    const fetchImpl = this.config.fetchImpl ?? globalThis.fetch;
    if (!fetchImpl) {
      return {
        provider: "gpt_tools",
        lane: "openai_tools",
        status: "error",
        ok: false,
        justification: "fetch unavailable for OpenAI tool loop",
        reasonCode: "TASK_BUS_OPENAI_NO_FETCH",
      };
    }

    const toolHandler = opts?.toolHandler ?? defaultToolHandler;
    const rounds: Record<string, unknown>[] = [];
    const maxRounds = this.config.maxToolRounds ?? 3;
    const userContent = skills
      .map((s) => `Skill ${s.id}: ${s.action} → ${s.target}`)
      .join("\n");

    type Msg = { role: string; content?: string | null; tool_calls?: unknown[]; tool_call_id?: string };
    const messages: Msg[] = [
      {
        role: "system",
        content:
          "You are AAIS GPT tools lane. Use tools when helpful. Never claim silent provider swaps.",
      },
      { role: "user", content: userContent },
    ];

    try {
      for (let round = 0; round < maxRounds; round++) {
        const res = await fetchImpl("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.config.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: this.config.model || process.env.AAIS_OPENAI_MODEL || "gpt-4o-mini",
            messages,
            tools: DEFAULT_TOOLS,
            tool_choice: "auto",
          }),
        });
        const text = await res.text();
        let data: Record<string, unknown>;
        try {
          data = JSON.parse(text) as Record<string, unknown>;
        } catch {
          return {
            provider: "gpt_tools",
            lane: "openai_tools",
            status: "error",
            ok: false,
            justification: `OpenAI non-JSON HTTP ${res.status}`,
            reasonCode: "TASK_BUS_OPENAI_HTTP_ERROR",
            output: { raw: text.slice(0, 500) },
          };
        }
        if (!res.ok) {
          return {
            provider: "gpt_tools",
            lane: "openai_tools",
            status: "error",
            ok: false,
            justification: `OpenAI HTTP ${res.status}`,
            reasonCode: "TASK_BUS_OPENAI_HTTP_ERROR",
            output: { data },
          };
        }
        const choice = (data.choices as { message?: Msg }[])?.[0]?.message;
        if (!choice) break;
        rounds.push({ round, message: choice });
        messages.push(choice);
        const toolCalls = (choice.tool_calls || []) as {
          id: string;
          function?: { name?: string; arguments?: string };
        }[];
        if (!toolCalls.length) break;
        for (const tc of toolCalls) {
          const name = tc.function?.name || "unknown";
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(tc.function?.arguments || "{}") as Record<string, unknown>;
          } catch {
            args = {};
          }
          const result = await toolHandler(name, args);
          rounds.push({ round, tool: name, args, result });
          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: JSON.stringify(result),
          });
        }
      }

      return {
        provider: "gpt_tools",
        lane: "openai_tools",
        status: "ok",
        ok: true,
        justification: `Live OpenAI tool loop (${rounds.length} events)`,
        reasonCode: "TASK_BUS_OPENAI_TOOL_LOOP_OK",
        output: {
          skills: skills.map((s) => ({ skillId: s.id, action: s.action, target: s.target })),
          toolLoop: rounds,
        },
      };
    } catch (err) {
      return {
        provider: "gpt_tools",
        lane: "openai_tools",
        status: "error",
        ok: false,
        justification: err instanceof Error ? err.message : String(err),
        reasonCode: "TASK_BUS_OPENAI_NETWORK_ERROR",
      };
    }
  }
}
