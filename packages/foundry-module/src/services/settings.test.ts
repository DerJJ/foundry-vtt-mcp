import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsService } from './settings.js';
import { SettingsQueries } from '../queries/settings.js';

function definition(namespace: string, key: string, extra: Record<string, any> = {}) {
  return {
    namespace,
    key,
    name: extra['name'] ?? key,
    scope: 'world',
    config: true,
    type: Boolean,
    default: false,
    requiresReload: false,
    ...extra,
  };
}

function setup(values: Record<string, unknown> = {}) {
  const definitions = [
    definition('core', 'fontSize', { type: Number, default: 5, scope: 'client' }),
    definition('core', 'moduleConfiguration', { type: Object, config: false, default: {} }),
    definition('core', 'permissions', { type: Object, config: false, default: {} }),
    definition('core', 'hiddenThing', { config: false }),
    definition('dnd5e', 'metricWeightUnits', { name: 'Metric Weight', requiresReload: true }),
    definition('dnd5e', 'maxLevel', { type: Number, default: 20, hint: 'The highest level' }),
    definition('someModule', 'apiKey', { type: String, default: '', name: 'API Key' }),
    definition('foundry-mcp-bridge', 'accessLevel', { type: String, default: 'write' }),
    definition('foundry-mcp-bridge', 'allowExecute', { default: false }),
  ];
  const stored: Record<string, unknown> = { 'someModule.apiKey': 'sk-live-123', ...values };
  const set = vi.fn(async (ns: string, key: string, value: unknown) => {
    stored[`${ns}.${key}`] = value;
  });
  vi.stubGlobal('game', {
    ready: true,
    world: { id: 'w' },
    user: { id: 'gm', isGM: true },
    i18n: { localize: (s: string) => s },
    settings: {
      settings: new Map(definitions.map(d => [`${d.namespace}.${d.key}`, d])),
      get: vi.fn((ns: string, key: string) => {
        const id = `${ns}.${key}`;
        return id in stored
          ? stored[id]
          : definitions.find(d => `${d.namespace}.${d.key}` === id)?.default;
      }),
      set,
    },
  });
  return { service: new SettingsService(), set, stored };
}

describe('SettingsService', () => {
  beforeEach(() => vi.spyOn(console, 'log').mockImplementation(() => undefined));
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('list', () => {
    it('lists the settings Foundry shows, with value and default', async () => {
      const { service } = setup({ 'dnd5e.maxLevel': 12 });
      const r = await service.run({ action: 'list' });
      const keys = r.settings.map((s: any) => s.key);
      expect(keys).not.toContain('core.hiddenThing');
      expect(r.settings.find((s: any) => s.key === 'dnd5e.maxLevel')).toMatchObject({
        value: 12,
        default: 20,
        scope: 'world',
        type: 'Number',
      });
    });

    it('filters by namespace, scope and text, and can include the hidden ones', async () => {
      const { service } = setup();
      expect(
        (await service.run({ action: 'list', namespace: 'dnd5e' })).settings.map((s: any) => s.key)
      ).toEqual(['dnd5e.maxLevel', 'dnd5e.metricWeightUnits']);
      expect((await service.run({ action: 'list', scope: 'client' })).total).toBe(1);
      expect((await service.run({ action: 'list', query: 'metric' })).total).toBe(1);
      expect(
        (await service.run({ action: 'list', all: true })).settings.map((s: any) => s.key)
      ).toContain('core.hiddenThing');
    });

    it('never shows the value of something that looks like a secret', async () => {
      const { service } = setup();
      const r = await service.run({ action: 'list', namespace: 'someModule' });
      expect(r.settings[0].value).toBe('[hidden]');
      expect(JSON.stringify(r)).not.toContain('sk-live-123');
    });

    it('says how large a value is instead of returning it', async () => {
      const { service } = setup({ 'core.moduleConfiguration': { big: 'x'.repeat(2000) } });
      const r = await service.run({ action: 'list', all: true, namespace: 'core' });
      const row = r.settings.find((s: any) => s.key === 'core.moduleConfiguration');
      expect(row.value.tooLarge).toBeGreaterThan(2000);
    });
  });

  describe('get', () => {
    it('reads one setting with its hint, and whether it can be changed', async () => {
      const { service } = setup();
      const r = await service.run({ action: 'get', key: 'dnd5e.maxLevel' });
      expect(r).toMatchObject({
        key: 'dnd5e.maxLevel',
        hint: 'The highest level',
        changeable: true,
      });
      expect(
        (await service.run({ action: 'get', key: 'foundry-mcp-bridge.accessLevel' })).changeable
      ).toBe(false);
    });

    it('hides a secret and says so', async () => {
      const { service } = setup();
      const r = await service.run({ action: 'get', key: 'someModule.apiKey' });
      expect(r).toMatchObject({ value: '[hidden]', hidden: true, changeable: false });
    });

    it('says what to do when the setting does not exist', async () => {
      const { service } = setup();
      await expect(service.run({ action: 'get', key: 'core.nope' })).rejects.toThrow(
        'namespace.key'
      );
    });
  });

  describe('set', () => {
    it('changes a setting and reports before and after', async () => {
      const { service, set } = setup({ 'dnd5e.maxLevel': 12 });
      const r = await service.run({ action: 'set', key: 'dnd5e.maxLevel', value: 15 });
      expect(set).toHaveBeenCalledWith('dnd5e', 'maxLevel', 15);
      expect(r).toMatchObject({ success: true, from: 12, to: 15, requiresReload: false });
    });

    it('says when a reload is needed, and when the setting is for this browser only', async () => {
      const { service } = setup();
      const reload = await service.run({
        action: 'set',
        key: 'dnd5e.metricWeightUnits',
        value: true,
      });
      expect(reload.requiresReload).toBe(true);
      expect(reload.message).toContain('reload');
      const client = await service.run({ action: 'set', key: 'core.fontSize', value: 6 });
      expect(client.message).toContain('this GM browser');
    });

    it('refuses a value of the wrong type', async () => {
      const { service, set } = setup();
      await expect(
        service.run({ action: 'set', key: 'dnd5e.maxLevel', value: 'high' })
      ).rejects.toThrow('takes a number, got string');
      expect(set).not.toHaveBeenCalled();
    });

    it('never changes the settings of the bridge, so the access level cannot be lifted from here', async () => {
      const { service, set } = setup();
      for (const key of ['foundry-mcp-bridge.accessLevel', 'foundry-mcp-bridge.allowExecute']) {
        await expect(service.run({ action: 'set', key, value: 'full' })).rejects.toThrow(
          'can only be changed in Foundry itself'
        );
      }
      expect(set).not.toHaveBeenCalled();
    });

    it('sends the module list to the modules tool and leaves the role permissions alone', async () => {
      const { service, set } = setup();
      await expect(
        service.run({ action: 'set', key: 'core.moduleConfiguration', value: {} })
      ).rejects.toThrow('modules tool');
      await expect(
        service.run({ action: 'set', key: 'core.permissions', value: {} })
      ).rejects.toThrow('Configure Permissions');
      expect(set).not.toHaveBeenCalled();
    });

    it('does not change a secret', async () => {
      const { service, set } = setup();
      await expect(
        service.run({ action: 'set', key: 'someModule.apiKey', value: 'x' })
      ).rejects.toThrow('looks like a secret');
      expect(set).not.toHaveBeenCalled();
    });

    it('needs a key and a value', async () => {
      const { service } = setup();
      await expect(service.run({ action: 'set', value: 1 })).rejects.toThrow('needs key');
      await expect(service.run({ action: 'set', key: 'dnd5e.maxLevel' })).rejects.toThrow(
        'needs value'
      );
    });
  });
});

describe('reloading the GM browser', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('game', { ready: true, world: { id: 'w' }, user: { id: 'gm', isGM: true } });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('answers first and reloads a moment later', async () => {
    const reload = vi.fn();
    vi.stubGlobal('location', { reload });
    const answer = await new SettingsQueries().handleReloadClient();
    expect(answer).toMatchObject({ success: true, reloading: true });
    expect(reload).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2000);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('prefers Foundrys own debounced reload', async () => {
    const debounced = vi.fn();
    const reload = vi.fn();
    vi.stubGlobal('foundry', { utils: { debouncedReload: debounced } });
    vi.stubGlobal('location', { reload });
    await new SettingsQueries().handleReloadClient();
    vi.advanceTimersByTime(2000);
    expect(debounced).toHaveBeenCalledTimes(1);
    expect(reload).not.toHaveBeenCalled();
  });

  it('does nothing for a player', async () => {
    vi.stubGlobal('game', { ready: true, world: { id: 'w' }, user: { id: 'p', isGM: false } });
    const reload = vi.fn();
    vi.stubGlobal('location', { reload });
    const answer = await new SettingsQueries().handleReloadClient();
    vi.advanceTimersByTime(2000);
    expect(answer).toMatchObject({ error: 'Access denied' });
    expect(reload).not.toHaveBeenCalled();
  });
});
