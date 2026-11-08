import type { FoundryClient } from '../foundry-client.js';
import type { Logger } from '../logger.js';
import { verificationOf } from '../systems/verification.js';
import { detectGameSystem } from '../utils/system-detection.js';
import type { Capabilities } from './access.js';
import type { DomainContext } from './domain-tool.js';

/** How long the world's capabilities are reused. Settings can change without a reconnect. */
const CAPABILITIES_TTL_MS = 3000;

/** The domain tools' view of the connected world: its system and its capabilities. */
export function createDomainContext(
  foundryClient: FoundryClient,
  logger: Logger,
  now: () => number = Date.now
): DomainContext {
  let cached: { at: number; value: Capabilities } | undefined;
  foundryClient.onConnectionChange(() => {
    cached = undefined;
  });

  return {
    system: () => detectGameSystem(foundryClient, logger),
    verification: verificationOf,
    async capabilities(): Promise<Capabilities> {
      if (cached && now() - cached.at < CAPABILITIES_TTL_MS) return cached.value;
      const value = (await foundryClient.query(
        'foundry-mcp-bridge.getCapabilities'
      )) as Capabilities;
      cached = { at: now(), value };
      return value;
    },
  };
}
