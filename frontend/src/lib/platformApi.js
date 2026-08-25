const KEY_STORAGE = 'platform_api_key';

export function getPlatformApiBaseUrl() {
  const explicit = String(import.meta.env?.VITE_PLATFORM_API_BASE || '').trim();
  if (explicit) {
    return explicit.replace(/\/+$/, '');
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin.replace(/\/+$/, '')}/platform-api`;
  }
  return 'http://127.0.0.1:8000';
}

export function getPlatformApiKey() {
  try {
    return window.localStorage.getItem(KEY_STORAGE) || '';
  } catch {
    return '';
  }
}

export function setPlatformApiKey(value) {
  window.localStorage.setItem(KEY_STORAGE, String(value || '').trim());
}

async function platformRequest(method, path, body) {
  const headers = {
    Accept: 'application/json',
  };
  const key = getPlatformApiKey();
  if (key) {
    headers['X-Api-Key'] = key;
  }
  const options = { method, headers };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  const response = await fetch(`${getPlatformApiBaseUrl()}${path}`, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.detail || payload.error || `Platform request failed (${response.status})`);
    error.response = { data: payload, status: response.status };
    throw error;
  }
  return payload;
}

export function platformGet(path) {
  return platformRequest('GET', path);
}

export function platformPost(path, body) {
  return platformRequest('POST', path, body || {});
}

export function platformPut(path, body) {
  return platformRequest('PUT', path, body || {});
}
