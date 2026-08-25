import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { getAaisRestBase, getAaisWebSocketUrl } from './aaisEndpoints';

describe('aaisEndpoints production-safe resolution', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_API_BASE_URL', '');
    vi.stubEnv('VITE_API_URL', '');
    vi.stubEnv('VITE_AAIS_WS_URL', '');
    vi.stubEnv('VITE_AAIS_WS_ENABLED', '1');
    vi.stubEnv('VITE_AAIS_WS_PATH', '/ws/chat/{sessionId}');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('maps https REST base to wss', () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://aais-api.onrender.com');
    const url = getAaisWebSocketUrl('sess_1');
    expect(url).toBe('wss://aais-api.onrender.com/ws/chat/sess_1');
  });

  it('maps http REST base to ws (local docker only)', () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://api:8000');
    expect(getAaisWebSocketUrl('s')).toBe('ws://api:8000/ws/chat/s');
  });

  it('honors explicit VITE_AAIS_WS_URL template', () => {
    vi.stubEnv(
      'VITE_AAIS_WS_URL',
      'wss://aais-api.onrender.com/ws/chat/{sessionId}',
    );
    expect(getAaisWebSocketUrl('abc')).toBe(
      'wss://aais-api.onrender.com/ws/chat/abc',
    );
  });

  it('returns null when WS disabled', () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://aais-api.onrender.com');
    vi.stubEnv('VITE_AAIS_WS_ENABLED', '0');
    expect(getAaisWebSocketUrl('s')).toBeNull();
  });

  it('reads REST from VITE_API_BASE_URL', () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://aais-api.onrender.com/');
    expect(getAaisRestBase()).toBe('https://aais-api.onrender.com');
  });
});
