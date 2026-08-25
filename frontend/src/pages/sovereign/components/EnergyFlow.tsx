/**
 * Scaffold: EnergyFlow
 * Mythic: provider energy arcs · Engineering: EnergyFlowViz
 *
 * Inputs: provider lane events / lane plan; animation pref
 * Outputs: SVG orbit + arcs (optional d3 enhancement via window.__AAIS_D3__ if present)
 * Constraints: only render when allowed; fail soft — no hard d3/three dependency
 * Failure modes: animation off → static nodes; missing optional lib → SVG only
 */
import React, { useMemo } from 'react';
import type { AnimationLevel, LanePlanRow, ProviderLaneEvent } from '../../../types/aais';

export interface EnergyFlowProps {
  events?: ProviderLaneEvent[];
  lanePlan?: LanePlanRow[];
  animation?: AnimationLevel;
  /** Gate: only show when Dashboard/telemetry + animation pref allows */
  enabled?: boolean;
}

interface NodePos {
  id: string;
  x: number;
  y: number;
}

const W = 420;
const H = 260;
const CX = W / 2;
const CY = H / 2;

function providersFrom(props: EnergyFlowProps): string[] {
  const names = new Set<string>();
  for (const row of props.lanePlan || []) {
    if (row.provider) names.add(String(row.provider));
  }
  for (const e of props.events || []) {
    if (e.provider) names.add(String(e.provider));
  }
  if (names.size === 0) {
    ['aais', 'crm', 'graph', 'adaptive'].forEach((n) => names.add(n));
  }
  return [...names].slice(0, 8);
}

function layoutNodes(ids: string[]): NodePos[] {
  const n = ids.length || 1;
  return ids.map((id, i) => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    const r = 88;
    return { id, x: CX + Math.cos(angle) * r, y: CY + Math.sin(angle) * r };
  });
}

/** Optional peer: set `window.__AAIS_D3__` after loading d3 yourself — never bundled. */
function optionalD3Present(): boolean {
  try {
    const w = window as Window & { __AAIS_D3__?: { select?: unknown } };
    return Boolean(w.__AAIS_D3__?.select);
  } catch {
    return false;
  }
}

function EnergyFlow({
  events = [],
  lanePlan = [],
  animation = 'reduced',
  enabled = true,
}: EnergyFlowProps): React.ReactElement | null {
  const allowMotion = enabled && animation !== 'off';
  const allowOrbit = enabled && animation === 'full';
  const nodes = useMemo(() => layoutNodes(providersFrom({ events, lanePlan })), [events, lanePlan]);
  const d3Hook = optionalD3Present();

  if (!enabled) return null;

  return (
    <section
      className={`sovereign-energy${allowOrbit ? ' sovereign-energy--orbit' : ''}${allowMotion ? '' : ' sovereign-energy--static'}`}
      data-testid="sovereign-energy-flow"
      data-scaffold="EnergyFlow"
      data-d3={d3Hook ? '1' : '0'}
      aria-label="Provider energy flow"
    >
      <header className="sovereign-telemetry__head">
        <h3>Energy flow</h3>
        <span className="sovereign-muted">
          {allowOrbit ? 'orbital' : allowMotion ? 'pulse' : 'static'}
          {d3Hook ? ' · d3 hook' : ' · svg'}
        </span>
      </header>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        className="sovereign-energy__svg"
        role="img"
      >
        <defs>
          <radialGradient id="energy-core" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(201, 162, 39, 0.35)" />
            <stop offset="100%" stopColor="rgba(12, 22, 40, 0)" />
          </radialGradient>
        </defs>
        <circle cx={CX} cy={CY} r={36} fill="url(#energy-core)" className="sovereign-energy__core" />
        <circle
          cx={CX}
          cy={CY}
          r={18}
          fill="rgba(201, 162, 39, 0.2)"
          stroke="rgba(201, 162, 39, 0.65)"
          strokeWidth={1}
        />
        {nodes.map((a, i) => {
          const b = nodes[(i + 1) % nodes.length];
          if (!b || nodes.length < 2) return null;
          const midX = (a.x + b.x) / 2;
          const midY = (a.y + b.y) / 2 - 20;
          return (
            <path
              key={`arc-${a.id}-${b.id}`}
              className="sovereign-energy__arc"
              d={`M${a.x},${a.y} Q${midX},${midY} ${b.x},${b.y}`}
              fill="none"
              stroke="rgba(201, 162, 39, 0.45)"
              strokeWidth={1.25}
            />
          );
        })}
        {nodes.map((n) => (
          <g key={n.id} className="sovereign-energy__node" transform={`translate(${n.x},${n.y})`}>
            <circle r={14} fill="rgba(18, 28, 48, 0.95)" stroke="rgba(201, 162, 39, 0.7)" strokeWidth={1.25} />
            <text
              textAnchor="middle"
              dy="0.35em"
              fill="rgba(232, 236, 242, 0.9)"
              fontSize={9}
              fontFamily="IBM Plex Sans, sans-serif"
            >
              {n.id.slice(0, 6)}
            </text>
          </g>
        ))}
      </svg>
      <p className="sovereign-muted">
        {events.length} lane event(s) · {lanePlan.length || nodes.length} provider node(s)
      </p>
    </section>
  );
}

export default EnergyFlow;
