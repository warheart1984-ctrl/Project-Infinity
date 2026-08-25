/**
 * Mythic: Provider lane strip (progressive disclosure)
 * Engineering: ProviderLanes — telemetry, not primary chat chrome
 */
import React from 'react';
import type { ProviderLaneEvent, TaskBusDispatchResult } from '../../../types/aais';

export interface ToolLoopRow {
  provider?: string;
  lane?: string;
  rounds: unknown[];
}

export interface ProviderLanesProps {
  result: TaskBusDispatchResult | null | undefined;
  toolLoops?: ToolLoopRow[];
  /** When false, render collapsed summary only */
  expanded?: boolean;
  onToggle?: () => void;
}

function ProviderLanes({
  result,
  toolLoops = [],
  expanded = false,
  onToggle,
}: ProviderLanesProps): React.ReactElement {
  const events: ProviderLaneEvent[] = result?.trace?.events || [];
  const lanePlan = result?.lanePlan || result?.lane_plan || [];
  const errCount = events.filter((e) => Boolean(e.error)).length;

  return (
    <section className="sovereign-lanes" data-testid="sovereign-provider-lanes">
      <header className="sovereign-telemetry__head">
        <h3>Provider lanes</h3>
        {onToggle ? (
          <button type="button" className="sovereign-ghost-btn" onClick={onToggle}>
            {expanded ? 'Collapse' : 'Expand'}
          </button>
        ) : null}
      </header>
      <p className="sovereign-muted" data-testid="sovereign-lanes-summary">
        {events.length} call(s)
        {errCount ? ` · ${errCount} error(s)` : ''}
        {lanePlan.length ? ` · ${lanePlan.length} planned` : ''}
        {toolLoops.length ? ` · ${toolLoops.length} toolLoop(s)` : ''}
      </p>
      {!expanded ? null : (
        <>
          {lanePlan.length ? (
            <ul className="sovereign-lanes__plan">
              {lanePlan.map((row) => (
                <li key={String(row.provider)}>
                  <strong>{row.provider}</strong>
                  {' — '}
                  {row.allowed ? 'allowed' : 'denied'}
                  {row.reasonCode || row.reason_code
                    ? ` (${row.reasonCode || row.reason_code})`
                    : ''}
                </li>
              ))}
            </ul>
          ) : null}
          {events.length === 0 && !toolLoops.length ? (
            <p className="sovereign-muted">No lane calls yet.</p>
          ) : null}
          <ul className="sovereign-lanes__events">
            {events.map((e) => {
              const latency = e.latencyMs ?? e.latency_ms ?? e.durationMs;
              const loop = e.output?.toolLoop || e.output?.tool_loop;
              return (
                <li key={e.id || `${e.provider}-${e.timestamp}`}>
                  <strong>{e.provider}</strong>
                  {e.lane ? ` / ${e.lane}` : ''}
                  {e.error ? <span className="sovereign-error"> · err</span> : <span> · ok</span>}
                  {latency != null ? (
                    <span className="sovereign-muted"> · {latency}ms</span>
                  ) : null}
                  {e.timestamp ? <div className="sovereign-muted">{e.timestamp}</div> : null}
                  {e.error ? <p className="sovereign-error">{e.error}</p> : null}
                  {Array.isArray(loop) && loop.length ? (
                    <details>
                      <summary>toolLoop ({loop.length})</summary>
                      <pre>{JSON.stringify(loop, null, 2)}</pre>
                    </details>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {toolLoops.map((loop, i) => (
            <details key={`loop-${i}`} open={i === 0}>
              <summary>
                toolLoop · {loop.provider}
                {loop.lane ? ` / ${loop.lane}` : ''} ({loop.rounds?.length || 0})
              </summary>
              <pre>{JSON.stringify(loop.rounds, null, 2)}</pre>
            </details>
          ))}
        </>
      )}
    </section>
  );
}

export default ProviderLanes;
