import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  auditLog,
  removeSensitiveFields,
  safeJSONStringify,
  sanitizeData,
  validateFoundryState,
} from './support.js';
import { validateGMAccess } from '../queries/gm-access.js';

beforeEach(() => {
  vi.stubGlobal('game', { system: { id: 'pf2e' } });
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('sanitizeData', () => {
  it('passes primitives and nullish values through', () => {
    expect(sanitizeData(null)).toBeNull();
    expect(sanitizeData(undefined)).toBeUndefined();
    expect(sanitizeData('x')).toBe('x');
    expect(sanitizeData(3)).toBe(3);
  });

  it('removes credentials and Foundry internals but keeps ordinary data', () => {
    expect(
      sanitizeData({
        name: 'Goblin',
        password: 'hunter2',
        apiKey: 'visible, only exact names are filtered',
        token: 'abc',
        secret: 's',
        parent: { id: 1 },
        collection: [],
        _stats: { coreVersion: '14' },
        _source: {},
        _id: 'abc123',
        system: { hp: { value: 5 } },
      })
    ).toEqual({
      name: 'Goblin',
      apiKey: 'visible, only exact names are filtered',
      _id: 'abc123',
      system: { hp: { value: 5 } },
    });
  });

  it('sanitises inside arrays', () => {
    expect(sanitizeData([{ name: 'a', secret: 1 }, 2])).toEqual([{ name: 'a' }, 2]);
  });

  it('replaces circular references', () => {
    const a: any = { name: 'a' };
    a.self = a;
    expect(sanitizeData(a)).toEqual({ name: 'a', self: '[Circular Reference]' });
  });

  it('stops at the depth limit', () => {
    let deep: any = { leaf: true };
    for (let i = 0; i < 60; i++) deep = { next: deep };
    expect(JSON.stringify(sanitizeData(deep))).toContain('[Max depth reached]');
  });

  it('returns an empty object when serialisation fails', () => {
    expect(sanitizeData({ big: 10n })).toEqual({});
  });

  it('does not read deprecated dnd5e sense getters', () => {
    const getter = vi.fn(() => 60);
    const senses: any = { ranges: { darkvision: 60 } };
    for (const key of ['darkvision', 'blindsight', 'tremorsense', 'truesight']) {
      Object.defineProperty(senses, key, { get: getter, enumerable: true });
    }
    expect(sanitizeData(senses)).toEqual({ ranges: { darkvision: 60 } });
    expect(getter).not.toHaveBeenCalled();
  });

  it('keeps the legacy sense keys when there is no ranges object', () => {
    expect(sanitizeData({ darkvision: 60 })).toEqual({ darkvision: 60 });
  });

  it('skips ability saves in dnd5e, but keeps them in other systems', () => {
    const data = { abilities: { str: { value: 10, save: { value: 2 } } } };
    vi.stubGlobal('game', { system: { id: 'dnd5e' } });
    expect(sanitizeData(data)).toEqual({ abilities: { str: { value: 10 } } });
    vi.stubGlobal('game', { system: { id: 'pf2e' } });
    expect(sanitizeData(data)).toEqual(data);
  });

  it('keeps structural keys in rule elements and effect changes', () => {
    vi.stubGlobal('game', { system: { id: 'pf2e' } });
    const data = {
      rules: [{ key: 'FlatModifier', selector: 'ac' }],
      changes: [{ key: 'system.attributes.hp.max', value: 5 }],
      settings: [{ key: 'drop me' }],
    };
    expect(sanitizeData(data)).toEqual({
      rules: [{ key: 'FlatModifier', selector: 'ac' }],
      changes: [{ key: 'system.attributes.hp.max', value: 5 }],
      settings: [{}],
    });
  });

  it('survives a property that throws on read', () => {
    const data: any = { name: 'x' };
    Object.defineProperty(data, 'boom', {
      get() {
        throw new Error('nope');
      },
      enumerable: true,
    });
    expect(removeSensitiveFields(data)).toBe('[Sanitization failed]');
  });
});

describe('safeJSONStringify', () => {
  it('serialises ordinary data', () => {
    expect(safeJSONStringify({ a: 1 })).toBe('{"a":1}');
  });

  it('falls back to an empty object', () => {
    expect(safeJSONStringify({ n: 1n })).toBe('{}');
  });
});

describe('validateFoundryState', () => {
  it('requires a ready game, an active world and a user', () => {
    vi.stubGlobal('game', { ready: false });
    expect(() => validateFoundryState()).toThrow('Foundry VTT is not ready');
    vi.stubGlobal('game', { ready: true });
    expect(() => validateFoundryState()).toThrow('No active world');
    vi.stubGlobal('game', { ready: true, world: {} });
    expect(() => validateFoundryState()).toThrow('No active user');
    vi.stubGlobal('game', { ready: true, world: {}, user: {} });
    expect(() => validateFoundryState()).not.toThrow();
  });

  it('reports a missing game object as not ready', () => {
    vi.stubGlobal('game', undefined);
    expect(() => validateFoundryState()).toThrow('Foundry VTT is not ready');
  });
});

describe('auditLog', () => {
  function stubWorld(existing: unknown[] = []) {
    const world = { id: 'w1', getFlag: vi.fn(() => existing), setFlag: vi.fn() };
    vi.stubGlobal('game', { user: { name: 'GM', id: 'u1' }, world });
    return world;
  }

  it('stores an entry with the user, world and sanitised data', () => {
    const world = stubWorld();
    auditLog('createActor', { name: 'Goblin', secret: 'x' }, 'success');
    const [, , logs] = world.setFlag.mock.calls[0] as unknown as [string, string, any[]];
    expect(world.setFlag.mock.calls[0]?.[1]).toBe('auditLogs');
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      operation: 'createActor',
      user: 'GM',
      userId: 'u1',
      world: 'w1',
      data: { name: 'Goblin' },
      result: 'success',
    });
  });

  it('records failures with their message', () => {
    const world = stubWorld();
    auditLog('deleteActors', {}, 'failure', 'denied');
    expect((world.setFlag.mock.calls[0]?.[2] as any[])[0]).toMatchObject({
      result: 'failure',
      error: 'denied',
    });
  });

  it('keeps only the last 100 entries', () => {
    const world = stubWorld(Array.from({ length: 100 }, (_, i) => ({ operation: `old${i}` })));
    auditLog('new', {}, 'success');
    const logs = world.setFlag.mock.calls[0]?.[2] as any[];
    expect(logs).toHaveLength(100);
    expect(logs[0].operation).toBe('old1');
    expect(logs[99].operation).toBe('new');
  });

  it('falls back to unknown identifiers and tolerates a missing flag store', () => {
    const world = { getFlag: vi.fn(() => null), setFlag: vi.fn() };
    vi.stubGlobal('game', { world });
    auditLog('x', {}, 'success');
    expect((world.setFlag.mock.calls[0]?.[2] as any[])[0]).toMatchObject({
      user: 'Unknown',
      userId: 'unknown',
      world: 'unknown',
    });
  });

  it('does nothing without a world', () => {
    vi.stubGlobal('game', { user: { name: 'GM' } });
    expect(() => auditLog('x', {}, 'success')).not.toThrow();
  });
});

describe('validateGMAccess', () => {
  it('allows a GM', () => {
    vi.stubGlobal('game', { user: { isGM: true } });
    expect(validateGMAccess()).toEqual({ allowed: true });
  });

  it('refuses players and a missing user without an error message', () => {
    vi.stubGlobal('game', { user: { isGM: false } });
    expect(validateGMAccess()).toEqual({ allowed: false });
    vi.stubGlobal('game', {});
    expect(validateGMAccess()).toEqual({ allowed: false });
  });
});
