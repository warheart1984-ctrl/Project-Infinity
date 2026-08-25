import React from 'react';
import { Link } from 'react-router-dom';
import { pathForPanel } from '../lib/sovereignRoutes';

/**
 * Mythic: Sovereign nav rail
 * Engineering: SovereignSidebar — route-backed deep links
 */
const NAV = [
  { id: 'chat', label: 'Chat', panel: 'chat' },
  { id: 'console', label: 'Console', panel: 'console' },
  { id: 'dashboard', label: 'Dashboard', panel: 'dashboard' },
  { id: 'task-bus', label: 'Task-Bus', to: '/task-bus' },
  { id: 'crm', label: 'CRM', panel: 'crm' },
  { id: 'calendar', label: 'Calendar', to: '/operator/plugins' },
  { id: 'render', label: 'Render Engine', to: '/image-generator' },
  { id: 'settings', label: 'Settings', panel: 'settings' },
  { id: 'scratch', label: 'Scratch', panel: 'scratch' },
  { id: 'plugins', label: 'Plugins', panel: 'plugins' },
  { id: 'middleware', label: 'Middleware', panel: 'middleware' },
  { id: 'telemetry', label: 'Telemetry', panel: 'telemetry' },
];

function SovereignSidebar({
  conversations = [],
  activeConversationId,
  onSelectConversation,
  onNewConversation,
  activePanel,
  onSelectPanel,
  providerStatus,
  routeBase = '/sovereign',
}) {
  return (
    <aside className="sovereign-sidebar" data-testid="sovereign-sidebar">
      <div className="sovereign-sidebar__brand">
        <p className="sovereign-kicker">Sovereign Assistant</p>
        <h1>Infinity</h1>
        <p className="sovereign-sidebar__lede">Chat · Console · Dashboard</p>
      </div>

      <button type="button" className="sovereign-sidebar__new" onClick={onNewConversation}>
        New conversation
      </button>

      <nav className="sovereign-sidebar__nav" aria-label="Sovereign sections">
        {NAV.map((item) => {
          if (item.to) {
            return (
              <Link key={item.id} className="sovereign-sidebar__link" to={item.to}>
                {item.label}
              </Link>
            );
          }
          const to = pathForPanel(item.panel, routeBase);
          const isActive = activePanel === item.panel;
          return (
            <Link
              key={item.id}
              className={`sovereign-sidebar__link ${isActive ? 'is-active' : ''}`}
              to={to}
              onClick={(e) => {
                e.preventDefault();
                onSelectPanel?.(item.panel);
              }}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="sovereign-sidebar__section">
        <h2>Conversations</h2>
        <ul className="sovereign-sidebar__list">
          {conversations.length === 0 ? <li className="sovereign-muted">No threads yet</li> : null}
          {conversations.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className={`sovereign-sidebar__conv ${c.id === activeConversationId ? 'is-active' : ''}`}
                onClick={() => onSelectConversation?.(c.id)}
              >
                {c.title || 'Untitled'}
              </button>
            </li>
          ))}
        </ul>
      </div>

      {providerStatus ? (
        <div className="sovereign-sidebar__section" data-testid="sovereign-provider-status">
          <h2>Middleware</h2>
          <ul className="sovereign-status-list">
            {Object.entries(providerStatus).map(([key, row]) => (
              <li key={key}>
                <span>{key}</span>
                <span className={`sovereign-badge sovereign-badge--${row?.mode || (row?.connected ? 'live' : 'simulate')}`}>
                  {row?.connected ? 'live' : row?.mode || 'simulate'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </aside>
  );
}

export default SovereignSidebar;
