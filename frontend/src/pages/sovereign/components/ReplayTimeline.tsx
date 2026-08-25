/**
 * Mythic: Evidence replay strip (progressive disclosure)
 * Engineering: ReplayTimeline — provenance behind expand for technical operators
 */
import React from 'react';
import { Link } from 'react-router-dom';
import type { EmbeddingMeta, TaskBusDispatchResult } from '../../../types/aais';

export interface ReplayTimelineProps {
  result: TaskBusDispatchResult | null | undefined;
  embeddingMeta?: EmbeddingMeta | null;
  expanded?: boolean;
  onToggle?: () => void;
  onReplay?: (traceId: string) => void;
  /** Originating chat message for this execution */
  messageId?: string;
}

function ReplayTimeline({
  result,
  embeddingMeta,
  expanded = false,
  onToggle,
  onReplay,
  messageId,
}: ReplayTimelineProps): React.ReactElement {
  const evidence = result?.trace?.evidence || [];
  const decisions =
    result?.trace?.decisionEvents
    || result?.trace?.decision_events
    || result?.decision_events
    || result?.decisionEvents
    || [];
  const traceId = result?.traceId || result?.trace_id;
  const requestId = result?.requestId || result?.request_id;
  const boundMessageId = messageId || result?.messageId;
  const deepReplay =
    result?.deepLinks?.temporalReplay
    || result?.deep_links?.temporalReplay
    || result?.deep_links?.temporal_replay;

  return (
    <section className="sovereign-replay" data-testid="sovereign-replay-timeline">
      <header className="sovereign-telemetry__head">
        <h3>Replay timeline</h3>
        {onToggle ? (
          <button type="button" className="sovereign-ghost-btn" onClick={onToggle}>
            {expanded ? 'Collapse' : 'Expand'}
          </button>
        ) : null}
      </header>

      <p className="sovereign-muted" data-testid="sovereign-replay-summary">
        {traceId ? (
          <>
            Trace <code>{traceId}</code>
            {boundMessageId ? (
              <>
                {' · msg '}
                <code>{boundMessageId}</code>
              </>
            ) : null}
            {requestId ? (
              <>
                {' · req '}
                <code>{String(requestId).slice(0, 16)}</code>
              </>
            ) : null}
          </>
        ) : (
          'No trace yet.'
        )}
      </p>

      {!expanded ? null : (
        <>
          {traceId ? (
            <div className="sovereign-replay__actions">
              <button type="button" onClick={() => onReplay?.(traceId)}>
                Reload trace
              </button>
              {deepReplay ? <Link to={deepReplay}>Temporal replay</Link> : null}
            </div>
          ) : null}

          {embeddingMeta ? (
            <div className="sovereign-replay__embed" data-testid="sovereign-embedding-meta">
              <strong>intent_classified.embedding</strong>
              <pre>{JSON.stringify(embeddingMeta, null, 2)}</pre>
            </div>
          ) : null}

          <h4>Evidence</h4>
          <ol>
            {evidence.length === 0 ? <li className="sovereign-muted">—</li> : null}
            {evidence.map((e) => (
              <li key={e.id || e.justification}>
                <code>{String(e.id || '').slice(0, 20)}</code>
                {' — '}
                {e.provider}: {e.justification}
                {e.metadata?.embedding ? (
                  <details>
                    <summary>embedding</summary>
                    <pre>{JSON.stringify(e.metadata.embedding, null, 2)}</pre>
                  </details>
                ) : null}
              </li>
            ))}
          </ol>

          <h4>Decision events</h4>
          <ol>
            {decisions.length === 0 ? <li className="sovereign-muted">—</li> : null}
            {decisions.map((d, i) => (
              <li key={`${d.event || 'evt'}-${i}`}>
                <strong>{d.event || 'event'}</strong>
                {d.reasonCode || d.reason_code
                  ? ` · ${d.reasonCode || d.reason_code}`
                  : ''}
                {d.event === 'intent_classified' && d.embedding ? (
                  <details>
                    <summary>embedding</summary>
                    <pre>{JSON.stringify(d.embedding, null, 2)}</pre>
                  </details>
                ) : null}
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}

export default ReplayTimeline;
