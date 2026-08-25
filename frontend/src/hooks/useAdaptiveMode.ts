/**
 * Scaffold: useAdaptiveMode
 * Mythic: adaptive orchestration posture · Engineering: AdaptiveModeSnapshot hook
 *
 * Inputs: last TaskBusDispatchResult.adaptive and optional REST adaptive-lanes status
 * Outputs: normalized AdaptiveSnapshot + loading/error
 * Constraints: read-only; never invent provider allow-lists
 * Failure modes: REST failure → fall back to dispatch adaptive only
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchAdaptiveLaneStatus } from '../lib/aaisClient';
import type { AdaptiveSnapshot, TaskBusDispatchResult } from '../types/aais';

export interface UseAdaptiveModeOptions {
  /** From latest task-bus dispatch */
  dispatchResult?: TaskBusDispatchResult | null;
  /** Poll adaptive-lanes REST when true */
  poll?: boolean;
  pollMs?: number;
}

export interface UseAdaptiveModeResult {
  adaptive: AdaptiveSnapshot | null;
  mode: string;
  status: string;
  deepLink: string | null;
  allowedProviders: string[];
  laneRegistry: Record<string, unknown> | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

function normalizeAdaptive(raw: AdaptiveSnapshot | null | undefined): AdaptiveSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  return raw;
}

export function useAdaptiveMode(opts: UseAdaptiveModeOptions = {}): UseAdaptiveModeResult {
  const { dispatchResult = null, poll = false, pollMs = 30000 } = opts;
  const fromDispatch = useMemo(
    () => normalizeAdaptive(dispatchResult?.adaptive),
    [dispatchResult],
  );
  const [laneRegistry, setLaneRegistry] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await fetchAdaptiveLaneStatus();
      setLaneRegistry(snap);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'adaptive lanes unavailable');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!poll) return undefined;
    void refresh();
    const id = setInterval(() => {
      void refresh();
    }, pollMs);
    return () => clearInterval(id);
  }, [poll, pollMs, refresh]);

  const adaptive = fromDispatch;
  const mode = String(adaptive?.mode || 'idle');
  const status = String(adaptive?.status || (loading ? 'loading' : 'idle'));
  const deepLink =
    typeof adaptive?.deepLink === 'string' && adaptive.deepLink
      ? adaptive.deepLink
      : null;
  const allowedProviders = Array.isArray(adaptive?.allowedProviders)
    ? adaptive.allowedProviders.filter((p): p is string => typeof p === 'string')
    : [];

  return {
    adaptive,
    mode,
    status,
    deepLink,
    allowedProviders,
    laneRegistry,
    loading,
    error,
    refresh,
  };
}

export default useAdaptiveMode;
