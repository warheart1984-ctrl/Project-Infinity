import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useAdaptiveMode } from './useAdaptiveMode';

vi.mock('../lib/aaisClient', () => ({
  fetchAdaptiveLaneStatus: vi.fn(async () => ({
    adaptive_lanes: { mode: 'balanced', providers: ['aais'] },
  })),
}));

import { fetchAdaptiveLaneStatus } from '../lib/aaisClient';

describe('useAdaptiveMode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reads adaptive snapshot from dispatch result', () => {
    const { result } = renderHook(() =>
      useAdaptiveMode({
        dispatchResult: {
          ok: true,
          adaptive: { mode: 'conservative', status: 'ok', allowedProviders: ['aais'] },
        },
      }),
    );
    expect(result.current.mode).toBe('conservative');
    expect(result.current.allowedProviders).toEqual(['aais']);
    expect(result.current.status).toBe('ok');
  });

  it('polls adaptive-lanes when enabled', async () => {
    const { result } = renderHook(() =>
      useAdaptiveMode({ poll: true, pollMs: 60_000 }),
    );
    await waitFor(() => expect(fetchAdaptiveLaneStatus).toHaveBeenCalled());
    await waitFor(() => expect(result.current.laneRegistry).toBeTruthy());
    await act(async () => {
      await result.current.refresh();
    });
    expect(fetchAdaptiveLaneStatus.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('idles without inventing providers when no adaptive payload', () => {
    const { result } = renderHook(() => useAdaptiveMode({ dispatchResult: { ok: true } }));
    expect(result.current.mode).toBe('idle');
    expect(result.current.allowedProviders).toEqual([]);
  });
});
