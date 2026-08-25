/**
 * Resilient AAIS WebSocket hook — reconnect + backoff, safe malformed handling.
 * Delegates transport to websocketClient (scaffold API).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { createWebsocketClient } from '../lib/websocketClient';
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

export function useAaisSocket(opts: UseAaisSocketOptions): UseAaisSocketResult {
  const { sessionId, enabled = true, maxBackoffMs = 15000, onFrame } = opts;
  const [state, setState] = useState<SocketConnectionState>('idle');
  const [lastError, setLastError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [lastFrame, setLastFrame] = useState<TelemetryFrame | null>(null);
  const clientRef = useRef<ReturnType<typeof createWebsocketClient> | null>(null);
  const onFrameRef = useRef(onFrame);
  onFrameRef.current = onFrame;

  const disconnect = useCallback(() => {
    clientRef.current?.disconnect();
    clientRef.current = null;
    setState('closed');
  }, []);

  const reconnect = useCallback(() => {
    clientRef.current?.reconnect();
  }, []);

  useEffect(() => {
    if (!enabled || !sessionId) {
      setState('disabled');
      return undefined;
    }

    const client = createWebsocketClient({
      sessionId,
      maxBackoffMs,
      onFrame: (frame) => {
        setLastFrame(frame);
        onFrameRef.current?.(frame);
      },
      onState: (next, meta) => {
        setState(next);
        if (meta?.attempt != null) setAttempt(meta.attempt);
        if (meta?.error !== undefined) setLastError(meta.error);
      },
    });
    clientRef.current = client;
    client.connect();

    return () => {
      client.disconnect();
      if (clientRef.current === client) clientRef.current = null;
    };
  }, [enabled, sessionId, maxBackoffMs]);

  return { state, lastError, attempt, lastFrame, reconnect, disconnect };
}

export default useAaisSocket;
