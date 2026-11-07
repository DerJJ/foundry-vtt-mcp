import { config } from '../config.js';
import { Logger } from '../logger.js';
import { FoundryClient } from '../foundry-client.js';
import { getSystemRegistry } from '../systems/index.js';
import { DnD5eAdapter } from '../systems/dnd5e/adapter.js';
import { PF2eAdapter } from '../systems/pf2e/adapter.js';
import { DSA5Adapter } from '../systems/dsa5/adapter.js';
import { CosmereRpgAdapter } from '../systems/cosmere-rpg/adapter.js';
import { WFRP4eAdapter } from '../systems/wfrp4e/adapter.js';
import { MGT2eAdapter } from '../systems/mgt2e/adapter.js';
import { createToolRegistry } from '../registry/create-tool-registry.js';

/** The real tool registry, built against a Foundry client that is never connected. */
export function createTestToolRegistry() {
  const logger = new Logger({ level: 'error', enableConsole: false, enableFile: false });
  const foundryClient = new FoundryClient(config.foundry, logger);

  const systemRegistry = getSystemRegistry(logger);
  systemRegistry.register(new DnD5eAdapter());
  systemRegistry.register(new PF2eAdapter());
  systemRegistry.register(new DSA5Adapter());
  systemRegistry.register(new CosmereRpgAdapter());
  systemRegistry.register(new WFRP4eAdapter());
  systemRegistry.register(new MGT2eAdapter());

  return createToolRegistry({ foundryClient, logger, systemRegistry, backendComfyUIHandlers: {} });
}
