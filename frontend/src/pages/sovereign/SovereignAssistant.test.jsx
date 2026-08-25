import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SovereignAssistant from './SovereignAssistant';

vi.mock('../../lib/api', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  getApiErrorMessage: (error, fallback = 'Error') => error?.message || fallback,
}));

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

import { apiGet, apiPost } from '../../lib/api';

function renderAt(path = '/sovereign') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/sovereign/*" element={<SovereignAssistant />} />
        <Route path="/assistant/*" element={<SovereignAssistant />} />
        <Route path="/task-bus" element={<div>Task Bus</div>} />
        <Route path="/adaptive-music" element={<div>Score</div>} />
        <Route path="/image-generator" element={<div>Image</div>} />
        <Route path="/operator/plugins" element={<div>Plugins</div>} />
        <Route path="/jarvis" element={<div>Jarvis</div>} />
        <Route path="/settings" element={<div>Settings</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('SovereignAssistant cognitive load', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    apiGet.mockImplementation(async (url) => {
      if (String(url).includes('/middleware/console')) {
        return { data: { ok: true, provider_status: { aais_tasks: { connected: true, mode: 'live' } } } };
      }
      if (String(url).includes('/skill-store')) {
        return { data: { ok: true, skills: [] } };
      }
      return { data: { ok: true, lanes: [] } };
    });
    apiPost.mockResolvedValue({
      data: {
        ok: true,
        traceId: 'trace_test',
        requestId: 'req_test',
        intent: { type: 'task', confidence: 0.8, raw: 'follow-up' },
        adaptive: { mode: 'balanced', status: 'ok' },
        outputs: {
          taskFlow: {
            aais: { id: 't1', title: 'Follow up Sarah' },
          },
        },
        trace: { events: [], evidence: [], decisionEvents: [] },
        reasonCodes: ['AAIS_TASK_CREATED'],
      },
    });
  });

  it('renders focus view by default and keeps telemetry collapsed', async () => {
    renderAt('/sovereign');
    expect(await screen.findByTestId('sovereign-assistant')).toBeTruthy();
    expect(screen.getByTestId('sovereign-focus-view')).toBeTruthy();
    expect(screen.getByTestId('sovereign-telemetry-toggle')).toBeTruthy();
    expect(screen.queryByTestId('sovereign-provider-lanes')).toBeNull();
  });

  it('dispatches ask via task-bus and offers commitment path', async () => {
    renderAt('/sovereign');
    fireEvent.click(await screen.findByRole('button', { name: /^Send$/i }));
    await waitFor(() => expect(apiPost).toHaveBeenCalled());
    const call = apiPost.mock.calls.find((c) => String(c[0]).includes('task-bus/dispatch'));
    expect(call).toBeTruthy();
    expect(await screen.findByTestId('sovereign-commitment-banner')).toBeTruthy();
  });

  it('opens scratch route for low-friction capture', async () => {
    renderAt('/sovereign/scratch');
    expect(await screen.findByTestId('sovereign-scratch-inbox')).toBeTruthy();
    const input = screen.getByLabelText(/Scratch thought/i);
    fireEvent.change(input, { target: { value: 'remember to file the form' } });
    fireEvent.click(screen.getByRole('button', { name: /^Capture$/i }));
    expect(screen.getByText(/remember to file the form/i)).toBeTruthy();
  });

  it('settings exposes stimulation prefs', async () => {
    renderAt('/sovereign/settings');
    expect(await screen.findByTestId('sovereign-stim-prefs')).toBeTruthy();
    expect(screen.getByText(/Cognitive load/i)).toBeTruthy();
  });

  it('opens console panel with middleware tab', async () => {
    renderAt('/sovereign/console');
    expect(await screen.findByTestId('sovereign-middleware-panel')).toBeTruthy();
  });

  it('opens dashboard with energy flow', async () => {
    localStorage.setItem(
      'sovereign-cognitive-prefs',
      JSON.stringify({
        density: 'dense',
        animation: 'full',
        notifications: 'essential',
        visualComplexity: 'rich',
        focusView: false,
        showRecoveryStrip: false,
        offerTaskExtraction: true,
      }),
    );
    renderAt('/sovereign/dashboard');
    expect(await screen.findByTestId('sovereign-dashboard-page')).toBeTruthy();
    expect(screen.getByTestId('sovereign-energy-flow')).toBeTruthy();
  });
});
