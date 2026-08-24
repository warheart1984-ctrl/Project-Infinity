const STORAGE_KEY = 'aais-history';

function readEntries() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeEntries(entries) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

export function getHistoryEntries() {
  return readEntries();
}

export function addHistoryEntry(entry) {
  const next = [
    {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      ...entry,
    },
    ...readEntries(),
  ].slice(0, 60);
  writeEntries(next);
  return next;
}

export function deleteHistoryEntry(id) {
  const next = readEntries().filter((entry) => entry.id !== id);
  writeEntries(next);
  return next;
}

export function clearHistoryEntries() {
  writeEntries([]);
  return [];
}
