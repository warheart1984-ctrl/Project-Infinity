import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_COGNITIVE_PREFS,
  loadCognitivePrefs,
  normalizeCognitivePrefs,
  saveCognitivePrefs,
  PREFS_KEY,
} from './sovereignPrefs';
import {
  buildSessionPosture,
  loadSessionPosture,
  saveSessionPosture,
  POSTURE_KEY,
} from './sessionPosture';
import {
  addScratchCapture,
  loadScratchInbox,
  updateScratchAuthority,
  SCRATCH_KEY,
} from './scratchCapture';
import {
  extractCommitmentCandidates,
  suggestAuthorityFromText,
} from './commitmentExtract';

describe('sovereignPrefs', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults to calm / reduced / minimal', () => {
    expect(loadCognitivePrefs()).toEqual(DEFAULT_COGNITIVE_PREFS);
    expect(DEFAULT_COGNITIVE_PREFS.focusView).toBe(true);
  });

  it('persists and normalizes prefs', () => {
    const saved = saveCognitivePrefs({ density: 'dense', animation: 'off' });
    expect(saved.density).toBe('dense');
    expect(saved.animation).toBe('off');
    expect(JSON.parse(localStorage.getItem(PREFS_KEY) || '{}').density).toBe('dense');
    expect(normalizeCognitivePrefs({ density: 'nope' }).density).toBe('calm');
  });
});

describe('sessionPosture Where-was-I', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('reconstructs objective / outcome / next without dumping chat', () => {
    const posture = buildSessionPosture({
      conversationId: 'conv_1',
      messages: [
        { id: 'm1', role: 'user', text: 'Follow up Sarah tomorrow', createdAt: 't1' },
        {
          id: 'm2',
          role: 'assistant',
          text: 'Dispatch complete · AAIS tasks: 1',
          createdAt: 't2',
          traceId: 'trace_x',
          replyToMessageId: 'm1',
        },
      ],
      lastResult: { ok: true, traceId: 'trace_x', messageId: 'm1' },
      panel: 'chat',
    });
    expect(posture.activeObjective).toMatch(/Sarah/);
    expect(posture.lastActionOutcome).toBe('ok');
    expect(posture.nextSuggestion).toMatch(/Review artifacts/i);
    expect(posture.lastTraceId).toBe('trace_x');
    saveSessionPosture(posture);
    expect(loadSessionPosture()?.conversationId).toBe('conv_1');
    expect(localStorage.getItem(POSTURE_KEY)).toBeTruthy();
  });
});

describe('scratchCapture → promote', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('captures as mentioned and promotes authority ladder', () => {
    const item = addScratchCapture('call the vendor Friday', { authority: 'mentioned' });
    expect(item.authority).toBe('mentioned');
    expect(loadScratchInbox()).toHaveLength(1);
    updateScratchAuthority(item.id, 'intended');
    expect(loadScratchInbox()[0].authority).toBe('intended');
    updateScratchAuthority(item.id, 'authorized', 'task_99');
    expect(loadScratchInbox()[0].promotedTaskId).toBe('task_99');
    expect(localStorage.getItem(SCRATCH_KEY)).toBeTruthy();
  });
});

describe('commitmentExtract', () => {
  it('suggests authority without claiming certainty', () => {
    expect(suggestAuthorityFromText('maybe think about vendors')).toBe('mentioned');
    expect(suggestAuthorityFromText('Make a follow-up task for Sarah tomorrow')).toBe('intended');
    expect(suggestAuthorityFromText('authorize execute the sync now')).toBe('authorized');
  });

  it('extracts candidates from user messages', () => {
    const cands = extractCommitmentCandidates([
      {
        id: 'u1',
        role: 'user',
        text: 'Make a follow-up task for Sarah tomorrow and sync it to Microsoft.',
        createdAt: 't',
      },
    ]);
    expect(cands.length).toBeGreaterThan(0);
    expect(cands[0].suggestedAuthority).toBe('intended');
    expect(cands[0].confidence).toBe('medium');
  });
});
