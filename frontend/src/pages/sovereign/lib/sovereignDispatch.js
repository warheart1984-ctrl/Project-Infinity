/**
 * Mythic: Sovereign Assistant ingress
 * Engineering: mapOperatorAskToTaskBusPayload
 *
 * Thin wrapper: operator natural language → TaskSkillsRequest-shaped body
 * for POST /api/jarvis/task-bus/dispatch.
 */

const STORAGE_CONFLICT = 'aais-graph-sync-conflict-policy';
const STORAGE_FORCE_DEMO = 'sovereign-assistant-force-demo';

export const VISUAL_CREATION_COMPLETE_TOKEN =
  'render visual generate image picture perfection no upgrade no fixes create what is described';

/**
 * Detect visual-intelligence handoff token (suffix, case-insensitive).
 * Strips token from body — never show raw token to operator.
 * @param {string} text
 * @returns {{ matched: boolean, body: string, intent?: object, pictures?: object[] }}
 */
export function parseVisualIntelligenceHandoff(text) {
  const normalized = String(text || '').trim();
  const lower = normalized.toLowerCase();
  const tokenLower = VISUAL_CREATION_COMPLETE_TOKEN.toLowerCase();
  if (!lower.endsWith(tokenLower)) {
    return { matched: false, body: normalized };
  }
  const body = normalized
    .slice(0, normalized.length - VISUAL_CREATION_COMPLETE_TOKEN.length)
    .trim();
  if (!body) {
    return { matched: false, body: normalized };
  }
  const pictureId = `vi-${Date.now().toString(36)}`;
  return {
    matched: true,
    body,
    intent: {
      raw: body,
      type: 'picture',
      tags: ['visual_intelligence', 'authorized'],
    },
    pictures: [
      {
        id: pictureId,
        action: 'make_picture',
        target: body,
        engine: 'aais_image',
        params: { source: 'visual_intelligence_handoff' },
      },
    ],
  };
}

export const CONFLICT_POLICIES = ['prefer_aais', 'prefer_graph', 'report'];

export function getConflictPolicy() {
  const raw = String(localStorage.getItem(STORAGE_CONFLICT) || 'report').trim();
  return CONFLICT_POLICIES.includes(raw) ? raw : 'report';
}

export function setConflictPolicy(policy) {
  const next = CONFLICT_POLICIES.includes(policy) ? policy : 'report';
  localStorage.setItem(STORAGE_CONFLICT, next);
  return next;
}

export function getForceDemoDefault() {
  const raw = localStorage.getItem(STORAGE_FORCE_DEMO);
  if (raw === null) return true;
  return raw === '1' || raw === 'true';
}

export function setForceDemoDefault(value) {
  localStorage.setItem(STORAGE_FORCE_DEMO, value ? '1' : '0');
}

/**
 * Heuristic: follow-up / CRM / Microsoft sync cues for multi-provider create.
 * @param {string} text
 */
export function inferTaskHints(text) {
  const raw = String(text || '').toLowerCase();
  const tags = [];
  if (/\bcrm\b|follow[- ]?up|lead|sarah|contact/.test(raw)) tags.push('crm');
  if (/microsoft|graph|outlook|to[- ]?do|sync/.test(raw)) tags.push('graph');
  if (/mandala|synesthes/.test(raw)) tags.push('mandala');
  if (/image|picture|render|storyboard/.test(raw)) tags.push('picture');
  if (/excel|spreadsheet|workbook/.test(raw)) tags.push('spreadsheet');

  const syncGraph = /microsoft|graph|outlook|sync/.test(raw);
  const dueMatch = raw.match(/\b(tomorrow|today|next week|monday|tuesday|wednesday|thursday|friday)\b/);
  let dueDate;
  if (dueMatch) {
    const d = new Date();
    if (dueMatch[1] === 'tomorrow') d.setDate(d.getDate() + 1);
    else if (dueMatch[1] === 'next week') d.setDate(d.getDate() + 7);
    dueDate = d.toISOString().slice(0, 10);
  }

  return { tags: [...new Set(tags)], syncGraph, dueDate };
}

/**
 * Build dispatch body for the constitutional task bus.
 * @param {string} ask
 * @param {{ forceDemo?: boolean, riskLevel?: string, sessionId?: string, conflictPolicy?: string }} [opts]
 */
export function mapOperatorAskToTaskBusPayload(ask, opts = {}) {
  const handoff = parseVisualIntelligenceHandoff(ask);
  const text = handoff.matched ? handoff.body : String(ask || '').trim();
  const forceDemo = opts.forceDemo ?? getForceDemoDefault();
  const riskLevel = opts.riskLevel || 'normal';
  const hints = inferTaskHints(text);
  const wantsTask =
    !handoff.matched &&
    /task|todo|to-do|follow[- ]?up|remind|schedule|sync|crm|microsoft/.test(
      text.toLowerCase(),
    );

  const payload = {
    intent: handoff.matched ? handoff.intent : text,
    text,
    context: { user: 'operator', session: opts.sessionId || 'sovereign-assistant' },
    policy: { riskLevel },
    forceDemo,
    force_demo: forceDemo,
  };

  if (handoff.matched && handoff.pictures?.length) {
    payload.pictures = handoff.pictures;
  }

  if (wantsTask || hints.tags.includes('crm') || hints.syncGraph) {
    payload.tasks = [
      {
        id: 't1',
        action: 'create',
        target: text.slice(0, 500),
        constraints: {
          tags: hints.tags,
          syncGraph: hints.syncGraph,
          dueDate: hints.dueDate,
          conflictPolicy: opts.conflictPolicy || getConflictPolicy(),
        },
      },
    ];
  }

  return payload;
}

/**
 * Parse leading slash command from input.
 * @param {string} raw
 * @returns {{ command: string|null, arg: string, rest: string }}
 */
export function parseSlashCommand(raw) {
  const text = String(raw || '').trim();
  const match = text.match(/^\/([a-zA-Z_-]+)(?:\s+(.*))?$/s);
  if (!match) return { command: null, arg: '', rest: text };
  return {
    command: match[1].toLowerCase(),
    arg: String(match[2] || '').trim(),
    rest: String(match[2] || '').trim(),
  };
}

export const SLASH_HELP = [
  '/task <text> — authorize Task-Bus create/dispatch',
  '/crm <text> — CRM-tagged follow-up via Task-Bus',
  '/render <brief> — picture/render lane via Task-Bus',
  '/capture <text> — low-friction scratch capture',
  '/demo — force demo dispatch (no live vendor calls)',
  '/live — allow live provider calls when credentials exist',
  '/skills — open skill-store panel',
  '/skill <id> [args…] — invoke skill-store entry',
  '/sync — sync AAIS Tasks from Microsoft Graph (uses conflict policy)',
  '/conflict prefer_aais|prefer_graph|report — set Graph sync conflict policy',
  '/replay [traceId] — reload cached task-bus trace',
  '/telemetry — open lanes / replay deep link',
  '/console — civilizational control console (middleware + lanes)',
  '/dashboard — energy flow + telemetry dashboard',
  '/socket — toggle live WebSocket lane (env-configured)',
  '/help — show commands',
];
