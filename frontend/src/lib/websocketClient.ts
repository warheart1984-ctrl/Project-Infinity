/**
 * Resilient AAIS WebSocket client — reconnect/backoff, malformed-message safe.
 * Engineering: websocketClient · used by useAaisSocket / useWebSocketLanes
 */

import { getAaisWebSocketUrl } from './aaisEndpoints';
import type { SocketConnectionState, TelemetryFrame } from '../types/aais';

export type WebsocketClientState = SocketConnectionState;

export interface WebsocketClientOptions {
  sessionId: string;
  /** Resolved via getAaisWebSocketUrl when omitted */
  url?: string | null;
  maxBackoffMs?: number;
  onFrame?: (frame: TelemetryFrame) => void;
  onState?: (state: WebsocketClientState, meta?: { attempt?: number; error?: string | null }) => void;
}

export interface WebsocketClient {
  connect: () => void;
  disconnect: () => void;
  reconnect: () => void;
  getState: () => WebsocketClientState;
  getAttempt: () => number;
  getLastError: () => string | null;
}

export function parseTelemetryFrame(raw: string): TelemetryFrame | null {
  const text = String(raw || '').trim();
  if (!text || text === '[END]') return null;
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as TelemetryFrame;
    }
    return { type: 'text', payload: { text } };
  } catch {
    // Plain-text stream chunks — soft telemetry, never throw
    return { type: 'text_chunk', payload: { text: text.slice(0, 2000) } };
  }
}

export function createWebsocketClient(opts: WebsocketClientOptions): WebsocketClient {
  const maxBackoffMs = opts.maxBackoffMs ?? 15000;
  let state: WebsocketClientState = 'idle';
  let attempt = 0;
  let lastError: string | null = null;
  let socket: WebSocket | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = true;

  const clearTimer = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const setState = (next: WebsocketClientState, error: string | null = lastError) => {
    state = next;
    lastError = error;
    opts.onState?.(state, { attempt, error: lastError });
  };

  const resolveUrl = (): string | null => {
    if (opts.url !== undefined) return opts.url;
    return getAaisWebSocketUrl(opts.sessionId);
  };

  const connect = () => {
    const url = resolveUrl();
    if (!opts.sessionId || !url) {
      setState('disabled', null);
      return;
    }

    stopped = false;
    clearTimer();
    if (socket) {
      try {
        socket.close();
      } catch {
        /* ignore */
      }
      socket = null;
    }

    setState(attempt > 0 ? 'reconnecting' : 'connecting', null);
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch (err) {
      setState('error', err instanceof Error ? err.message : 'WebSocket construct failed');
      return;
    }
    socket = ws;

    ws.onopen = () => {
      attempt = 0;
      setState('open', null);
    };

    ws.onmessage = (event) => {
      try {
        const frame = parseTelemetryFrame(String(event.data ?? ''));
        if (!frame) return;
        opts.onFrame?.(frame);
      } catch (err) {
        console.warn('[websocketClient] ignored malformed frame', err);
      }
    };

    ws.onerror = () => {
      setState('error', 'WebSocket error');
    };

    ws.onclose = () => {
      socket = null;
      if (stopped) {
        setState('closed', lastError);
        return;
      }
      attempt += 1;
      const delay = Math.min(maxBackoffMs, 500 * 2 ** Math.min(attempt, 5));
      setState('reconnecting', lastError);
      timer = setTimeout(() => {
        if (!stopped) connect();
      }, delay);
    };
  };

  const disconnect = () => {
    stopped = true;
    clearTimer();
    if (socket) {
      try {
        socket.close();
      } catch {
        /* ignore */
      }
      socket = null;
    }
    setState('closed', lastError);
  };

  const reconnect = () => {
    attempt = 0;
    connect();
  };

  return {
    connect,
    disconnect,
    reconnect,
    getState: () => state,
    getAttempt: () => attempt,
    getLastError: () => lastError,
  };
}
