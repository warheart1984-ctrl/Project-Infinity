const STORAGE_KEY = 'aais-settings';

export const defaultSettings = {
  theme: 'dark',
  notifications: false,
  autoSave: true,
  apiUrl: '',
  defaultModel: 'auto',
  defaultTemperature: 0.7,
  defaultMaxLength: 512,
};

function readWindowOrigin() {
  if (typeof window === 'undefined') {
    return '';
  }
  return String(window.location.origin || '').replace(/\/+$/, '');
}

export function getApiBaseUrlCandidates(selectedUrl) {
  const selected = String(selectedUrl || '').trim().replace(/\/+$/, '');
  const origin = readWindowOrigin();
  return [...new Set([
    selected,
    origin,
    'http://127.0.0.1:8000',
    'http://localhost:8000',
  ].filter(Boolean))];
}

function normalizeSettings(value) {
  const next = { ...defaultSettings, ...(value || {}) };
  next.theme = String(next.theme || defaultSettings.theme);
  next.notifications = Boolean(next.notifications);
  next.autoSave = Boolean(next.autoSave);
  next.apiUrl = String(next.apiUrl || '').trim();
  next.defaultModel = String(next.defaultModel || defaultSettings.defaultModel);
  next.defaultTemperature = Number(next.defaultTemperature);
  if (!Number.isFinite(next.defaultTemperature)) {
    next.defaultTemperature = defaultSettings.defaultTemperature;
  }
  next.defaultMaxLength = Number(next.defaultMaxLength);
  if (!Number.isFinite(next.defaultMaxLength)) {
    next.defaultMaxLength = defaultSettings.defaultMaxLength;
  }
  if (!next.apiUrl) {
    next.apiUrl = getApiBaseUrlCandidates()[0] || '';
  }
  return next;
}

export function getSettings() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return normalizeSettings(raw ? JSON.parse(raw) : {});
  } catch {
    return normalizeSettings({});
  }
}

export function saveSettings(settings) {
  const next = normalizeSettings(settings);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function resetSettings() {
  window.localStorage.removeItem(STORAGE_KEY);
  return saveSettings(defaultSettings);
}

export function getApiBaseUrl() {
  return getSettings().apiUrl || getApiBaseUrlCandidates()[0] || '';
}
