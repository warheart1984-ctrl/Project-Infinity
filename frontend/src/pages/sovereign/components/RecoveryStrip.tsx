import React from 'react';
import type { SessionPosture } from '../../../types/aais';

/**
 * Interruption recovery — what you were doing / what happened / what’s next.
 * No punishment for leaving and returning.
 */
function RecoveryStrip({
  posture,
  onDismiss,
  onReplay,
  onResume,
}: {
  posture: SessionPosture | null;
  onDismiss?: () => void;
  onReplay?: (traceId: string) => void;
  onResume?: () => void;
}) {
  if (!posture) return null;

  return (
    <aside className="sovereign-recovery" data-testid="sovereign-recovery-strip" role="status">
      <div className="sovereign-recovery__body">
        <p className="sovereign-kicker">Where was I?</p>
        <p>
          <strong>Doing:</strong> {posture.activeObjective}
        </p>
        <p className="sovereign-muted">
          <strong>Happened:</strong> [{posture.lastActionOutcome}] {posture.lastActionSummary}
        </p>
        <p>
          <strong>Next:</strong> {posture.nextSuggestion}
        </p>
      </div>
      <div className="sovereign-recovery__actions">
        <button type="button" onClick={onResume}>
          Resume
        </button>
        {posture.lastTraceId ? (
          <button
            type="button"
            className="sovereign-ghost-btn"
            onClick={() => onReplay?.(posture.lastTraceId!)}
          >
            Replay evidence
          </button>
        ) : null}
        <button type="button" className="sovereign-ghost-btn" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
    </aside>
  );
}

export default RecoveryStrip;
