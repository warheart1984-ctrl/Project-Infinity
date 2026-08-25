import React, { useState } from 'react';
import type { CommitmentCandidate, IntentAuthorityClass, ScratchCaptureItem } from '../../../types/aais';
import { AUTHORITY_LABELS } from '../lib/commitmentExtract';

/**
 * Scratch inbox + commitment promote affordances.
 * Capture without organizing; later promote mention → intent → authorize.
 */
function ScratchInbox({
  items,
  candidates,
  onCapture,
  onPromote,
  onAuthorize,
  onKeepNote,
  onRemove,
}: {
  items: ScratchCaptureItem[];
  candidates?: CommitmentCandidate[];
  onCapture: (text: string) => void;
  onPromote: (id: string, authority: IntentAuthorityClass) => void;
  onAuthorize: (text: string, sourceId?: string) => void;
  onKeepNote: (text: string, sourceMessageId?: string) => void;
  onRemove: (id: string) => void;
}) {
  const [draft, setDraft] = useState('');

  return (
    <section className="sovereign-scratch" data-testid="sovereign-scratch-inbox">
      <header>
        <h2>Scratch capture</h2>
        <p className="sovereign-muted">
          Unfinished thoughts land here without forced organization. Promote when ready —
          architecture remembers state so you do not have to. (Prefs help accessibility;
          real user testing still required.)
        </p>
      </header>

      <form
        className="sovereign-scratch__form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!draft.trim()) return;
          onCapture(draft.trim());
          setDraft('');
        }}
      >
        <label htmlFor="sovereign-scratch-input" className="visually-hidden">
          Scratch thought
        </label>
        <input
          id="sovereign-scratch-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Capture without organizing…"
        />
        <button type="submit" disabled={!draft.trim()}>
          Capture
        </button>
      </form>

      {candidates && candidates.length > 0 ? (
        <div className="sovereign-scratch__candidates" data-testid="sovereign-commitment-offer">
          <h3>Possible commitments</h3>
          <p className="sovereign-muted">Heuristic offer only — not a classified intent.</p>
          <ul>
            {candidates.map((c) => (
              <li key={c.id}>
                <p>{c.text}</p>
                <p className="sovereign-muted">
                  Suggested: {AUTHORITY_LABELS[c.suggestedAuthority]} · conf {c.confidence}
                </p>
                <div className="sovereign-scratch__row-actions">
                  <button type="button" className="sovereign-ghost-btn" onClick={() => onKeepNote(c.text, c.sourceMessageId)}>
                    Keep as note
                  </button>
                  <button type="button" className="sovereign-ghost-btn" onClick={() => onPromote(c.id, 'intended')}>
                    Promote to task
                  </button>
                  <button type="button" onClick={() => onAuthorize(c.text, c.sourceMessageId)}>
                    Authorize execute
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <ul className="sovereign-scratch__list">
        {items.length === 0 ? <li className="sovereign-muted">Inbox empty.</li> : null}
        {items.map((item) => (
          <li key={item.id}>
            <p>{item.text}</p>
            <p className="sovereign-muted">{AUTHORITY_LABELS[item.authority]}</p>
            <div className="sovereign-scratch__row-actions">
              {item.authority === 'mentioned' ? (
                <button type="button" className="sovereign-ghost-btn" onClick={() => onPromote(item.id, 'intended')}>
                  Mark intent
                </button>
              ) : null}
              {item.authority !== 'authorized' ? (
                <button type="button" onClick={() => onAuthorize(item.text, item.id)}>
                  Authorize → Task-Bus
                </button>
              ) : (
                <span className="sovereign-badge">Authorized{item.promotedTaskId ? ` · ${item.promotedTaskId}` : ''}</span>
              )}
              <button type="button" className="sovereign-ghost-btn" onClick={() => onRemove(item.id)}>
                Remove
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default ScratchInbox;
