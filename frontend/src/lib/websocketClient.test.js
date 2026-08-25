import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  createWebsocketClient,
  parseTelemetryFrame,
} from './websocketClient';

describe('websocketClient', () => {
  it('parses JSON telemetry frames', () => {
    const frame = parseTelemetryFrame('{"type":"lane","payload":{"provider":"aais"}}');
    expect(frame?.type).toBe('lane');
    expect(frame?.payload?.provider).toBe('aais');
  });

  it('soft-handles malformed / plain text without throwing', () => {
    expect(() => parseTelemetryFrame('not-json {')).not.toThrow();
    const frame = parseTelemetryFrame('hello chunk');
    expect(frame?.type).toBe('text_chunk');
  });

  it('disables when URL cannot be resolved', () => {
    const states = [];
    const client = createWebsocketClient({
      sessionId: 's1',
      url: null,
      onState: (s) => states.push(s),
    });
    client.connect();
    expect(client.getState()).toBe('disabled');
  });
});

describe('websocketClient reconnect schedule', () => {
  let OriginalWS;
  beforeEach(() => {
    OriginalWS = globalThis.WebSocket;
    vi.useFakeTimers();
  });
  afterEach(() => {
    globalThis.WebSocket = OriginalWS;
    vi.useRealTimers();
  });

  it('backs off after close', () => {
    const instances = [];
    class FakeWS {
      constructor(url) {
        this.url = url;
        this.readyState = 0;
        instances.push(this);
        setTimeout(() => {
          this.onopen?.();
          this.onclose?.();
        }, 0);
      }
      close() {
        this.readyState = 3;
      }
    }
    globalThis.WebSocket = FakeWS;

    const client = createWebsocketClient({
      sessionId: 's1',
      url: 'ws://localhost/test',
      maxBackoffMs: 2000,
    });
    client.connect();
    vi.runOnlyPendingTimers();
    expect(instances.length).toBeGreaterThanOrEqual(1);
    expect(client.getState()).toBe('reconnecting');
    client.disconnect();
  });
});
