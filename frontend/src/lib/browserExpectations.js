const TARGETS = [
  { key: 'console', label: 'Jarvis Console', routeLabel: 'Console', path: '/jarvis', summary: 'Operator console home.' },
  { key: 'memory', label: 'Memory Bank', routeLabel: 'Memory', path: '/memory', summary: 'Durable notes and overrides.' },
  { key: 'history', label: 'History', routeLabel: 'History', path: '/history', summary: 'Session archive and operator log.' },
  { key: 'settings', label: 'Settings', routeLabel: 'Settings', path: '/settings', summary: 'Local client configuration.' },
];

export function listBrowserVerificationTargets() {
  return TARGETS;
}

export function getBrowserExpectationGuide(path) {
  const requested = String(path || '').trim() || '/jarvis';
  const match = TARGETS.find((target) => target.path === requested) || TARGETS[0];
  return {
    key: match.key,
    path: match.path,
    expectation: `The ${match.label} page should render its main shell without a blank screen.`,
  };
}
