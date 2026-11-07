/**
 * Golden snapshot of the MCP tool surface (ADR-0002).
 *
 * The restructure must not change what an MCP client sees: names, descriptions and input
 * schemas of every tool, in the same order. Regenerate the snapshot on purpose, in the same
 * commit that changes the surface, with:  UPDATE_GOLDEN=1 npm -w @foundry-mcp/server test
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';
import { createTestToolRegistry } from './test-support/create-test-registry.js';

const GOLDEN_FILE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '__golden__',
  'tools-list.json'
);

function buildToolDefinitions(): unknown[] {
  return createTestToolRegistry().list();
}

describe('MCP tool surface', () => {
  it('matches the golden tools/list snapshot', () => {
    const current = JSON.parse(JSON.stringify(buildToolDefinitions()));

    if (process.env.UPDATE_GOLDEN === '1') {
      fs.writeFileSync(GOLDEN_FILE, JSON.stringify(current, null, 2) + '\n');
    }

    const golden = JSON.parse(fs.readFileSync(GOLDEN_FILE, 'utf8'));
    expect(current).toEqual(golden);
  });

  it('exposes the 50 tools of upstream v0.8.6', () => {
    const golden = JSON.parse(fs.readFileSync(GOLDEN_FILE, 'utf8')) as { name: string }[];
    expect(golden).toHaveLength(50);
    expect(new Set(golden.map(t => t.name)).size).toBe(50);
  });
});
