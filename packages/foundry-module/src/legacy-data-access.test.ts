import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FoundryDataAccess } from './data-access.js';
import { withLegacyMethods } from './legacy-data-access.js';

describe('legacy flat data-access view', () => {
  beforeEach(() => {
    vi.stubGlobal('Hooks', { on: vi.fn(() => 1), once: vi.fn(() => 1), off: vi.fn() });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('forwards a flat call to the service that owns the method, bound to it', () => {
    const access = new FoundryDataAccess();
    const spy = vi.spyOn(access.characters, 'getCharacterInfo').mockResolvedValue({ ok: 1 } as any);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const legacy: any = withLegacyMethods(access);
    return legacy.getCharacterInfo('Bob').then((r: any) => {
      expect(r).toEqual({ ok: 1 });
      expect(spy).toHaveBeenCalledWith('Bob');
    });
  });

  it('warns once per method', () => {
    const access = new FoundryDataAccess();
    vi.spyOn(access.characters, 'getCharacterInfo').mockResolvedValue({} as any);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const legacy: any = withLegacyMethods(access);
    legacy.getCharacterInfo('a');
    legacy.getCharacterInfo('b');
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('keeps the services reachable and returns undefined for unknown names', () => {
    const access = new FoundryDataAccess();
    const legacy: any = withLegacyMethods(access);
    expect(legacy.characters).toBe(access.characters);
    expect(legacy.noSuchMethod).toBeUndefined();
  });

  it('never has two services answering to the same method name', () => {
    const access: any = new FoundryDataAccess();
    const owners = new Map<string, string[]>();
    for (const [serviceName, service] of Object.entries(access)) {
      if (!service || typeof service !== 'object') continue;
      for (const name of Object.getOwnPropertyNames(Object.getPrototypeOf(service))) {
        if (name === 'constructor' || typeof service[name] !== 'function') continue;
        owners.set(name, [...(owners.get(name) ?? []), serviceName]);
      }
    }
    const clashes = [...owners].filter(([, o]) => o.length > 1).map(([n, o]) => `${n}: ${o}`);
    expect(clashes).toEqual([]);
  });
});
