import { describe, expect, it } from 'vitest';
import { panelFromPath, pathForPanel, SOVEREIGN_ROUTE_MAP } from './sovereignRoutes';
import { parseSlashCommand, SLASH_HELP } from './sovereignDispatch';

describe('sovereignRoutes scaffold panels', () => {
  it('maps console and dashboard paths', () => {
    expect(panelFromPath('/sovereign/console')).toBe('console');
    expect(panelFromPath('/sovereign/dashboard')).toBe('dashboard');
    expect(panelFromPath('/assistant/console')).toBe('console');
    expect(pathForPanel('console')).toBe('/sovereign/console');
    expect(pathForPanel('dashboard')).toBe('/sovereign/dashboard');
    expect(SOVEREIGN_ROUTE_MAP.aliases.ChatPage).toBe('/sovereign');
  });
});

describe('slash commands scaffold', () => {
  it('documents task/crm/render/capture', () => {
    const help = SLASH_HELP.join('\n');
    expect(help).toMatch(/\/task/);
    expect(help).toMatch(/\/crm/);
    expect(help).toMatch(/\/render/);
    expect(help).toMatch(/\/capture/);
  });

  it('parses slash commands', () => {
    expect(parseSlashCommand('/task follow up Sarah')).toEqual({
      command: 'task',
      arg: 'follow up Sarah',
      rest: 'follow up Sarah',
    });
    expect(parseSlashCommand('/crm lead sync').command).toBe('crm');
    expect(parseSlashCommand('/render neon skyline').command).toBe('render');
  });
});
