import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryRegistry, type QueryGroup } from './query-registry.js';

const group = (routes: Record<string, () => Promise<unknown>>): QueryGroup => ({
  routes: () => routes,
});

describe('QueryRegistry', () => {
  beforeEach(() => {
    vi.stubGlobal('CONFIG', { queries: { 'other-module.keep': () => 'untouched' } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists the names of all groups', () => {
    const registry = new QueryRegistry([group({ a: async () => 1 }), group({ b: async () => 2 })]);
    expect(registry.names()).toEqual(['a', 'b']);
  });

  it('installs every query under the module prefix, guarded', async () => {
    new QueryRegistry([group({ ping: async () => 'result' })], 'mod').install();
    const queries = (globalThis as any).CONFIG.queries;

    await expect(queries['mod.ping']({})).resolves.toBe('result');
    await expect(
      queries['mod.ping']({}, { user: { isGM: false, name: 'Player' } })
    ).rejects.toThrow('Access denied');
  });

  it('refuses two groups that answer the same query name', () => {
    const registry = new QueryRegistry([group({ a: async () => 1 }), group({ a: async () => 2 })]);
    expect(() => registry.install()).toThrow('Duplicate query name: a');
  });

  it('uninstalls only its own queries', () => {
    const registry = new QueryRegistry([group({ a: async () => 1 })], 'mod');
    registry.install();
    registry.uninstall();

    const queries = (globalThis as any).CONFIG.queries;
    expect(Object.keys(queries)).toEqual(['other-module.keep']);
  });
});
