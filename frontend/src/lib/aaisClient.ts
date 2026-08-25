/**
 * Typed AAIS HTTP client — Task Bus + middleware plugs + skill store.
 */

import { apiGet, apiPost, getApiErrorMessage } from './api';
import { OPERATOR_PATHS, TASK_BUS_PATHS } from './aaisEndpoints';
import type {
  ConflictPolicy,
  GraphSyncResult,
  MiddlewareStatus,
  SkillInvokeResult,
  SkillStoreCatalog,
  TaskBusDispatchResult,
  TaskSkillsRequestPayload,
} from '../types/aais';

export { getApiErrorMessage };

export async function fetchTaskBusStatus(): Promise<Record<string, unknown>> {
  const res = await apiGet(TASK_BUS_PATHS.status);
  return (res.data || {}) as Record<string, unknown>;
}

export async function dispatchTaskBus(
  payload: TaskSkillsRequestPayload,
): Promise<TaskBusDispatchResult> {
  const res = await apiPost(TASK_BUS_PATHS.dispatch, payload);
  return (res.data || {}) as TaskBusDispatchResult;
}

export async function fetchTaskBusTrace(traceId: string): Promise<TaskBusDispatchResult> {
  const res = await apiGet(TASK_BUS_PATHS.trace(traceId));
  return (res.data || {}) as TaskBusDispatchResult;
}

export async function fetchMiddlewareStatus(): Promise<MiddlewareStatus> {
  try {
    const res = await apiGet(OPERATOR_PATHS.middlewareConsole);
    return (res.data || {}) as MiddlewareStatus;
  } catch {
    const status = await fetchTaskBusStatus();
    const lanes = Array.isArray(status.lanes) ? status.lanes : [];
    const provider_status: MiddlewareStatus['provider_status'] = {};
    for (const lane of lanes as Array<Record<string, unknown>>) {
      const key = String(lane.provider || lane.lane_id || lane.label || 'lane');
      const auth = String(lane.auth_status || 'simulate');
      provider_status[key] = {
        connected: auth === 'live' || auth === 'ok',
        mode: auth,
      };
    }
    return { ok: Boolean(status.ok), provider_status };
  }
}

export async function fetchSkillStore(): Promise<SkillStoreCatalog> {
  const res = await apiGet(OPERATOR_PATHS.skillStore);
  return (res.data || {}) as SkillStoreCatalog;
}

export async function invokeSkill(
  skillId: string,
  args: Record<string, unknown> = {},
): Promise<SkillInvokeResult> {
  const res = await apiPost(OPERATOR_PATHS.skillInvoke(skillId), {
    operator_approved: true,
    args,
  });
  return (res.data || {}) as SkillInvokeResult;
}

export async function syncAaisTasksFromGraph(opts: {
  forceDemo?: boolean;
  conflictPolicy?: ConflictPolicy;
}): Promise<GraphSyncResult> {
  const res = await apiPost(OPERATOR_PATHS.aaisTasksExecute, {
    action: 'syncFromGraph',
    operator_approved: true,
    dry_run: false,
    force_demo: Boolean(opts.forceDemo),
    conflictPolicy: opts.conflictPolicy || 'report',
    conflict_policy: opts.conflictPolicy || 'report',
  });
  return (res.data || {}) as GraphSyncResult;
}

/** Narrow unknown axios/error payloads into TaskBusDispatchResult when present. */
export function extractDispatchErrorPayload(error: unknown): TaskBusDispatchResult | null {
  const err = error as { response?: { data?: TaskBusDispatchResult } };
  const data = err?.response?.data;
  if (data && (data.traceId || data.trace_id)) {
    return data;
  }
  return null;
}
