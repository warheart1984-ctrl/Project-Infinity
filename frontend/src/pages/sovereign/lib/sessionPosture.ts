/**
 * External memory — “Where was I?”
 * Reconstructs last meaningful posture, not a chat history dump.
 */

import type {
  Message,
  SessionPosture,
  SovereignPanel,
  TaskBusDispatchResult,
} from '../../../types/aais';

const POSTURE_KEY = 'sovereign-session-posture';

export function loadSessionPosture(): SessionPosture | null {
  try {
    const raw = localStorage.getItem(POSTURE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SessionPosture;
    if (!parsed || typeof parsed.conversationId !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveSessionPosture(posture: SessionPosture): SessionPosture {
  localStorage.setItem(POSTURE_KEY, JSON.stringify(posture));
  return posture;
}

export function clearSessionPosture(): void {
  localStorage.removeItem(POSTURE_KEY);
}

/**
 * Derive compact posture from the latest turn + dispatch result.
 */
export function buildSessionPosture(input: {
  conversationId: string;
  messages: Message[];
  lastResult: TaskBusDispatchResult | null | undefined;
  panel?: SovereignPanel;
}): SessionPosture {
  const { conversationId, messages, lastResult, panel } = input;
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');

  let lastActionOutcome: SessionPosture['lastActionOutcome'] = 'idle';
  if (lastResult) {
    if (lastResult.ok === false && (lastResult.error || lastAssistant?.error)) {
      lastActionOutcome = 'error';
    } else if (lastResult.ok === false) {
      lastActionOutcome = 'denied';
    } else if (lastResult.ok) {
      lastActionOutcome = 'ok';
    } else {
      lastActionOutcome = 'partial';
    }
  }

  const activeObjective = String(lastUser?.text || 'No active objective').slice(0, 160);
  const lastActionSummary = String(
    lastAssistant?.text
    || (lastResult ? 'Task-bus dispatch completed' : 'No action yet'),
  ).slice(0, 220);

  let nextSuggestion = 'Continue the conversation, or capture a scratch thought.';
  if (lastActionOutcome === 'ok') {
    nextSuggestion = 'Review artifacts, or ask for the next step.';
  } else if (lastActionOutcome === 'denied' || lastActionOutcome === 'error') {
    nextSuggestion = 'Open Replay for evidence, or retry with /demo or /live.';
  } else if (!lastUser) {
    nextSuggestion = 'State one objective in the input, or open Scratch capture.';
  }

  return {
    conversationId,
    updatedAt: new Date().toISOString(),
    activeObjective,
    lastActionSummary,
    lastActionOutcome,
    nextSuggestion,
    lastTraceId: lastResult?.traceId || lastResult?.trace_id || lastAssistant?.traceId,
    lastMessageId: lastAssistant?.id || lastUser?.id,
    panel,
  };
}

export { POSTURE_KEY };
