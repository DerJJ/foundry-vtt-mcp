import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccessLevel } from '../access-level.js';
import { QueryHandlers } from '../queries.js';
import { guardRisk } from './query-registry.js';
import { QUERY_FEATURE, QUERY_RISK, riskOfQuery } from './query-risk.js';

function stubSettings(settings: Record<string, unknown>) {
  vi.stubGlobal('game', {
    settings: { get: vi.fn((_module: string, key: string) => settings[key]) },
  });
}

describe('query risk table', () => {
  beforeEach(() => {
    vi.stubGlobal('CONFIG', { queries: {} });
    vi.stubGlobal('Hooks', { on: vi.fn(() => 1), once: vi.fn(() => 1), off: vi.fn() });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('has a risk for every query the bridge registers, and no entry for one it does not', () => {
    new QueryHandlers().registerHandlers();
    const registered = Object.keys((globalThis as any).CONFIG.queries).map(key =>
      key.replace('foundry-mcp-bridge.', '')
    );
    expect(registered.filter(name => !(name in QUERY_RISK)).sort()).toEqual([]);
    expect(
      Object.keys(QUERY_RISK)
        .filter(name => !registered.includes(name))
        .sort()
    ).toEqual([]);
  });

  it('only gates queries that exist', () => {
    for (const name of Object.keys(QUERY_FEATURE)) expect(QUERY_RISK).toHaveProperty(name);
  });

  it('reads the risk from the payload for queries that serve several actions', () => {
    expect(riskOfQuery('manageEffects', { action: 'create' })).toBe('write');
    expect(riskOfQuery('manageEffects', { action: 'delete' })).toBe('delete');
    expect(riskOfQuery('manage-playlists', { action: 'describe' })).toBe('read');
    expect(riskOfQuery('manage-playlists', { action: 'delete' })).toBe('delete');
    expect(riskOfQuery('manage-playlists', {})).toBe('write');
  });

  it('treats running a script or a macro as execute, whatever the level', () => {
    expect(riskOfQuery('executeScript', { code: 'return 1' })).toBe('execute');
    expect(riskOfQuery('manageMacros', { action: 'execute' })).toBe('execute');
    expect(riskOfQuery('manageMacros', { action: 'list' })).toBe('read');
    expect(riskOfQuery('manageMacros', { action: 'create' })).toBe('write');
    expect(riskOfQuery('manageMacros', { action: 'delete' })).toBe('delete');
  });
});

describe('risk guard', () => {
  afterEach(() => vi.unstubAllGlobals());
  const handler = vi.fn(async () => 'done');
  const call = (name: string, data: unknown = {}) => guardRisk(name, handler)(data);

  it('refuses a query that has no risk, instead of assuming it is a read', async () => {
    stubSettings({ accessLevel: 'full' });
    await expect(call('brandNewQuery')).rejects.toThrow('no risk defined');
  });

  it.each<[AccessLevel, string, boolean]>([
    ['readonly', 'getWorldInfo', true],
    ['readonly', 'createActors', false],
    ['readonly', 'deleteActors', false],
    ['readwrite', 'createActors', true],
    ['readwrite', 'deleteActors', false],
    ['full', 'deleteActors', true],
    ['full', 'getWorldInfo', true],
  ])('at %s, %s is allowed: %s', async (accessLevel, query, allowed) => {
    stubSettings({ accessLevel });
    if (allowed) await expect(call(query)).resolves.toBe('done');
    else await expect(call(query)).rejects.toThrow(/access level of this world/);
  });

  it('tells the caller which level would allow the query', async () => {
    stubSettings({ accessLevel: 'readonly' });
    await expect(call('createActors')).rejects.toThrow('Read & write');
    stubSettings({ accessLevel: 'readwrite' });
    await expect(call('deleteActors')).rejects.toThrow('Full access');
  });

  it('refuses a deleting action of a mixed query below full access', async () => {
    stubSettings({ accessLevel: 'readwrite' });
    await expect(call('manageEffects', { action: 'create' })).resolves.toBe('done');
    await expect(call('manageEffects', { action: 'delete' })).rejects.toThrow('Full access');
  });

  it('refuses a gated feature while its setting is off, whatever the level', async () => {
    stubSettings({ accessLevel: 'full', imageGenerationEnabled: false });
    await expect(call('generate-map')).rejects.toThrow('Image generation is off');
    stubSettings({ accessLevel: 'full', imageGenerationEnabled: true });
    await expect(call('generate-map')).resolves.toBe('done');
  });

  it('refuses execute while its checkbox is off, even at full access', async () => {
    stubSettings({ accessLevel: 'full', allowExecute: false });
    await expect(call('executeScript')).rejects.toThrow('Allow script and macro execution');
    stubSettings({ accessLevel: 'readonly', allowExecute: true });
    await expect(call('executeScript')).resolves.toBe('done');
  });

  it('defaults to read & write when the setting is missing', async () => {
    stubSettings({});
    await expect(call('createActors')).resolves.toBe('done');
    await expect(call('deleteActors')).rejects.toThrow('Full access');
  });
});
