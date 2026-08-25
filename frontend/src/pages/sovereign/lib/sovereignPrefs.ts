/**
 * Cognitive-load / stimulation prefs — stable defaults, deep customization.
 * Architecture enables accessibility; real user testing still required.
 */

import {
  DEFAULT_COGNITIVE_PREFS,
  type SovereignCognitivePrefs,
  type StimulationDensity,
  type AnimationLevel,
  type VisualComplexity,
  type NotificationLevel,
} from '../../../types/aais';

const PREFS_KEY = 'sovereign-cognitive-prefs';

function isDensity(v: unknown): v is StimulationDensity {
  return v === 'calm' || v === 'balanced' || v === 'dense';
}
function isAnimation(v: unknown): v is AnimationLevel {
  return v === 'off' || v === 'reduced' || v === 'full';
}
function isVisual(v: unknown): v is VisualComplexity {
  return v === 'minimal' || v === 'standard' || v === 'rich';
}
function isNotify(v: unknown): v is NotificationLevel {
  return v === 'off' || v === 'essential' || v === 'all';
}

export function normalizeCognitivePrefs(
  raw: Partial<SovereignCognitivePrefs> | null | undefined,
): SovereignCognitivePrefs {
  const base = { ...DEFAULT_COGNITIVE_PREFS, ...(raw || {}) };
  return {
    density: isDensity(base.density) ? base.density : DEFAULT_COGNITIVE_PREFS.density,
    animation: isAnimation(base.animation) ? base.animation : DEFAULT_COGNITIVE_PREFS.animation,
    notifications: isNotify(base.notifications)
      ? base.notifications
      : DEFAULT_COGNITIVE_PREFS.notifications,
    visualComplexity: isVisual(base.visualComplexity)
      ? base.visualComplexity
      : DEFAULT_COGNITIVE_PREFS.visualComplexity,
    focusView: Boolean(base.focusView),
    showRecoveryStrip: Boolean(base.showRecoveryStrip),
    offerTaskExtraction: Boolean(base.offerTaskExtraction),
  };
}

export function loadCognitivePrefs(): SovereignCognitivePrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULT_COGNITIVE_PREFS };
    return normalizeCognitivePrefs(JSON.parse(raw) as Partial<SovereignCognitivePrefs>);
  } catch {
    return { ...DEFAULT_COGNITIVE_PREFS };
  }
}

export function saveCognitivePrefs(
  next: Partial<SovereignCognitivePrefs>,
): SovereignCognitivePrefs {
  const merged = normalizeCognitivePrefs({ ...loadCognitivePrefs(), ...next });
  localStorage.setItem(PREFS_KEY, JSON.stringify(merged));
  return merged;
}

/** Apply prefs as data attributes / CSS variables on a root element. */
export function applyCognitivePrefsToElement(
  el: HTMLElement | null,
  prefs: SovereignCognitivePrefs,
): void {
  if (!el) return;
  el.dataset.density = prefs.density;
  el.dataset.animation = prefs.animation;
  el.dataset.visual = prefs.visualComplexity;
  el.dataset.notifications = prefs.notifications;
  el.dataset.focus = prefs.focusView ? '1' : '0';
  el.style.setProperty(
    '--sovereign-motion',
    prefs.animation === 'off' ? '0s' : prefs.animation === 'reduced' ? '120ms' : '280ms',
  );
  el.style.setProperty(
    '--sovereign-gap',
    prefs.density === 'dense' ? '0.45rem' : prefs.density === 'balanced' ? '0.7rem' : '0.95rem',
  );
  el.style.setProperty(
    '--sovereign-chrome-opacity',
    prefs.visualComplexity === 'rich' ? '1' : prefs.visualComplexity === 'standard' ? '0.85' : '0.55',
  );
}

export { PREFS_KEY, DEFAULT_COGNITIVE_PREFS };
