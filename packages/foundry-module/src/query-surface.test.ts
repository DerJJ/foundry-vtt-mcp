/**
 * Golden snapshot of the bridge's query surface (ADR-0002): the names under which the
 * module registers its handlers in CONFIG.queries. The restructure must not change them.
 * Regenerate on purpose, in the commit that changes the surface, with:
 *   UPDATE_GOLDEN=1 npm -w @foundry-mcp/module test
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryHandlers } from './queries.js';

const GOLDEN_FILE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '__golden__',
  'query-names.json'
);

describe('bridge query surface', () => {
  beforeEach(() => {
    vi.stubGlobal('CONFIG', { queries: {} });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('registers exactly the golden set of query names', () => {
    const handlers = Object.create(QueryHandlers.prototype) as QueryHandlers;
    handlers.registerHandlers();
    const current = Object.keys((globalThis as any).CONFIG.queries).sort();

    if (process.env.UPDATE_GOLDEN === '1') {
      fs.writeFileSync(GOLDEN_FILE, JSON.stringify(current, null, 2) + '\n');
    }

    const golden = JSON.parse(fs.readFileSync(GOLDEN_FILE, 'utf8')) as string[];
    expect(current).toEqual(golden);
  });
});
