import React from 'react';
import type { SessionPosture } from '../../../types/aais';

/**
 * Focus view — one conversation objective + one next action (calm default).
 */
function FocusView({
  posture,
  onContinue,
  onCapture,
}: {
  posture: SessionPosture | null;
  onContinue?: () => void;
  onCapture?: () => void;
}) {
  if (!posture) {
    return (
      <section className="sovereign-focus" data-testid="sovereign-focus-view">
        <p className="sovereign-kicker">Focus</p>
        <h2>One objective</h2>
        <p className="sovereign-muted">State what you want next. Everything else stays out of the way.</p>
      </section>
    );
  }

  return (
    <section className="sovereign-focus" data-testid="sovereign-focus-view">
      <p className="sovereign-kicker">Focus</p>
      <h2>Active objective</h2>
      <p className="sovereign-focus__objective">{posture.activeObjective}</p>
      <p className="sovereign-muted">
        <strong>Next:</strong> {posture.nextSuggestion}
      </p>
      <div className="sovereign-focus__actions">
        <button type="button" onClick={onContinue}>
          Continue
        </button>
        <button type="button" className="sovereign-ghost-btn" onClick={onCapture}>
          Scratch capture
        </button>
      </div>
    </section>
  );
}

export default FocusView;
