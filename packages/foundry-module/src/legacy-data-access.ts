import type { FoundryDataAccess } from './data-access.js';
import { validateFoundryState } from './services/support.js';

/**
 * The bridge used to expose one large data-access object on `window.foundryMCPBridge.dataAccess`,
 * so macros could call `dataAccess.getCharacterInfo(...)`. The operations now live in services
 * (`dataAccess.characters.getCharacterInfo(...)`). This view keeps the flat calls working: a call
 * to a method that is not on the facade is forwarded to the one service that has it.
 * New code should call the services directly.
 */
export function withLegacyMethods(dataAccess: FoundryDataAccess): FoundryDataAccess {
  const warned = new Set<string>();

  const findService = (name: string): object | undefined => {
    for (const value of Object.values(dataAccess)) {
      if (
        value &&
        typeof value === 'object' &&
        typeof (value as Record<string, unknown>)[name] === 'function'
      ) {
        return value;
      }
    }
    return undefined;
  };

  return new Proxy(dataAccess, {
    get(target, prop, receiver) {
      if (typeof prop !== 'string' || prop in target) return Reflect.get(target, prop, receiver);
      if (prop === 'validateFoundryState') return validateFoundryState;
      const service = findService(prop);
      if (!service) return undefined;
      if (!warned.has(prop)) {
        warned.add(prop);
        console.warn(
          `[foundry-mcp-bridge] dataAccess.${prop}() is deprecated: call it on its service instead.`
        );
      }
      return (service as any)[prop].bind(service);
    },
  });
}
