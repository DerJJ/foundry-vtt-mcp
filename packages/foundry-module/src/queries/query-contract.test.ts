/**
 * Contract of every bridge query, independent of its name: it lives under the module prefix and
 * Foundry's User#query cannot reach it from a player. The golden snapshot pins the names;
 * these keep holding when the names change.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryHandlers } from '../queries.js';

describe('query contract', () => {
  let queries: Record<string, (data?: any, context?: any) => Promise<any>>;

  beforeEach(() => {
    vi.stubGlobal('CONFIG', { queries: {} });
    vi.stubGlobal('Hooks', { on: vi.fn(() => 1), once: vi.fn(() => 1), off: vi.fn() });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    new QueryHandlers().registerHandlers();
    queries = (globalThis as any).CONFIG.queries;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('registers queries', () => {
    expect(Object.keys(queries).length).toBeGreaterThan(0);
  });

  it('keeps every query under the module prefix', () => {
    for (const key of Object.keys(queries)) {
      expect(key).toMatch(/^foundry-mcp-bridge\.[A-Za-z][A-Za-z0-9-]*$/);
    }
  });

  it('refuses every query sent by a player, before any service runs', async () => {
    const player = { user: { isGM: false, name: 'Player' } };
    for (const [key, handler] of Object.entries(queries)) {
      await expect(handler({}, player), key).rejects.toThrow('Access denied');
    }
  });

  it('refuses every query whose context has no user', async () => {
    for (const [key, handler] of Object.entries(queries)) {
      await expect(handler({}, {}), key).rejects.toThrow('Access denied');
    }
  });

  it('removes every query again when the handlers are unregistered', () => {
    const handlers = new QueryHandlers();
    handlers.registerHandlers();
    handlers.unregisterHandlers();
    expect(Object.keys((globalThis as any).CONFIG.queries)).toEqual([]);
  });
});
