/**
 * Sovereign route ↔ panel mapping (React Router deep links).
 * Scaffold pages: ChatPage (/), ConsolePage (/console), DashboardPage (/dashboard)
 */

/** @typedef {import('../../../types/aais').SovereignPanel} SovereignPanel */

/**
 * @param {string} pathname
 * @returns {SovereignPanel}
 */
export function panelFromPath(pathname) {
  const path = String(pathname || '');
  if (/\/(sovereign|assistant)\/middleware\/?$/.test(path)) return 'middleware';
  if (/\/(sovereign|assistant)\/console\/?$/.test(path)) return 'console';
  if (/\/(sovereign|assistant)\/dashboard\/?$/.test(path)) return 'dashboard';
  if (/\/(sovereign|assistant)\/plugins\/?$/.test(path)) return 'plugins';
  if (/\/(sovereign|assistant)\/settings\/?$/.test(path)) return 'settings';
  if (/\/(sovereign|assistant)\/crm\/?$/.test(path)) return 'crm';
  if (/\/(sovereign|assistant)\/telemetry\/?$/.test(path)) return 'telemetry';
  if (/\/(sovereign|assistant)\/scratch\/?$/.test(path)) return 'scratch';
  return 'chat';
}

/**
 * @param {import('../../../types/aais').SovereignPanel} panel
 * @param {string} [base='/sovereign']
 */
export function pathForPanel(panel, base = '/sovereign') {
  const root = base.replace(/\/+$/, '') || '/sovereign';
  switch (panel) {
    case 'middleware':
      return `${root}/middleware`;
    case 'console':
      return `${root}/console`;
    case 'dashboard':
      return `${root}/dashboard`;
    case 'plugins':
      return `${root}/plugins`;
    case 'settings':
      return `${root}/settings`;
    case 'crm':
      return `${root}/crm`;
    case 'telemetry':
      return `${root}/telemetry`;
    case 'scratch':
      return `${root}/scratch`;
    default:
      return root;
  }
}

export const SOVEREIGN_ROUTE_MAP = {
  chat: '/sovereign',
  console: '/sovereign/console',
  dashboard: '/sovereign/dashboard',
  middleware: '/sovereign/middleware',
  plugins: '/sovereign/plugins',
  settings: '/sovereign/settings',
  crm: '/sovereign/crm',
  telemetry: '/sovereign/telemetry',
  scratch: '/sovereign/scratch',
  aliases: {
    assistant: '/assistant',
    'assistant/*': '/assistant/*',
    'ChatPage': '/sovereign',
    'ConsolePage': '/sovereign/console',
    'DashboardPage': '/sovereign/dashboard',
  },
};
