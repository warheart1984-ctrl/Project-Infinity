import { describe, expect, it, vi, afterEach } from 'vitest';
import { getApiBaseUrlCandidates } from './settings';

describe('getApiBaseUrlCandidates', () => {
  afterEach(() => {
    vi.unstubAllEnvs?.();
  });

  it('includes localhost only in DEV', () => {
    vi.stubEnv('DEV', true);
    vi.stubEnv('MODE', 'development');
    const list = getApiBaseUrlCandidates('');
    expect(list.some((u) => u.includes('127.0.0.1') || u.includes('localhost'))).toBe(true);
  });

  it('does not inject localhost API defaults in production mode', () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('PROD', true);
    vi.stubEnv('MODE', 'production');
    const list = getApiBaseUrlCandidates('https://api.example.com');
    expect(list).toContain('https://api.example.com');
    expect(list).not.toContain('http://127.0.0.1:8000');
    expect(list).not.toContain('http://localhost:8000');
  });
});
