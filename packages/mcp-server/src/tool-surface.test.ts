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
import { CharacterTools } from './tools/character.js';
import { CompendiumTools } from './tools/compendium.js';
import { SceneTools } from './tools/scene.js';
import { PlaylistTools } from './tools/playlist.js';
import { ActorCreationTools } from './tools/actor-creation.js';
import { ActorManagementTools } from './tools/actor-management.js';
import { EffectManagementTools } from './tools/effect-management.js';
import { QuestCreationTools } from './tools/quest-creation.js';
import { DiceRollTools } from './tools/dice-roll.js';
import { CampaignManagementTools } from './tools/campaign-management.js';
import { OwnershipTools } from './tools/ownership.js';
import { TokenManipulationTools } from './tools/token-manipulation.js';
import { MapGenerationTools } from './tools/map-generation.js';
import { WFRP4eUpdateActorTools } from './tools/wfrp4e/update-actor.js';
import { WFRP4eAddItemsTools } from './tools/wfrp4e/add-items.js';
import { DSA5CharacterCreator } from './systems/dsa5/character-creator.js';
import { DSA5JsonActorImporter } from './systems/dsa5/json-actor-importer.js';
import { DnD5eAddFeatureTool } from './tools/dnd5e/add-feature.js';
import { DnD5eNpcTools } from './tools/dnd5e/npc.js';
import { DnD5eFeaturesFromCompendiumTools } from './tools/dnd5e/features.js';
import { ChatTools } from './tools/chat.js';

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

  const deps = { foundryClient, logger };
  return [
    ...new CharacterTools({ ...deps, systemRegistry }).getToolDefinitions(),
    ...new CompendiumTools({ ...deps, systemRegistry }).getToolDefinitions(),
    ...new SceneTools(deps).getToolDefinitions(),
    ...new ActorCreationTools(deps).getToolDefinitions(),
    ...new ActorManagementTools({ ...deps, systemRegistry }).getToolDefinitions(),
    ...new EffectManagementTools(deps).getToolDefinitions(),
    ...new DSA5CharacterCreator(deps).getToolDefinitions(),
    ...new DSA5JsonActorImporter(deps).getToolDefinitions(),
    ...new DnD5eAddFeatureTool(deps).getToolDefinitions(),
    ...new DnD5eNpcTools(deps).getToolDefinitions(),
    ...new DnD5eFeaturesFromCompendiumTools(deps).getToolDefinitions(),
    ...new QuestCreationTools(deps).getToolDefinitions(),
    ...new ChatTools(deps).getToolDefinitions(),
    ...new DiceRollTools(deps).getToolDefinitions(),
    ...new CampaignManagementTools(foundryClient, logger).getToolDefinitions(),
    ...new OwnershipTools(deps).getToolDefinitions(),
    ...new WFRP4eUpdateActorTools(deps).getToolDefinitions(),
    ...new WFRP4eAddItemsTools(deps).getToolDefinitions(),
    ...new TokenManipulationTools(deps).getToolDefinitions(),
    ...new MapGenerationTools({ ...deps, backendComfyUIHandlers: {} }).getToolDefinitions(),
    ...new PlaylistTools(deps).getToolDefinitions(),
  ];
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
