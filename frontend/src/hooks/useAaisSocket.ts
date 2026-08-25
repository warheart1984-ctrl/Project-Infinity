/**
 * Resilient AAIS WebSocket hook — reconnect + backoff, safe malformed handling.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { getAaisWebSocketUrl } from '../lib/aaisEndpoints';
import type { SocketConnectionState, TelemetryFrame } from '../types/aais';

export interface UseAaisSocketOptions {
  sessionId: string;
  /** When false, socket stays disabled */
  enabled?: boolean;
  maxBackoffMs?: number;
  onFrame?: (frame: TelemetryFrame) => void;
}

export interface UseAaisSocketResult {
  state: SocketConnectionState;
  lastError: string | null;
  attempt: number;
  lastFrame: TelemetryFrame | null;
  reconnect: () => void;
  disconnect: () => void;
}

function parseFrame(raw: string): TelemetryFrame | null {
  const text = String(raw || '').trim();
  if (!text || text === '[END]') return null;
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as TelemetryFrame;
    }
    return { type: 'text', payload: { text } };
  } catch {
    // Chat stream may send plain text chunks — treat as soft telemetry, never throw
    return { type: 'text_chunk', payload: { text: text.slice(0, 2000) } };
  }
}

export function useAaisSocket(opts: UseAaisSocketOptions): UseAaisSocketResult {
  const { sessionId, enabled = true, maxBackoffMs = 15000, onFrame } = opts;
  const [state, setState] = useState<SocketConnectionState>('idle');
  const [lastError, setLastError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [lastFrame, setLastFrame] = useState<TelemetryFrame | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptRef = useRef(0);
  const stoppedRef = useRef(false);
  const onFrameRef = useRef(onFrame);
  onFrameRef.current = onFrame;

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const disconnect = useCallback(() => {
    stoppedRef.current = true;
    clearTimer();
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {
        /* ignore */
      }
      wsRef.current = null;
    }
    setState('closed');
  }, []);

  const connect = useCallback(() => {
    if (!enabled || !sessionId) {
      setState('disabled');
      return;
    }
    const url = getAaisWebSocketUrl(sessionId);
    if (!url) {
      setState('disabled');
      return;
    }

    stoppedRef.current = false;
    clearTimer();
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {
        /* ignore */
      }
    }

    setState(attemptRef.current > 0 ? 'reconnecting' : 'connecting');
    let socket: WebSocket;
    try {
      socket = new WebSocket(url);
    } catch (err) {
      setLastError(err instanceof Error ? err.message : 'WebSocket construct failed');
      setState('error');
      return;
    }
    wsRef.current = socket;

    socket.onopen = () => {
      attemptRef.current = 0;
      setAttempt(0);
      setLastError(null);
      setState('open');
    };

    socket.onmessage = (event) => {
      try {
        const frame = parseFrame(String(event.data ?? ''));
        if (!frame) return;
        setLastFrame(frame);
        onFrameRef.current?.(frame);
      } catch (err) {
        // Malformed handling must never crash the UI
        console.warn('[useAaisSocket] ignored malformed frame', err);
      }
    };

    socket.onerror = () => {
      setLastError('WebSocket error');
      setState('error');
    };

    socket.onclose = () => {
      wsRef.current = null;
      if (stoppedRef.current) {
        setState('closed');
        return;
      }
      attemptRef.current += 1;
      setAttempt(attemptRef.current);
      const delay = Math.min(maxBackoffMs, 500 * 2 ** Math.min(attemptRef.current, 5));
      setState('reconnecting');
      timerRef.current = setTimeout(() => {
        if (!stoppedRef.current) connect();
      }, delay);
    };
  }, [enabled, sessionId, maxBackoffMs]);

  const reconnect = useCallback(() => {
    attemptRef.current = 0;
    setAttempt(0);
    connect();
  }, [connect]);

  useEffect(() => {
    connect();
    return () => {
      stoppedRef.current = true;
      clearTimer();
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {
          /* ignore */
        }
        wsRef.current = null;
      }
    };
  }, [connect]);

  return { state, lastError, attempt, lastFrame, reconnect, disconnect };
}

export default useAaisSocket;
