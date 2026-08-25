/**
 * Scaffold: MiddlewareTab
 * Mythic: Middleware trust panel · Engineering: MiddlewareTab
 * Progressive disclosure — Console surface, not calm Chat default.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import type { MiddlewareProviderStatus } from '../../../types/aais';

export interface MiddlewareTabProps {
  providerStatus: Record<string, MiddlewareProviderStatus> | null;
  telemetryPath?: string;
}

function MiddlewareTab({
  providerStatus,
  telemetryPath = '/sovereign/telemetry',
}: MiddlewareTabProps): React.ReactElement {
  return (
    <section className="sovereign-settings" data-testid="sovereign-middleware-panel" data-scaffold="MiddlewareTab">
      <h2>Middleware trust</h2>
      <p className="sovereign-muted">
        Hidden from the calm chat default — open only when you need provider health.
      </p>
      <ul className="sovereign-status-list">
        {Object.entries(providerStatus || {}).map(([key, row]) => (
          <li key={key}>
            <span>{key}</span>
            <span className={`sovereign-badge sovereign-badge--${row?.mode || 'simulate'}`}>
              {row?.connected ? 'live' : row?.mode || 'simulate'}
            </span>
          </li>
        ))}
      </ul>
      <div className="sovereign-settings__links">
        <Link to="/task-bus">Task Bus console</Link>
        <Link to={telemetryPath}>Open telemetry</Link>
      </div>
    </section>
  );
}

export default MiddlewareTab;
