import React from 'react';
import { Link } from 'react-router-dom';
import TaskCards from './TaskCards';
import { CONFLICT_POLICIES } from '../lib/sovereignDispatch';
import { buildInlineCards } from '../lib/sovereignArtifacts';

/**
 * Mythic: Live artifact dock
 * Engineering: ArtifactPanel
 */
const TABS = [
  { id: 'tasks', label: 'Tasks' },
  { id: 'crm', label: 'CRM' },
  { id: 'graph', label: 'Graph' },
  { id: 'images', label: 'Images' },
  { id: 'mandala', label: 'Mandala' },
  { id: 'spreadsheet', label: 'Excel' },
  { id: 'notes', label: 'Notes' },
  { id: 'summaries', label: 'Summaries' },
];

function ArtifactPanel({
  artifacts,
  result,
  activeTab,
  onTabChange,
  conflictPolicy,
  onConflictPolicyChange,
  onSyncGraph,
  syncing,
}) {
  const cards = buildInlineCards(result).filter((c) => {
    if (activeTab === 'tasks') return c.type === 'aais';
    if (activeTab === 'crm') return c.type === 'crm';
    if (activeTab === 'graph') return c.type === 'graph';
    if (activeTab === 'images') return c.type === 'image';
    if (activeTab === 'mandala') return c.type === 'mandala';
    if (activeTab === 'spreadsheet') return c.type === 'spreadsheet';
    return false;
  });

  return (
    <aside className="sovereign-artifacts" data-testid="sovereign-artifact-panel">
      <header className="sovereign-artifacts__head">
        <p className="sovereign-kicker">Artifacts</p>
        <h2>Live output</h2>
      </header>

      <div className="sovereign-artifacts__sync" data-testid="sovereign-conflict-policy">
        <label htmlFor="sovereign-conflict">
          Graph sync conflict
          <select
            id="sovereign-conflict"
            value={conflictPolicy}
            onChange={(e) => onConflictPolicyChange?.(e.target.value)}
          >
            {CONFLICT_POLICIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <button type="button" disabled={syncing} onClick={() => onSyncGraph?.()}>
          {syncing ? 'Syncing…' : 'Sync from Graph'}
        </button>
      </div>

      <div className="sovereign-artifacts__tabs" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={activeTab === tab.id ? 'is-active' : ''}
            onClick={() => onTabChange?.(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="sovereign-artifacts__body" role="tabpanel">
        {['tasks', 'crm', 'graph', 'images', 'mandala', 'spreadsheet'].includes(activeTab) ? (
          cards.length ? (
            <TaskCards cards={cards} />
          ) : (
            <p className="sovereign-muted">No {activeTab} artifacts yet.</p>
          )
        ) : null}

        {activeTab === 'notes' ? (
          <ul>
            {(artifacts?.notes || []).length === 0 ? (
              <li className="sovereign-muted">No notes.</li>
            ) : (
              artifacts.notes.map((n, i) => (
                <li key={i}>
                  <strong>{n.provider || 'note'}</strong>
                  <p>{n.text}</p>
                </li>
              ))
            )}
          </ul>
        ) : null}

        {activeTab === 'summaries' ? (
          <ul>
            {(artifacts?.summaries || []).length === 0 ? (
              <li className="sovereign-muted">No summaries.</li>
            ) : (
              artifacts.summaries.map((s, i) => (
                <li key={i}>{s.text}</li>
              ))
            )}
          </ul>
        ) : null}

        {activeTab === 'mandala' ? (
          <p>
            <Link to="/adaptive-music">Open Adaptive Music / Mandala</Link>
          </p>
        ) : null}
      </div>
    </aside>
  );
}

export default ArtifactPanel;
