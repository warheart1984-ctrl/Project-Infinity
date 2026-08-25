/**
 * Scratch capture inbox — low-friction unfinished thoughts.
 * Promote: mentioned → intended → authorized (Task-Bus) without nagging.
 */

import type { IntentAuthorityClass, ScratchCaptureItem } from '../../../types/aais';

const SCRATCH_KEY = 'sovereign-scratch-inbox';

function newId(): string {
  return `scratch_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function loadScratchInbox(): ScratchCaptureItem[] {
  try {
    const raw = JSON.parse(localStorage.getItem(SCRATCH_KEY) || '[]');
    return Array.isArray(raw) ? (raw as ScratchCaptureItem[]) : [];
  } catch {
    return [];
  }
}

export function saveScratchInbox(items: ScratchCaptureItem[]): ScratchCaptureItem[] {
  const next = items.slice(0, 100);
  localStorage.setItem(SCRATCH_KEY, JSON.stringify(next));
  return next;
}

export function addScratchCapture(
  text: string,
  opts?: { sourceMessageId?: string; authority?: IntentAuthorityClass },
): ScratchCaptureItem {
  const item: ScratchCaptureItem = {
    id: newId(),
    text: String(text || '').trim().slice(0, 2000),
    createdAt: new Date().toISOString(),
    authority: opts?.authority || 'mentioned',
    sourceMessageId: opts?.sourceMessageId,
  };
  if (!item.text) return item;
  const list = loadScratchInbox();
  saveScratchInbox([item, ...list]);
  return item;
}

export function updateScratchAuthority(
  id: string,
  authority: IntentAuthorityClass,
  promotedTaskId?: string,
): ScratchCaptureItem | null {
  const list = loadScratchInbox();
  const next = list.map((row) =>
    (row.id === id
      ? { ...row, authority, promotedTaskId: promotedTaskId || row.promotedTaskId }
      : row),
  );
  saveScratchInbox(next);
  return next.find((r) => r.id === id) || null;
}

export function removeScratchCapture(id: string): void {
  saveScratchInbox(loadScratchInbox().filter((r) => r.id !== id));
}

export { SCRATCH_KEY };
