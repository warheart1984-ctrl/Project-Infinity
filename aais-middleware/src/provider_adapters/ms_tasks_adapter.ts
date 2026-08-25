/** Mythic: Microsoft Tasks Lane — Engineering: MsTasksAdapter */
import type { AdapterResult, ParsedTask } from "../intent_bus/interfaces.js";

export interface MsTasksConfig {
  accessToken?: string;
  forceDemo?: boolean;
}

export class MsTasksAdapter {
  constructor(private readonly config: MsTasksConfig = {}) {}

  executeTasks(tasks: ParsedTask[]): AdapterResult {
    const demo = this.config.forceDemo !== false || !this.config.accessToken;
    if (!demo && !this.config.accessToken) {
      return {
        provider: "ms_tasks",
        lane: "microsoft_tasks",
        status: "needs_auth",
        ok: false,
        justification: "Set AAIS_MS_GRAPH_TOKEN for live Graph To Do.",
        reasonCode: "TASK_BUS_NEEDS_AUTH",
      };
    }
    if (!demo) {
      return {
        provider: "ms_tasks",
        lane: "microsoft_tasks",
        status: "denied",
        ok: false,
        justification:
          "Token present but live Graph execute deferred — no silent substitute.",
        reasonCode: "TASK_BUS_LIVE_GRAPH_DEFERRED",
      };
    }
    const planned = tasks.map((t) => ({
      id: t.id,
      title: `${t.action}: ${t.target}`.slice(0, 160),
      status: "open",
    }));
    return {
      provider: "ms_tasks",
      lane: "microsoft_tasks",
      status: "demo",
      ok: true,
      justification: "Demo Microsoft-style task plan (no Graph call).",
      reasonCode: "TASK_BUS_DEMO_MS_TASKS",
      output: { tasks: planned },
    };
  }
}
