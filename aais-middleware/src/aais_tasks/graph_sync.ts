/**
 * Mythic: Graph ↔ AAIS task bridge
 * Engineering: syncFromGraph / syncToGraph — conflict detection + resolution policy
 */
import {
  callGraph,
  graphCreateTodoTask,
  graphListTodoTasks,
  type FetchLike,
} from "../provider_adapters/graph_client.js";
import type { AaisTask } from "./aais_task_model.js";
import type { AaisTaskStore } from "./aais_task_store.js";

export type SyncConflictPolicy = "prefer_aais" | "prefer_graph" | "report";

export interface SyncConflict {
  aaisTaskId: string;
  graphId: string;
  field: string;
  aaisValue: string;
  graphValue: string;
  resolution: "kept_aais" | "kept_graph" | "reported";
}

export interface GraphSyncResult {
  ok: boolean;
  reasonCode: string;
  imported?: AaisTask[];
  exported?: AaisTask[];
  conflicts?: SyncConflict[];
  error?: string;
  needsAuth?: boolean;
  policy?: SyncConflictPolicy;
}

function mapGraphStatus(s: unknown): AaisTask["status"] {
  const v = String(s || "").toLowerCase();
  if (v === "completed") return "completed";
  if (v === "inprogress" || v === "in_progress") return "inProgress";
  return "notStarted";
}

function statusToGraph(s: AaisTask["status"]): string {
  return s === "completed" ? "completed" : "notStarted";
}

function detectConflicts(
  aais: AaisTask,
  graphItem: Record<string, unknown>,
): { field: string; aaisValue: string; graphValue: string }[] {
  const diffs: { field: string; aaisValue: string; graphValue: string }[] = [];
  const gTitle = String(graphItem.title || "");
  if (gTitle && gTitle !== aais.title) {
    diffs.push({ field: "title", aaisValue: aais.title, graphValue: gTitle });
  }
  const gStatus = mapGraphStatus(graphItem.status);
  if (gStatus !== aais.status) {
    diffs.push({ field: "status", aaisValue: aais.status, graphValue: gStatus });
  }
  return diffs;
}

function resolvePolicy(explicit?: SyncConflictPolicy): SyncConflictPolicy {
  return (
    explicit ||
    (process.env.AAIS_GRAPH_SYNC_CONFLICT_POLICY as SyncConflictPolicy | undefined) ||
    "report"
  );
}

export async function syncFromGraph(
  store: AaisTaskStore,
  token: string | undefined,
  opts?: {
    fetchImpl?: FetchLike;
    listId?: string;
    conflictPolicy?: SyncConflictPolicy;
  },
): Promise<GraphSyncResult> {
  if (!token) {
    return {
      ok: false,
      needsAuth: true,
      reasonCode: "GRAPH_SYNC_NEEDS_AUTH",
      error: "Set AAIS_MS_GRAPH_TOKEN or connect Microsoft 365 for syncFromGraph.",
    };
  }
  const policy = resolvePolicy(opts?.conflictPolicy);
  const listed = await graphListTodoTasks(token, {
    fetchImpl: opts?.fetchImpl,
    listId: opts?.listId,
  });
  if (!listed.ok) {
    return {
      ok: false,
      reasonCode: listed.reasonCode,
      error: listed.error || "Graph list failed",
    };
  }
  const value = (listed.data as { value?: Record<string, unknown>[] })?.value || [];
  const imported: AaisTask[] = [];
  const conflicts: SyncConflict[] = [];

  for (const item of value) {
    const graphId = String(item.id || "");
    if (!graphId) continue;
    const existing = store.list().find((t) => t.graphId === graphId);
    if (existing) {
      const diffs = detectConflicts(existing, item);
      if (diffs.length === 0) {
        imported.push(existing);
        continue;
      }
      for (const d of diffs) {
        if (policy === "report") {
          conflicts.push({
            aaisTaskId: existing.id,
            graphId,
            ...d,
            resolution: "reported",
          });
          // no overwrite
        } else if (policy === "prefer_aais") {
          conflicts.push({
            aaisTaskId: existing.id,
            graphId,
            ...d,
            resolution: "kept_aais",
          });
        } else {
          // prefer_graph
          const patch: Record<string, unknown> = { source: "graph" };
          if (d.field === "title") patch.title = d.graphValue;
          if (d.field === "status") patch.status = mapGraphStatus(d.graphValue);
          const updated = store.update(existing.id, patch as never);
          if (updated) imported.push(updated);
          conflicts.push({
            aaisTaskId: existing.id,
            graphId,
            ...d,
            resolution: "kept_graph",
          });
        }
      }
      if (policy === "prefer_aais" || policy === "report") {
        imported.push(existing);
      }
      continue;
    }
    imported.push(
      store.create({
        title: String(item.title || "Graph task"),
        status: mapGraphStatus(item.status),
        dueDate: item.dueDateTime
          ? String((item.dueDateTime as { dateTime?: string }).dateTime || "")
          : undefined,
        source: "graph",
        graphId,
      }),
    );
  }
  return {
    ok: true,
    reasonCode: conflicts.some((c) => c.resolution === "reported")
      ? "GRAPH_SYNC_FROM_CONFLICTS"
      : "GRAPH_SYNC_FROM_OK",
    imported,
    conflicts,
    policy,
  };
}

export async function syncToGraph(
  store: AaisTaskStore,
  token: string | undefined,
  taskId: string,
  opts?: {
    fetchImpl?: FetchLike;
    listId?: string;
    conflictPolicy?: SyncConflictPolicy;
  },
): Promise<GraphSyncResult> {
  if (!token) {
    return {
      ok: false,
      needsAuth: true,
      reasonCode: "GRAPH_SYNC_NEEDS_AUTH",
      error: "Set AAIS_MS_GRAPH_TOKEN or connect Microsoft 365 for syncToGraph.",
    };
  }
  const policy = resolvePolicy(opts?.conflictPolicy);
  const task = store.get(taskId);
  if (!task) {
    return { ok: false, reasonCode: "AAIS_TASK_NOT_FOUND", error: `No task ${taskId}` };
  }
  const conflicts: SyncConflict[] = [];

  if (task.graphId) {
    const remote = await callGraph(
      token,
      `me/todo/lists/${encodeURIComponent(opts?.listId || "tasks")}/tasks/${encodeURIComponent(task.graphId)}`,
      "GET",
      undefined,
      { fetchImpl: opts?.fetchImpl },
    );
    if (remote.ok && remote.data && typeof remote.data === "object") {
      const diffs = detectConflicts(task, remote.data as Record<string, unknown>);
      for (const d of diffs) {
        if (policy === "report") {
          conflicts.push({
            aaisTaskId: task.id,
            graphId: task.graphId,
            ...d,
            resolution: "reported",
          });
        } else if (policy === "prefer_graph") {
          conflicts.push({
            aaisTaskId: task.id,
            graphId: task.graphId,
            ...d,
            resolution: "kept_graph",
          });
          const patch: Record<string, unknown> = { source: "graph" };
          if (d.field === "title") patch.title = d.graphValue;
          if (d.field === "status") patch.status = mapGraphStatus(d.graphValue);
          store.update(task.id, patch as never);
        } else {
          conflicts.push({
            aaisTaskId: task.id,
            graphId: task.graphId,
            ...d,
            resolution: "kept_aais",
          });
        }
      }
      if (policy === "report" && diffs.length > 0) {
        return {
          ok: true,
          reasonCode: "GRAPH_SYNC_TO_CONFLICTS",
          exported: [task],
          conflicts,
          policy,
        };
      }
      if (policy === "prefer_graph" && diffs.length > 0) {
        return {
          ok: true,
          reasonCode: "GRAPH_SYNC_TO_CONFLICTS",
          exported: [store.get(taskId) || task],
          conflicts,
          policy,
        };
      }
    }

    const patch = await callGraph(
      token,
      `me/todo/lists/${encodeURIComponent(opts?.listId || "tasks")}/tasks/${encodeURIComponent(task.graphId)}`,
      "PATCH",
      { title: task.title, status: statusToGraph(task.status) },
      { fetchImpl: opts?.fetchImpl },
    );
    if (!patch.ok) {
      return { ok: false, reasonCode: patch.reasonCode, error: patch.error, conflicts, policy };
    }
    return {
      ok: true,
      reasonCode: conflicts.length ? "GRAPH_SYNC_TO_CONFLICTS" : "GRAPH_SYNC_TO_OK",
      exported: [task],
      conflicts,
      policy,
    };
  }

  const created = await graphCreateTodoTask(token, task.title, {
    fetchImpl: opts?.fetchImpl,
    listId: opts?.listId,
  });
  if (!created.ok) {
    return { ok: false, reasonCode: created.reasonCode, error: created.error, policy };
  }
  const graphId = String((created.data as { id?: string })?.id || "");
  const updated = store.update(task.id, { graphId: graphId || undefined, source: "aais" });
  return {
    ok: true,
    reasonCode: "GRAPH_SYNC_TO_OK",
    exported: updated ? [updated] : [task],
    conflicts,
    policy,
  };
}
