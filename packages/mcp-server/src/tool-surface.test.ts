/**
 * Golden snapshot of the MCP tool surface (ADR-0002): names, descriptions and input schemas of
 * every tool, in order. A change to what a client sees is made on purpose: regenerate the
 * snapshot in the same commit that changes the surface, with
 *   UPDATE_GOLDEN=1 npm -w @foundry-mcp/server test
 *
 * `upstream-tools.json` is the list of the 50 tools that the domain tools replaced (ADR-0004).
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';
import { DOMAIN_TOOLS, MERGED_OPERATIONS } from './registry/domain-tools.js';
import { createTestToolRegistry } from './test-support/create-test-registry.js';

const GOLDEN_FILE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '__golden__',
  'tools-list.json'
);

const UPSTREAM_FILE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '__golden__',
  'upstream-tools.json'
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

  it('lists a small, fixed number of domain tools', () => {
    const golden = JSON.parse(fs.readFileSync(GOLDEN_FILE, 'utf8')) as { name: string }[];
    expect(golden.length).toBeLessThanOrEqual(14);
    expect(new Set(golden.map(t => t.name)).size).toBe(golden.length);
  });

  it('answers every tool of upstream v0.8.6 with an action, so the migration table is complete', () => {
    const upstream = JSON.parse(fs.readFileSync(UPSTREAM_FILE, 'utf8')) as string[];
    const answered = new Set(
      DOMAIN_TOOLS.flatMap(tool => Object.values(tool.actions).map(a => a.operation))
    );
    expect(upstream).toHaveLength(50);
    expect(upstream.filter(name => !answered.has(name) && !(name in MERGED_OPERATIONS))).toEqual(
      []
    );
  });
});
