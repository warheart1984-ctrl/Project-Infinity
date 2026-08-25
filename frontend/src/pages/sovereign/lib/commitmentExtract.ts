/**
 * Heuristic commitment extraction — offers, never asserts certainty.
 * UI distinguishes mention / intent / authorize without fake classifier confidence.
 */

import type { CommitmentCandidate, IntentAuthorityClass, Message } from '../../../types/aais';

const ACTION_RE =
  /\b(make|create|schedule|follow[- ]?up|remind|send|sync|book|call|email|todo|task|need to|should|remember to)\b/i;

function newId(): string {
  return `commit_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Suggest authority class from wording only (stub classifier).
 * Does not claim backend IntentAuthorityClass truth.
 */
export function suggestAuthorityFromText(text: string): IntentAuthorityClass {
  const t = String(text || '').toLowerCase();
  if (/\b(authorize|execute|dispatch|do it now|confirm|go ahead)\b/.test(t)) {
    return 'authorized';
  }
  if (ACTION_RE.test(t) || /\b(tomorrow|next week|due|deadline)\b/.test(t)) {
    return 'intended';
  }
  return 'mentioned';
}

export function extractCommitmentCandidates(
  messages: Message[],
  limit = 3,
): CommitmentCandidate[] {
  const out: CommitmentCandidate[] = [];
  const recent = [...messages].reverse().slice(0, 12);
  for (const msg of recent) {
    if (msg.role !== 'user') continue;
    const text = String(msg.text || '').trim();
    if (text.length < 8 || text.startsWith('/')) continue;
    if (!ACTION_RE.test(text) && !/\b(tomorrow|follow[- ]?up|sync)\b/i.test(text)) {
      continue;
    }
    out.push({
      id: newId(),
      text: text.slice(0, 240),
      sourceMessageId: msg.id,
      suggestedAuthority: suggestAuthorityFromText(text),
      confidence: ACTION_RE.test(text) ? 'medium' : 'low',
    });
    if (out.length >= limit) break;
  }
  return out;
}

/** Authority ladder labels for UI copy (no clinical framing). */
export const AUTHORITY_LABELS: Record<IntentAuthorityClass, string> = {
  mentioned: 'Mention — keep as note',
  intended: 'Intent — promote to task draft',
  authorized: 'Authorize — dispatch on Task-Bus',
};
