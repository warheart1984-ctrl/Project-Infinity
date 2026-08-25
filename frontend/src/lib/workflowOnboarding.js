const SUMMARY = 'A strong starting point for your workflow.';

function tokenize(value) {
  return `${value || ''}`.toLowerCase().split(/[^a-z0-9]+/).map((token) => token.trim()).filter(Boolean);
}

function toolSetFrom(state) {
  return new Set(Array.isArray(state?.tools) ? state.tools : []);
}

function describeOnboarding(state) {
  const tokens = tokenize(state?.goal || '');
  const toolSet = toolSetFrom(state);
  const tokenSet = new Set(tokens);
  const has = (...words) => words.some((word) => tokenSet.has(word));
  return {
    tokens,
    toolSet,
    usesEmail: toolSet.has('email') || has('email', 'emails', 'inbox'),
    usesSlack: toolSet.has('slack') || has('slack', 'alerts', 'alert', 'channel'),
    usesApi: toolSet.has('api') || has('api', 'webhook', 'http', 'endpoint'),
    usesSchedule: toolSet.has('schedules') || has('schedule', 'scheduled', 'daily', 'weekly', 'brief', 'report'),
  };
}

export function rankTemplatesForOnboarding(templates, onboardingState) {
  const list = Array.isArray(templates) ? templates : [];
  if (!onboardingState?.onboarding_done) {
    return list.map((template) => ({
      ...template,
      recommendationScore: 0,
      recommendationReasons: [],
      recommended: false,
    }));
  }

  const facts = describeOnboarding(onboardingState);
  return list
    .map((template) => {
      let score = 0;
      const reasons = [];
      (Array.isArray(template.integrations) ? template.integrations : []).forEach((integration) => {
        if (facts.toolSet.has(integration) || (integration === 'schedules' && facts.usesSchedule)) {
          score += 3;
          reasons.push(`Matches your ${integration} tooling.`);
        }
      });
      if (template.category === 'email' && facts.usesEmail) {
        score += 2;
        reasons.push('Fits your email-heavy workflow goal.');
      }
      if (template.category === 'slack' && facts.usesSlack) {
        score += 2;
        reasons.push('Fits your Slack communication workflow.');
      }
      if (template.category === 'api' && facts.usesApi) {
        score += 2;
        reasons.push('Fits your API or webhook automation goal.');
      }
      if (template.category === 'productivity' && facts.usesSchedule) {
        score += 2;
        reasons.push('Fits your scheduled productivity workflow.');
      }
      return {
        ...template,
        recommendationScore: score,
        recommendationReasons: reasons,
        recommended: score > 0,
      };
    })
    .sort((left, right) => (
      right.recommendationScore !== left.recommendationScore
        ? right.recommendationScore - left.recommendationScore
        : left.name.localeCompare(right.name)
    ));
}

export function getTopRecommendations(templates, onboardingState, limit = 3) {
  return rankTemplatesForOnboarding(templates, onboardingState)
    .filter((template) => template.recommended)
    .slice(0, limit);
}

function workflowNameFor(facts) {
  if (facts.usesApi && facts.usesSlack) return 'Webhook Summary to Slack';
  if (facts.usesSchedule && facts.usesEmail) return 'Daily Brief Email';
  if (facts.usesEmail && facts.usesSlack) return 'Email Summary to Slack';
  if (facts.usesSlack) return 'Slack Triage Workflow';
  if (facts.usesApi) return 'Webhook Review Workflow';
  return 'AI Workflow Draft';
}

function workflowPromptFor(goal, facts) {
  if (goal?.trim()) return goal.trim();
  if (facts.usesApi && facts.usesSlack) {
    return 'When a webhook arrives, summarize it and prepare a safe Slack alert.';
  }
  if (facts.usesSchedule && facts.usesEmail) {
    return 'Every morning, create a short daily brief and prepare an email summary.';
  }
  if (facts.usesEmail && facts.usesSlack) {
    return 'When I get an important email, summarize it and send it to Slack.';
  }
  return 'Create a useful workflow draft based on my onboarding preferences.';
}

export function buildSeedWorkflowFromOnboarding(state) {
  if (!state?.onboarding_done) {
    return null;
  }

  const facts = describeOnboarding(state);
  let triggerType = 'email.received';
  let triggerLabel = 'Incoming Email';
  let triggerConfig = { inbox: 'primary' };
  if (facts.usesApi) {
    triggerType = 'webhook.received';
    triggerLabel = 'Incoming Webhook';
    triggerConfig = { source: 'default' };
  } else if (facts.usesSchedule) {
    triggerType = 'schedule.tick';
    triggerLabel = 'Daily Schedule';
    triggerConfig = { cron: '0 9 * * *' };
  } else if (facts.usesSlack && !facts.usesEmail) {
    triggerType = 'slack.message';
    triggerLabel = 'Slack Message';
    triggerConfig = { channel: '#alerts' };
  }

  let actionType = 'task.create';
  let actionLabel = 'Create Task';
  let actionConfig = { title: 'Follow up on workflow result' };
  if (facts.usesSlack) {
    actionType = 'slack.send';
    actionLabel = 'Send to Slack';
    actionConfig = { channel: '#alerts', ...(facts.usesApi ? { deliveryMode: 'fake' } : {}) };
  } else if (facts.usesEmail) {
    actionType = 'email.send';
    actionLabel = 'Send Email';
    actionConfig = { to: 'user@example.com', subject: 'AAIS Workflow Result' };
  }

  return {
    workflowName: workflowNameFor(facts),
    aiPrompt: workflowPromptFor(state.goal, facts),
    nodes: [
      {
        id: 'trigger-1',
        type: 'triggerNode',
        position: { x: 60, y: 200 },
        data: { label: triggerLabel, kind: 'trigger', subtype: triggerType, config: triggerConfig },
      },
      {
        id: 'action-1',
        type: 'actionNode',
        position: { x: 390, y: 150 },
        data: {
          label: 'Summarize with AI',
          kind: 'action',
          subtype: 'ai.analyze',
          config: {
            goal: state.goal?.trim() || 'Summarize the incoming event and highlight important signals',
            ...(facts.usesApi ? { mode: 'fake' } : {}),
          },
        },
      },
      {
        id: 'action-2',
        type: 'actionNode',
        position: { x: 730, y: 150 },
        data: { label: actionLabel, kind: 'action', subtype: actionType, config: actionConfig },
      },
    ],
    edges: [
      { id: 'e1', source: 'trigger-1', target: 'action-1' },
      { id: 'e2', source: 'action-1', target: 'action-2' },
    ],
    summary: SUMMARY,
  };
}
