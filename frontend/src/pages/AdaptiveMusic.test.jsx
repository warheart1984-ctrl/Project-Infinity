import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import AdaptiveMusic from './AdaptiveMusic';

const adaptiveMocks = vi.hoisted(() => ({
  apiPost: vi.fn(),
  getApiErrorMessage: vi.fn((error, fallback) => fallback || error?.message || 'Request failed'),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('../lib/api', () => ({
  apiPost: adaptiveMocks.apiPost,
  getApiErrorMessage: adaptiveMocks.getApiErrorMessage,
}));

vi.mock('react-hot-toast', () => ({
  default: {
    success: adaptiveMocks.toastSuccess,
    error: adaptiveMocks.toastError,
  },
}));

function renderPage() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AdaptiveMusic />
    </MemoryRouter>,
  );
}

describe('AdaptiveMusic', () => {
  beforeEach(() => {
    adaptiveMocks.apiPost.mockReset();
    adaptiveMocks.toastSuccess.mockReset();
    adaptiveMocks.toastError.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it('posts scene state to the adaptive compose API and plays the mix', async () => {
    adaptiveMocks.apiPost.mockResolvedValue({
      data: {
        mood: 'intense',
        bpm: 140,
        duration_sec: 6,
        engine: 'arrangement_pcm.v1',
        mix_sha256: 'abc123def456',
        stems: { mix: 'UklGRg==', kick: 'UklGRg==' },
      },
    });
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Intense' }));
    fireEvent.click(screen.getByRole('button', { name: 'Compose score + mix' }));

    expect(adaptiveMocks.apiPost).toHaveBeenCalledWith(
      '/api/jarvis/adaptive-music/compose',
      expect.objectContaining({ mood: 'intense', duration_sec: 6 }),
    );
    expect(await screen.findByText(/arrangement_pcm.v1/)).toBeTruthy();
    expect(screen.getAllByText('mix').length).toBeGreaterThan(0);
  });
});
