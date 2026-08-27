import { describe, expect, it } from 'vitest';
import {
  inferTaskHints,
  mapOperatorAskToTaskBusPayload,
  parseSlashCommand,
  parseVisualIntelligenceHandoff,
  VISUAL_CREATION_COMPLETE_TOKEN,
} from './sovereignDispatch';
import {
  buildInlineCards,
  extractSovereignArtifacts,
  summarizeDispatchResult,
} from './sovereignArtifacts';

describe('sovereignDispatch', () => {
  it('maps Sarah follow-up ask into task create with crm + graph hints', () => {
    const ask = 'Make a follow-up task for Sarah tomorrow and sync it to Microsoft.';
    const payload = mapOperatorAskToTaskBusPayload(ask, { forceDemo: true, conflictPolicy: 'report' });
    expect(payload.intent).toBe(ask);
    expect(payload.forceDemo).toBe(true);
    expect(payload.tasks?.[0]?.constraints?.syncGraph).toBe(true);
    expect(payload.tasks?.[0]?.constraints?.tags).toEqual(
      expect.arrayContaining(['crm', 'graph']),
    );
    expect(payload.tasks?.[0]?.constraints?.conflictPolicy).toBe('report');
    expect(payload.tasks?.[0]?.constraints?.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('parses slash commands', () => {
    expect(parseSlashCommand('/help')).toEqual({ command: 'help', arg: '', rest: '' });
    expect(parseSlashCommand('/skill longform_writer')).toEqual({
      command: 'skill',
      arg: 'longform_writer',
      rest: 'longform_writer',
    });
    expect(parseSlashCommand('plain ask').command).toBeNull();
  });

  it('infers spreadsheet tag', () => {
    expect(inferTaskHints('open an excel workbook session').tags).toContain('spreadsheet');
  });

  it('parses visual intelligence handoff and strips token from payload', () => {
    const body = 'A luminous spiral mandala';
    const raw = `${body} ${VISUAL_CREATION_COMPLETE_TOKEN}`;
    const handoff = parseVisualIntelligenceHandoff(raw);
    expect(handoff.matched).toBe(true);
    expect(handoff.body).toBe(body);
    expect(handoff.body).not.toContain('perfection');

    const payload = mapOperatorAskToTaskBusPayload(raw, { forceDemo: true });
    expect(payload.text).toBe(body);
    expect(payload.intent.type).toBe('picture');
    expect(payload.intent.tags).toEqual(
      expect.arrayContaining(['visual_intelligence', 'authorized']),
    );
    expect(payload.pictures?.[0]?.action).toBe('make_picture');
    expect(payload.pictures?.[0]?.target).toBe(body);
    expect(JSON.stringify(payload)).not.toContain('perfection no upgrade');
  });
});

describe('sovereignArtifacts', () => {
  const sampleResult = {
    ok: true,
    traceId: 'trace_abc',
    requestId: 'req_1',
    intent: { type: 'task', confidence: 0.9, raw: 'follow-up Sarah' },
    reasonCodes: ['AAIS_TASK_CREATED'],
    adaptive: { mode: 'balanced', status: 'proposed' },
    outputs: {
      taskFlow: {
        aais: { id: 't1', title: 'Follow up Sarah', dueDate: '2026-08-26' },
        crm: { id: 'c1', title: 'CRM follow-up', leadId: 'sarah' },
        graph: { id: 'g1', title: 'Graph task' },
        spreadsheet: { sessionId: 'sess_1', itemPath: '/AAIS/exports/x.xlsx' },
      },
      pictures: [{ engine: 'mandala', summary: 'plan' }],
    },
    trace: {
      events: [
        {
          id: 'e1',
          provider: 'gpt_tools',
          lane: 'skills',
          output: { toolLoop: [{ round: 1, tool: 'list_skills' }] },
          timestamp: '2026-08-25T00:00:00Z',
        },
      ],
      evidence: [
        {
          id: 'ev1',
          provider: 'intent_bus',
          justification: 'classified',
          metadata: { embedding: { backend: 'local' } },
        },
      ],
      decisionEvents: [
        {
          event: 'intent_classified',
          embedding: { backend: 'local', dims: 32 },
        },
      ],
    },
  };

  it('extracts multi-provider artifacts, embedding, and toolLoop', () => {
    const artifacts = extractSovereignArtifacts(sampleResult);
    expect(artifacts.tasks).toHaveLength(1);
    expect(artifacts.crm).toHaveLength(1);
    expect(artifacts.graph).toHaveLength(1);
    expect(artifacts.spreadsheet[0].sessionId).toBe('sess_1');
    expect(artifacts.mandala).toHaveLength(1);
    expect(artifacts.embeddingMeta).toEqual({ backend: 'local', dims: 32 });
    expect(artifacts.toolLoops[0].rounds).toHaveLength(1);
  });

  it('builds inline cards including spreadsheet', () => {
    const cards = buildInlineCards(sampleResult);
    expect(cards.map((c) => c.type)).toEqual(
      expect.arrayContaining(['aais', 'crm', 'graph', 'mandala', 'spreadsheet']),
    );
  });

  it('summarizes dispatch for chat bubble', () => {
    const text = summarizeDispatchResult(sampleResult);
    expect(text).toMatch(/Dispatch complete/);
    expect(text).toMatch(/Classifier: local/);
    expect(text).toMatch(/Spreadsheet/);
  });
});
