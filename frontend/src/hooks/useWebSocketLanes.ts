/**
 * Scaffold alias: useWebSocketLanes
 * Mythic: live provider lane stream · Engineering: wraps useAaisSocket / websocketClient
 */

import { useMemo } from 'react';
import { useAaisSocket, type UseAaisSocketOptions, type UseAaisSocketResult } from './useAaisSocket';
import type { ProviderLaneEvent, TelemetryFrame } from '../types/aais';

export type UseWebSocketLanesOptions = UseAaisSocketOptions;

export interface UseWebSocketLanesResult extends UseAaisSocketResult {
  /** Last frame that looks like a provider-lane event */
  lastLaneEvent: ProviderLaneEvent | null;
  frames: TelemetryFrame[];
}

function asLaneEvent(frame: TelemetryFrame | null): ProviderLaneEvent | null {
  if (!frame) return null;
  const payload = frame.payload;
  const provider =
    (typeof payload?.provider === 'string' && payload.provider)
    || (typeof frame.event === 'string' && frame.event.includes('lane') ? 'lane' : null);
  if (!provider && frame.type !== 'lane' && frame.type !== 'provider_lane') return null;
  return {
    provider: provider || String(frame.type || 'unknown'),
    lane: typeof payload?.lane === 'string' ? payload.lane : undefined,
    error: typeof payload?.error === 'string' ? payload.error : undefined,
    timestamp: typeof payload?.timestamp === 'string' ? payload.timestamp : undefined,
    latencyMs: typeof payload?.latencyMs === 'number' ? payload.latencyMs : undefined,
    input: typeof payload?.input === 'object' && payload.input && !Array.isArray(payload.input)
      ? (payload.input as Record<string, unknown>)
      : undefined,
    output: typeof payload?.output === 'object' && payload.output && !Array.isArray(payload.output)
      ? (payload.output as Record<string, unknown>)
      : undefined,
  };
}

/**
 * Live telemetry lane hook — same resilient WS as useAaisSocket, with lane-shaped accessors.
 */
export function useWebSocketLanes(opts: UseWebSocketLanesOptions): UseWebSocketLanesResult {
  const socket = useAaisSocket(opts);
  const lastLaneEvent = useMemo(() => asLaneEvent(socket.lastFrame), [socket.lastFrame]);
  const frames = useMemo(
    () => (socket.lastFrame ? [socket.lastFrame] : []),
    [socket.lastFrame],
  );

  return {
    ...socket,
    lastLaneEvent,
    frames,
  };
}

export default useWebSocketLanes;
