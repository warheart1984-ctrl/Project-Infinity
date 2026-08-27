/**
 * Canonical bridge: conversational output ↔ actionable Task-Bus state.
 * Mythic: Sovereign ask lane · Engineering: useTaskBus
 */

import { useCallback, useMemo, useState } from 'react';
import {
  dispatchTaskBus,
  extractDispatchErrorPayload,
  fetchTaskBusTrace,
  getApiErrorMessage,
  syncAaisTasksFromGraph,
} from '../lib/aaisClient';
import {
  getConflictPolicy,
  mapOperatorAskToTaskBusPayload,
  parseVisualIntelligenceHandoff,
} from '../pages/sovereign/lib/sovereignDispatch';
import {
  buildInlineCards,
  extractSovereignArtifacts,
  normalizeDispatchResult,
  summarizeDispatchResult,
} from '../pages/sovereign/lib/sovereignArtifacts';
import type {
  ConflictPolicy,
  InlineCard,
  Message,
  SovereignArtifacts,
  TaskBusDispatchResult,
} from '../types/aais';

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function attachMessageId(
  result: TaskBusDispatchResult,
  messageId: string,
): TaskBusDispatchResult {
  return { ...result, messageId };
}

export interface UseTaskBusOptions {
  sessionId: string;
  forceDemo: boolean;
  conflictPolicy?: ConflictPolicy;
}

export interface DispatchOutcome {
  userMessage: Message;
  assistantMessage: Message;
  result: TaskBusDispatchResult | null;
  ok: boolean;
  errorMessage?: string;
}

export interface UseTaskBusResult {
  loading: boolean;
  syncing: boolean;
  lastResult: TaskBusDispatchResult | null;
  artifacts: SovereignArtifacts;
  cards: InlineCard[];
  dispatchAsk: (text: string) => Promise<DispatchOutcome>;
  replayTrace: (traceId: string, replyToMessageId?: string) => Promise<DispatchOutcome | null>;
  syncFromGraph: () => Promise<{ ok: boolean; summary: string }>;
  setLastResult: (result: TaskBusDispatchResult | null) => void;
}

export function useTaskBus(opts: UseTaskBusOptions): UseTaskBusResult {
  const { sessionId, forceDemo, conflictPolicy } = opts;
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastResult, setLastResult] = useState<TaskBusDispatchResult | null>(null);

  const artifacts = useMemo(
    () => extractSovereignArtifacts(lastResult) as SovereignArtifacts,
    [lastResult],
  );
  const cards = useMemo(() => buildInlineCards(lastResult) as InlineCard[], [lastResult]);

  const toAssistantMessage = useCallback(
    (
      result: TaskBusDispatchResult,
      replyToMessageId: string,
      error?: string,
    ): Message => {
      const normalized = normalizeDispatchResult(result) as TaskBusDispatchResult;
      return {
        id: newId('msg'),
        role: 'assistant',
        text: error || summarizeDispatchResult(normalized),
        createdAt: new Date().toISOString(),
        traceId: normalized.traceId || normalized.trace_id,
        requestId: normalized.requestId || normalized.request_id,
        replyToMessageId,
        cards: buildInlineCards(normalized) as InlineCard[],
        error,
        result: attachMessageId(normalized, replyToMessageId),
      };
    },
    [],
  );

  const dispatchAsk = useCallback(
    async (text: string): Promise<DispatchOutcome> => {
      const handoff = parseVisualIntelligenceHandoff(text);
      const displayText = handoff.matched ? handoff.body : text;
      const userMessage: Message = {
        id: newId('msg'),
        role: 'user',
        text: displayText,
        createdAt: new Date().toISOString(),
      };
      setLoading(true);
      try {
        const payload = mapOperatorAskToTaskBusPayload(text, {
          forceDemo,
          sessionId,
          conflictPolicy: conflictPolicy || getConflictPolicy(),
        });
        const raw = await dispatchTaskBus(payload);
        const result = attachMessageId(
          normalizeDispatchResult(raw) as TaskBusDispatchResult,
          userMessage.id,
        );
        setLastResult(result);
        const assistantMessage = toAssistantMessage(result, userMessage.id);
        return {
          userMessage,
          assistantMessage,
          result,
          ok: Boolean(result.ok),
        };
      } catch (error: unknown) {
        const partial = extractDispatchErrorPayload(error);
        if (partial) {
          const result = attachMessageId(
            normalizeDispatchResult(partial) as TaskBusDispatchResult,
            userMessage.id,
          );
          setLastResult(result);
          const errText = getApiErrorMessage(error, 'Dispatch failed.');
          const assistantMessage = toAssistantMessage(result, userMessage.id, errText);
          return {
            userMessage,
            assistantMessage,
            result,
            ok: false,
            errorMessage: errText,
          };
        }
        const errText = getApiErrorMessage(error, 'Dispatch failed.');
        const assistantMessage: Message = {
          id: newId('msg'),
          role: 'assistant',
          text: 'Dispatch failed.',
          createdAt: new Date().toISOString(),
          replyToMessageId: userMessage.id,
          error: errText,
          cards: [],
        };
        return {
          userMessage,
          assistantMessage,
          result: null,
          ok: false,
          errorMessage: errText,
        };
      } finally {
        setLoading(false);
      }
    },
    [conflictPolicy, forceDemo, sessionId, toAssistantMessage],
  );

  const replayTrace = useCallback(
    async (traceId: string, replyToMessageId?: string): Promise<DispatchOutcome | null> => {
      if (!traceId) return null;
      setLoading(true);
      try {
        const raw = await fetchTaskBusTrace(traceId);
        const originId = replyToMessageId || newId('replay');
        const result = attachMessageId(
          normalizeDispatchResult(raw) as TaskBusDispatchResult,
          originId,
        );
        setLastResult(result);
        const userMessage: Message = {
          id: originId,
          role: 'user',
          text: `Replay ${traceId}`,
          createdAt: new Date().toISOString(),
          traceId,
        };
        const assistantMessage = toAssistantMessage(result, originId);
        return { userMessage, assistantMessage, result, ok: Boolean(result.ok) };
      } catch (error: unknown) {
        throw error;
      } finally {
        setLoading(false);
      }
    },
    [toAssistantMessage],
  );

  const syncFromGraph = useCallback(async () => {
    setSyncing(true);
    try {
      const res = await syncAaisTasksFromGraph({
        forceDemo,
        conflictPolicy: conflictPolicy || getConflictPolicy(),
      });
      if (res.outcome === 'needs_auth') {
        return {
          ok: false,
          summary: res.activation_hint || 'Connect Microsoft 365 first',
        };
      }
      return {
        ok: true,
        summary: res.reason_code || res.outcome || 'Sync done',
      };
    } finally {
      setSyncing(false);
    }
  }, [conflictPolicy, forceDemo]);

  return {
    loading,
    syncing,
    lastResult,
    artifacts,
    cards,
    dispatchAsk,
    replayTrace,
    syncFromGraph,
    setLastResult,
  };
}

export default useTaskBus;

export { parseVisualIntelligenceHandoff };
