import React from 'react';
import type { SovereignCognitivePrefs } from '../../../types/aais';

/**
 * User-controlled stimulation / density — not a labeled clinical mode.
 */
function StimulationPrefsPanel({
  prefs,
  onChange,
}: {
  prefs: SovereignCognitivePrefs;
  onChange: (patch: Partial<SovereignCognitivePrefs>) => void;
}) {
  return (
    <section className="sovereign-stim-prefs" data-testid="sovereign-stim-prefs">
      <h3>Cognitive load &amp; stimulation</h3>
      <p className="sovereign-muted">
        Stable calm defaults. Customize density and motion for yourself. The computer keeps
        session posture so interruption is recoverable — not a clinical “mode.”
      </p>

      <label>
        Density
        <select
          value={prefs.density}
          onChange={(e) => onChange({ density: e.target.value as SovereignCognitivePrefs['density'] })}
        >
          <option value="calm">Calm (default)</option>
          <option value="balanced">Balanced</option>
          <option value="dense">Dense</option>
        </select>
      </label>

      <label>
        Animation
        <select
          value={prefs.animation}
          onChange={(e) => onChange({ animation: e.target.value as SovereignCognitivePrefs['animation'] })}
        >
          <option value="off">Off</option>
          <option value="reduced">Reduced (default)</option>
          <option value="full">Full</option>
        </select>
      </label>

      <label>
        Visual complexity
        <select
          value={prefs.visualComplexity}
          onChange={(e) =>
            onChange({ visualComplexity: e.target.value as SovereignCognitivePrefs['visualComplexity'] })
          }
        >
          <option value="minimal">Minimal (default)</option>
          <option value="standard">Standard</option>
          <option value="rich">Rich</option>
        </select>
      </label>

      <label>
        Notifications
        <select
          value={prefs.notifications}
          onChange={(e) =>
            onChange({ notifications: e.target.value as SovereignCognitivePrefs['notifications'] })
          }
        >
          <option value="off">Off</option>
          <option value="essential">Essential (default)</option>
          <option value="all">All</option>
        </select>
      </label>

      <label className="sovereign-check">
        <input
          type="checkbox"
          checked={prefs.focusView}
          onChange={(e) => onChange({ focusView: e.target.checked })}
        />
        Focus view (one objective + next action)
      </label>
      <label className="sovereign-check">
        <input
          type="checkbox"
          checked={prefs.showRecoveryStrip}
          onChange={(e) => onChange({ showRecoveryStrip: e.target.checked })}
        />
        Show “Where was I?” on return
      </label>
      <label className="sovereign-check">
        <input
          type="checkbox"
          checked={prefs.offerTaskExtraction}
          onChange={(e) => onChange({ offerTaskExtraction: e.target.checked })}
        />
        Offer commitment → task extraction
      </label>
    </section>
  );
}

export default StimulationPrefsPanel;
