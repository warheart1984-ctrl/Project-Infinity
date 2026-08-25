/**
 * Mythic: Artifact surface extractors
 * Engineering: extractSovereignArtifacts / summarizeDispatchResult
 */

function asArray(value) {
  return Array.isArray(value) ? value : value ? [value] : [];
}

/**
 * Normalize snake_case / camelCase dispatch result fields.
 * @param {Record<string, unknown>|null|undefined} result
 */
export function normalizeDispatchResult(result) {
  if (!result || typeof result !== 'object') return null;
  return {
    ...result,
    ok: result.ok,
    requestId: result.requestId || result.request_id,
    traceId: result.traceId || result.trace_id,
    lanePlan: result.lanePlan || result.lane_plan || [],
    reasonCodes: result.reasonCodes || result.reason_codes || [],
    deepLinks: result.deepLinks || result.deep_links || {},
    decisionEvents:
      result.trace?.decisionEvents
      || result.trace?.decision_events
      || result.decision_events
      || result.decisionEvents
      || [],
  };
}

/**
 * Pull AAIS / CRM / Graph / pictures / mandala / spreadsheet into card models.
 * @param {Record<string, unknown>|null|undefined} result
 */
export function extractSovereignArtifacts(result) {
  const normalized = normalizeDispatchResult(result);
  if (!normalized) {
    return {
      tasks: [],
      crm: [],
      graph: [],
      images: [],
      mandala: [],
      spreadsheet: [],
      notes: [],
      summaries: [],
      providerEvents: [],
      toolLoops: [],
      embeddingMeta: null,
    };
  }

  const flow = normalized.outputs?.taskFlow || normalized.outputs?.task_flow || {};
  const tasks = [];
  const crm = [];
  const graph = [];
  const images = [];
  const mandala = [];
  const spreadsheet = [];
  const notes = [];
  const summaries = [];

  if (flow.aais) tasks.push({ kind: 'aais', ...asObject(flow.aais) });
  for (const t of asArray(normalized.outputs?.tasks)) {
    if (!tasks.some((x) => x.id && x.id === t.id)) {
      tasks.push({ kind: 'aais', ...asObject(t) });
    }
  }
  if (flow.crm) crm.push({ kind: 'crm', ...asObject(flow.crm) });
  if (flow.graph) graph.push({ kind: 'graph', ...asObject(flow.graph) });

  for (const pic of asArray(normalized.outputs?.pictures)) {
    const row = asObject(pic);
    if (row.engine === 'mandala' || row.mandala || row.kind === 'mandala') {
      mandala.push({ kind: 'mandala', ...row });
    } else {
      images.push({ kind: 'image', ...row });
    }
  }

  const events = normalized.trace?.events || [];
  for (const e of events) {
    const out = asObject(e.output || e.result);
    if (out.spreadsheet || out.workbook || out.sessionId || out.session_id || e.provider?.includes?.('spreadsheet')) {
      spreadsheet.push({
        kind: 'spreadsheet',
        provider: e.provider,
        lane: e.lane,
        ...out,
      });
    }
    if (Array.isArray(out.toolLoop) || Array.isArray(out.tool_loop)) {
      // collected below
    }
    if (out.summary) summaries.push({ kind: 'summary', text: String(out.summary), provider: e.provider });
    if (out.draft || out.text) {
      notes.push({
        kind: 'note',
        text: String(out.draft || out.text).slice(0, 2000),
        provider: e.provider,
      });
    }
  }

  // Spreadsheet may also land on outputs.skills / outputs.taskFlow
  if (flow.spreadsheet) spreadsheet.push({ kind: 'spreadsheet', ...asObject(flow.spreadsheet) });
  if (normalized.outputs?.spreadsheet) {
    spreadsheet.push({ kind: 'spreadsheet', ...asObject(normalized.outputs.spreadsheet) });
  }

  const toolLoops = [];
  for (const e of events) {
    const out = asObject(e.output);
    const loop = out.toolLoop || out.tool_loop;
    if (Array.isArray(loop) && loop.length) {
      toolLoops.push({ provider: e.provider, lane: e.lane, rounds: loop });
    }
  }

  const decisionEvents = normalized.decisionEvents || [];
  let embeddingMeta = null;
  for (const d of decisionEvents) {
    if (d.event === 'intent_classified' && d.embedding) {
      embeddingMeta = d.embedding;
    }
  }
  const evidence = normalized.trace?.evidence || [];
  for (const ev of evidence) {
    const meta = asObject(ev.metadata);
    if (meta.embedding && !embeddingMeta) embeddingMeta = meta.embedding;
  }

  if (normalized.adaptive?.status) {
    summaries.push({
      kind: 'adaptive',
      text: `Adaptive ${normalized.adaptive.mode || 'mode'}: ${normalized.adaptive.status}`,
    });
  }

  return {
    tasks,
    crm,
    graph,
    images,
    mandala,
    spreadsheet,
    notes,
    summaries,
    providerEvents: events,
    toolLoops,
    embeddingMeta,
    decisionEvents,
    evidence,
  };
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : { value };
}

/**
 * Build assistant chat bubble text from a dispatch result.
 * @param {Record<string, unknown>|null|undefined} result
 */
export function summarizeDispatchResult(result) {
  const normalized = normalizeDispatchResult(result);
  if (!normalized) return 'No response from task bus.';
  const artifacts = extractSovereignArtifacts(normalized);
  const parts = [];
  if (normalized.ok === false) {
    parts.push('Dispatch finished with denials or errors.');
  } else {
    parts.push('Dispatch complete.');
  }
  if (normalized.intent?.raw || normalized.intent?.type) {
    parts.push(
      `Intent: ${normalized.intent?.type || 'unknown'}`
        + (normalized.intent?.confidence != null ? ` (${normalized.intent.confidence})` : ''),
    );
  }
  if (artifacts.embeddingMeta?.backend) {
    parts.push(`Classifier: ${artifacts.embeddingMeta.backend}`);
  }
  if (artifacts.tasks.length) parts.push(`AAIS tasks: ${artifacts.tasks.length}`);
  if (artifacts.crm.length) parts.push(`CRM: ${artifacts.crm.length}`);
  if (artifacts.graph.length) parts.push(`Graph: ${artifacts.graph.length}`);
  if (artifacts.images.length) parts.push(`Images: ${artifacts.images.length}`);
  if (artifacts.mandala.length) parts.push(`Mandala: ${artifacts.mandala.length}`);
  if (artifacts.spreadsheet.length) parts.push(`Spreadsheet: ${artifacts.spreadsheet.length}`);
  if (artifacts.toolLoops.length) parts.push(`Tool loops: ${artifacts.toolLoops.length}`);
  const codes = normalized.reasonCodes || [];
  if (codes.length) parts.push(`Codes: ${codes.slice(0, 6).join(', ')}`);
  return parts.join(' · ');
}

/**
 * Inline cards for the chat transcript.
 * @param {Record<string, unknown>|null|undefined} result
 */
export function buildInlineCards(result) {
  const a = extractSovereignArtifacts(result);
  const cards = [];
  for (const t of a.tasks) {
    cards.push({
      id: `aais-${t.id || cards.length}`,
      type: 'aais',
      title: t.title || 'AAIS Task',
      body: t.description || t.dueDate || t.id || '',
      meta: t,
    });
  }
  for (const c of a.crm) {
    cards.push({
      id: `crm-${c.id || cards.length}`,
      type: 'crm',
      title: c.title || c.leadId || 'CRM follow-up',
      body: c.status || c.reason || '',
      meta: c,
    });
  }
  for (const g of a.graph) {
    cards.push({
      id: `graph-${g.id || cards.length}`,
      type: 'graph',
      title: g.title || g.id || 'Microsoft Graph task',
      body: g.dueDateTime || g.status || '',
      meta: g,
    });
  }
  for (const m of a.mandala) {
    cards.push({
      id: `mandala-${cards.length}`,
      type: 'mandala',
      title: 'Mandala plan',
      body: m.summary || m.deepLink || '/adaptive-music',
      href: m.deepLink || '/adaptive-music',
      meta: m,
    });
  }
  for (const img of a.images) {
    cards.push({
      id: `img-${cards.length}`,
      type: 'image',
      title: 'Picture Engine',
      body: img.image_path || img.path || img.summary || '',
      href: '/image-generator',
      meta: img,
    });
  }
  for (const s of a.spreadsheet) {
    cards.push({
      id: `sheet-${s.sessionId || s.session_id || cards.length}`,
      type: 'spreadsheet',
      title: 'Excel workbook session',
      body: s.itemPath || s.item_path || s.sessionId || s.session_id || 'workbook_session',
      meta: s,
    });
  }
  return cards;
}
