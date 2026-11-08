import { buildDomainTool } from './domain-tool.js';
import { createDomainContext } from './domain-context.js';
import { DOMAIN_TOOLS } from './domain-tools.js';
import { createOperationCatalog, type ToolRegistryDeps } from './operations.js';
import { ToolRegistry } from './tool-registry.js';

export type { ToolRegistryDeps } from './operations.js';

/**
 * Creates the tool registry that clients see: the domain tools (ADR-0004), each built on top
 * of the operations that implement its actions. The order is the order of the tool list.
 */
export function createToolRegistry(deps: ToolRegistryDeps): ToolRegistry {
  const catalog = createOperationCatalog(deps);
  const context = createDomainContext(deps.foundryClient, deps.logger);
  const registry = new ToolRegistry();
  for (const spec of DOMAIN_TOOLS) {
    registry.registerModule(buildDomainTool(spec, catalog, context));
  }
  return registry;
}
