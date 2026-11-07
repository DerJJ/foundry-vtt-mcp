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
import { config } from './config.js';
import { Logger } from './logger.js';
import { FoundryClient } from './foundry-client.js';
import { getSystemRegistry } from './systems/index.js';
import { DnD5eAdapter } from './systems/dnd5e/adapter.js';
import { PF2eAdapter } from './systems/pf2e/adapter.js';
import { DSA5Adapter } from './systems/dsa5/adapter.js';
import { CosmereRpgAdapter } from './systems/cosmere-rpg/adapter.js';
import { WFRP4eAdapter } from './systems/wfrp4e/adapter.js';
import { MGT2eAdapter } from './systems/mgt2e/adapter.js';
import { createToolRegistry } from './registry/create-tool-registry.js';

const GOLDEN_FILE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '__golden__',
  'tools-list.json'
);

function buildToolDefinitions(): unknown[] {
  const logger = new Logger({ level: 'error', enableConsole: false, enableFile: false });
  const foundryClient = new FoundryClient(config.foundry, logger);

  const systemRegistry = getSystemRegistry(logger);
  systemRegistry.register(new DnD5eAdapter());
  systemRegistry.register(new PF2eAdapter());
  systemRegistry.register(new DSA5Adapter());
  systemRegistry.register(new CosmereRpgAdapter());
  systemRegistry.register(new WFRP4eAdapter());
  systemRegistry.register(new MGT2eAdapter());

  return createToolRegistry({
    foundryClient,
    logger,
    systemRegistry,
    backendComfyUIHandlers: {},
  }).list();
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
