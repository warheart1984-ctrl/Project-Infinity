/**
 * Env-driven AAIS REST + WebSocket endpoint resolution.
 * Never hard-code production WS hosts — configure via VITE_*.
 * Behind Render/nginx: leave VITE_API_BASE_URL empty to use same-origin HTTPS/WSS.
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

function readWindowOrigin(): string {
  try {
    if (typeof window === 'undefined' || !window.location?.origin) return '';
    return String(window.location.origin).replace(/\/+$/, '');
  } catch {
    return '';
  }
}

/**
 * REST base for Task-Bus / middleware.
 * Priority: VITE_API_BASE_URL | VITE_API_URL | settings | window.origin (prod same-origin).
 * Never falls back to hard-coded localhost in production builds.
 */
export function getAaisRestBase(): string {
  const fromEnv = readEnv('VITE_API_BASE_URL') || readEnv('VITE_API_URL') || readEnv('REACT_APP_API_URL');
  if (fromEnv) return fromEnv.replace(/\/+$/, '');
  const fromSettings = String(getApiBaseUrl() || '').replace(/\/+$/, '');
  if (fromSettings) return fromSettings;
  return readWindowOrigin();
}

/**
 * Build WebSocket URL for live telemetry / chat lanes.
 * Prefer VITE_AAIS_WS_URL; else derive from REST base (https→wss, http→ws).
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

  const rest = getAaisRestBase() || readWindowOrigin();
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

export const ADAPTIVE_PATHS = {
  lanesStatus: '/api/jarvis/adaptive-lanes/status',
} as const;

export const OPERATOR_PATHS = {
  middlewareConsole: '/api/operator/middleware/console',
  skillStore: '/api/operator/skill-store',
  skillInvoke: (skillId: string) =>
    `/api/operator/skill-store/${encodeURIComponent(skillId)}/invoke`,
  aaisTasksExecute: '/api/operator/middleware-plugs/middleware.aais.tasks/execute',
} as const;
