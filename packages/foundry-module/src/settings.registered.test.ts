import { afterEach, describe, expect, it, vi } from 'vitest';
import { ModuleSettings } from './settings.js';

/** A game.settings that, like Foundry's, refuses to read or write a setting nobody registered. */
function strictSettings() {
  const registered = new Map<string, any>();
  const values = new Map<string, unknown>();
  const settings = {
    settings: registered,
    register: vi.fn((namespace: string, key: string, data: any) => {
      registered.set(`${namespace}.${key}`, data);
    }),
    registerMenu: vi.fn(),
    get: vi.fn((namespace: string, key: string) => {
      const id = `${namespace}.${key}`;
      if (!registered.has(id)) throw new Error(`"${id}" is not a registered game setting`);
      return values.has(id) ? values.get(id) : registered.get(id).default;
    }),
    set: vi.fn(async (namespace: string, key: string, value: unknown) => {
      const id = `${namespace}.${key}`;
      if (!registered.has(id)) throw new Error(`"${id}" is not a registered game setting`);
      values.set(id, value);
      return value;
    }),
  };
  vi.stubGlobal('FormApplication', class {});
  vi.stubGlobal('ui', { notifications: { info: vi.fn(), warn: vi.fn() } });
  vi.stubGlobal('game', { settings, i18n: { localize: (s: string) => s }, user: { isGM: true } });
  return settings;
}

describe('the settings the module reads', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('are all registered: getAllSettings does not throw (it did for a removed setting)', () => {
    strictSettings();
    const settings = new ModuleSettings();
    settings.registerSettings();
    const all = settings.getAllSettings();
    expect(all).toHaveProperty('accessLevel');
    expect(all).toHaveProperty('allowExecute');
    expect(all).not.toHaveProperty('allowWriteOperations');
  });

  it('can be reset to their defaults without touching a setting that does not exist', async () => {
    strictSettings();
    const settings = new ModuleSettings();
    settings.registerSettings();
    await expect(settings.resetToDefaults()).resolves.toBeUndefined();
  });
});
