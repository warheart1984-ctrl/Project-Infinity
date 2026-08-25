/**
 * Env-driven AAIS REST + WebSocket endpoint resolution.
 * Never hard-code production WS hosts — configure via VITE_*.
 */

import { getApiBaseUrl } from './settings';

function readEnv(name: string): string {
  try {
    const meta = import.meta as ImportMeta & { env?: Record<string, string | undefined> };
    return String(meta.env?.[name] ?? '').trim();
  } catch {
    return '';
  }
}

export function getAaisRestBase(): string {
  const fromEnv = readEnv('VITE_API_BASE_URL') || readEnv('VITE_API_URL') || readEnv('REACT_APP_API_URL');
  if (fromEnv) return fromEnv.replace(/\/+$/, '');
  return String(getApiBaseUrl() || '').replace(/\/+$/, '');
}

/**
 * Build WebSocket URL for live telemetry / chat lanes.
 * Prefer VITE_AAIS_WS_URL; else derive from REST base + path template.
 */
export function getAaisWebSocketUrl(sessionId: string): string | null {
  const enabled = readEnv('VITE_AAIS_WS_ENABLED');
  if (enabled === '0' || enabled === 'false') return null;

  const explicit = readEnv('VITE_AAIS_WS_URL');
  if (explicit) {
    return explicit
      .replace(/\{sessionId\}/g, encodeURIComponent(sessionId))
      .replace(/\{session_id\}/g, encodeURIComponent(sessionId));
  }

  const pathTemplate =
    readEnv('VITE_AAIS_WS_PATH') || '/ws/chat/{sessionId}';
  const path = pathTemplate
    .replace(/\{sessionId\}/g, encodeURIComponent(sessionId))
    .replace(/\{session_id\}/g, encodeURIComponent(sessionId));

  const rest = getAaisRestBase();
  if (!rest) return null;

  try {
    const u = new URL(rest);
    const wsProto = u.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${wsProto}//${u.host}${path.startsWith('/') ? path : `/${path}`}`;
  } catch {
    return null;
  }
}

export const TASK_BUS_PATHS = {
  status: '/api/jarvis/task-bus/status',
  dispatch: '/api/jarvis/task-bus/dispatch',
  trace: (traceId: string) => `/api/jarvis/task-bus/trace/${encodeURIComponent(traceId)}`,
} as const;

export const OPERATOR_PATHS = {
  middlewareConsole: '/api/operator/middleware/console',
  skillStore: '/api/operator/skill-store',
  skillInvoke: (skillId: string) =>
    `/api/operator/skill-store/${encodeURIComponent(skillId)}/invoke`,
  aaisTasksExecute: '/api/operator/middleware-plugs/middleware.aais.tasks/execute',
} as const;
