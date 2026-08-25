import axios from 'axios';
import { getApiBaseUrl } from './settings';

function createClient() {
  return axios.create({
    baseURL: getApiBaseUrl(),
    timeout: 180000,
  });
}

function unwrapDetail(detail) {
  if (typeof detail === 'string' && detail.trim()) {
    return detail;
  }
  if (Array.isArray(detail) && detail.length) {
    return detail
      .map((item) => (typeof item === 'string' ? item : item?.msg || item?.detail || ''))
      .filter(Boolean)
      .join('; ');
  }
  if (detail && typeof detail === 'object') {
    return detail.message || detail.error || detail.summary || '';
  }
  return '';
}

export function getApiErrorMessage(error, fallbackMessage = 'Request failed') {
  const payload = error?.response?.data || error?.payload || {};
  return (
    unwrapDetail(payload.detail)
    || payload.error
    || payload.message
    || payload.summary
    || error?.message
    || fallbackMessage
  );
}

export function apiGet(url, config) {
  return createClient().get(url, config);
}

export function apiDelete(url, config) {
  return createClient().delete(url, config);
}

export function apiPatch(url, data, config) {
  return createClient().patch(url, data, config);
}

export function apiPut(url, data, config) {
  return createClient().put(url, data, config);
}

export function apiPost(url, data, config) {
  return createClient().post(url, data, config);
}

function parseStreamChunk(chunk, onEvent) {
  const text = String(chunk || '').trim();
  if (!text) {
    return;
  }

  const payloadText = text.startsWith('data:') ? text.slice(5).trim() : text;
  if (!payloadText || payloadText === '[DONE]') {
    return;
  }

  try {
    onEvent?.(JSON.parse(payloadText));
  } catch {
    onEvent?.({ event: 'token', text_so_far: payloadText, finished: false });
  }
}

export async function apiPostStream(url, body, { signal, onEvent } = {}) {
  const response = await fetch(`${getApiBaseUrl()}${url}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream, application/json' },
    body: JSON.stringify(body || {}),
    signal,
  });

  if (!response.ok) {
    let payload = {};
    try {
      payload = await response.json();
    } catch {
      payload = {};
    }
    const error = new Error(getApiErrorMessage({ response: { data: payload } }, 'Streaming failed'));
    error.response = { data: payload, status: response.status };
    throw error;
  }

  if (!response.body || !response.body.getReader) {
    const payload = await response.json().catch(() => ({}));
    onEvent?.({ event: 'final', ...payload });
    return payload;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const parts = buffer.split(/\r?\n\r?\n/);
    buffer = parts.pop() || '';
    parts.forEach((part) => parseStreamChunk(part, onEvent));
    if (done) {
      parseStreamChunk(buffer, onEvent);
      break;
    }
  }

  return null;
}
