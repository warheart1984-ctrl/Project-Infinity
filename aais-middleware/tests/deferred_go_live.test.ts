import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { classifyIntentWithEmbeddings, localEmbed, cosine } from "../src/intent_bus/embeddings_classifier.js";
import { runWorkbookSessionFlow } from "../src/provider_adapters/excel_workbook_client.js";
import { GptToolsAdapter } from "../src/provider_adapters/gpt_tools_adapter.js";
import { ClaudeWriterAdapter } from "../src/provider_adapters/claude_writer_adapter.js";
import { SkillStoreRegistry } from "../src/provider_adapters/skill_store.js";
import { AaisTaskStore } from "../src/aais_tasks/aais_task_store.js";
import { syncFromGraph } from "../src/aais_tasks/graph_sync.js";

test("local embeddings are deterministic and cosine works", () => {
  const a = localEmbed("plan my week tasks");
  const b = localEmbed("plan my week tasks");
  assert.equal(a.length, 64);
  assert.ok(cosine(a, b) > 0.99);
});

test("embeddings classifier falls back safely", async () => {
  process.env.AAIS_EMBEDDINGS_DISABLE = "1";
  const r = await classifyIntentWithEmbeddings("make a task tomorrow");
  assert.equal(r.fallback, true);
  assert.ok(r.type);
  delete process.env.AAIS_EMBEDDINGS_DISABLE;

  process.env.AAIS_EMBEDDINGS_BACKEND = "local";
  const live = await classifyIntentWithEmbeddings("draw a mandala picture");
  assert.equal(live.backend, "local");
  assert.ok(live.tags.includes("picture") || live.type === "picture");
});

test("excel workbook session flow mocks Graph HTTP", async () => {
  let step = 0;
  const fetchImpl = async (_url: string | URL, init?: { method?: string; body?: string }) => {
    step += 1;
    const method = (init?.method || "GET").toUpperCase();
    if (method === "POST" && String(_url).includes("createSession")) {
      return {
        ok: true,
        status: 201,
        text: async () => JSON.stringify({ id: "sess-1" }),
        json: async () => ({ id: "sess-1" }),
      };
    }
    if (method === "PATCH") {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ values: [["a", "b"]] }),
        json: async () => ({ values: [["a", "b"]] }),
      };
    }
    if (method === "GET") {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ values: [["metric", "value"], ["demo", 1]] }),
        json: async () => ({ values: [["metric", "value"], ["demo", 1]] }),
      };
    }
    // closeSession
    return {
      ok: true,
      status: 204,
      text: async () => "",
      json: async () => ({}),
    };
  };
  const flow = await runWorkbookSessionFlow(
    "tok",
    { itemPath: "/AAIS/exports/test.xlsx", address: "A1:B2" },
    { fetchImpl },
  );
  assert.equal(flow.ok, true);
  assert.equal(flow.reasonCode, "EXCEL_SESSION_FLOW_OK");
  assert.ok((flow.steps?.length || 0) >= 4);
  assert.ok(step >= 4);
});

test("excel without token fails closed", async () => {
  const flow = await runWorkbookSessionFlow(undefined, { itemPath: "/AAIS/exports/x.xlsx" });
  assert.equal(flow.ok, false);
  assert.equal(flow.reasonCode, "EXCEL_NEEDS_AUTH");
});

test("GPT tool loop with mocked OpenAI", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    if (calls === 1) {
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            choices: [
              {
                message: {
                  role: "assistant",
                  content: null,
                  tool_calls: [
                    {
                      id: "tc1",
                      function: {
                        name: "aais_capability_bridge",
                        arguments: JSON.stringify({ action: "compose", target: "week" }),
                      },
                    },
                  ],
                },
              },
            ],
          }),
        json: async () => ({}),
      };
    }
    return {
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          choices: [{ message: { role: "assistant", content: "done" } }],
        }),
      json: async () => ({}),
    };
  };
  const result = await new GptToolsAdapter({
    apiKey: "sk-test",
    forceDemo: false,
    fetchImpl: fetchImpl as never,
  }).executeSkillsLive([{ id: "s1", action: "compose", target: "week" }]);
  assert.equal(result.ok, true);
  assert.equal(result.reasonCode, "TASK_BUS_OPENAI_TOOL_LOOP_OK");
  assert.ok(Array.isArray((result.output as { toolLoop?: unknown[] })?.toolLoop));
});

test("Claude tool loop with mocked Anthropic", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    if (calls === 1) {
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            stop_reason: "tool_use",
            content: [
              {
                type: "tool_use",
                id: "tu1",
                name: "aais_draft_outline",
                input: { target: "brief", style: "governed" },
              },
            ],
          }),
        json: async () => ({}),
      };
    }
    return {
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          stop_reason: "end_turn",
          content: [{ type: "text", text: "Final draft" }],
        }),
      json: async () => ({}),
    };
  };
  const result = await new ClaudeWriterAdapter({
    apiKey: "ak-test",
    forceDemo: false,
    fetchImpl: fetchImpl as never,
  }).writeLive([{ id: "s1", action: "write", target: "brief" }]);
  assert.equal(result.ok, true);
  assert.equal(result.reasonCode, "TASK_BUS_ANTHROPIC_TOOL_LOOP_OK");
});

test("skill store list and invoke", () => {
  const root = mkdtempSync(join(tmpdir(), "skills-"));
  const store = new SkillStoreRegistry({ runtimeRoot: root });
  const catalog = store.catalogStatus();
  assert.ok((catalog.count as number) >= 4);
  const invoked = store.invoke({ skillId: "capability_bridge", args: { target: "x" } });
  assert.equal(invoked.ok, true);
  assert.equal(invoked.reasonCode, "SKILL_STORE_INVOKED");
  const missing = store.invoke({ skillId: "nope" });
  assert.equal(missing.ok, false);
});

test("graph sync report policy does not overwrite conflicts", async () => {
  const root = mkdtempSync(join(tmpdir(), "sync-"));
  const store = new AaisTaskStore({ runtimeRoot: root });
  store.create({
    title: "AAIS title",
    status: "notStarted",
    source: "aais",
    graphId: "g1",
  });
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    text: async () =>
      JSON.stringify({
        value: [{ id: "g1", title: "Graph title", status: "completed" }],
      }),
    json: async () => ({
      value: [{ id: "g1", title: "Graph title", status: "completed" }],
    }),
  });
  const result = await syncFromGraph(store, "tok", {
    fetchImpl: fetchImpl as never,
    conflictPolicy: "report",
  });
  assert.equal(result.ok, true);
  assert.ok((result.conflicts || []).length >= 1);
  assert.ok((result.conflicts || []).every((c) => c.resolution === "reported"));
  const still = store.list().find((t) => t.graphId === "g1");
  assert.equal(still?.title, "AAIS title");
});

test("graph sync prefer_graph applies remote values", async () => {
  const root = mkdtempSync(join(tmpdir(), "sync2-"));
  const store = new AaisTaskStore({ runtimeRoot: root });
  store.create({
    title: "AAIS title",
    status: "notStarted",
    source: "aais",
    graphId: "g2",
  });
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    text: async () =>
      JSON.stringify({
        value: [{ id: "g2", title: "Graph title", status: "completed" }],
      }),
    json: async () => ({
      value: [{ id: "g2", title: "Graph title", status: "completed" }],
    }),
  });
  const result = await syncFromGraph(store, "tok", {
    fetchImpl: fetchImpl as never,
    conflictPolicy: "prefer_graph",
  });
  assert.equal(result.ok, true);
  const updated = store.list().find((t) => t.graphId === "g2");
  assert.equal(updated?.title, "Graph title");
  assert.equal(updated?.status, "completed");
});
