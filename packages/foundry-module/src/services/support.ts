import { MODULE_ID } from '../constants.js';

/**
 * Sanitize data to remove sensitive information and make it JSON-safe
 */
export function sanitizeData(data: any): any {
  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data !== 'object') {
    return data;
  }

  try {
    // removeSensitiveFields now returns a sanitized copy
    const sanitized = removeSensitiveFields(data);

    // Use custom JSON serializer to avoid deprecated property warnings
    const jsonString = safeJSONStringify(sanitized);
    return JSON.parse(jsonString);
  } catch (error) {
    console.warn(`[${MODULE_ID}] Failed to sanitize data:`, error);
    return {};
  }
}

/**
 * Remove sensitive fields from data object with circular reference protection
 * Returns a sanitized copy instead of modifying the original
 */
export function removeSensitiveFields(
  obj: any,
  visited: WeakSet<object> = new WeakSet(),
  depth: number = 0,
  path: string[] = []
): any {
  // Handle primitives
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  // Safety depth limit to prevent extremely deep recursion
  if (depth > 50) {
    console.warn(`[${MODULE_ID}] Sanitization depth limit reached at depth ${depth}`);
    return '[Max depth reached]';
  }

  // Check for circular reference
  if (visited.has(obj)) {
    return '[Circular Reference]';
  }

  // Mark this object as visited
  visited.add(obj);

  try {
    // Handle arrays
    if (Array.isArray(obj)) {
      return obj.map((item, index) =>
        removeSensitiveFields(item, visited, depth + 1, [...path, String(index)])
      );
    }

    // Create a new sanitized object
    const sanitized: any = {};

    // Use Object.keys (does not invoke getters) so we can filter deprecated
    // accessor properties before reading their values.
    const keys = Object.keys(obj);

    // dnd5e 5.3 moved senses.darkvision/blindsight/tremorsense/truesight to
    // senses.ranges.*. The legacy keys remain as deprecated getters that
    // log a warning when read. Detect this shape and skip the legacy keys.
    const DEPRECATED_DND5E_SENSE_KEYS = ['darkvision', 'blindsight', 'tremorsense', 'truesight'];
    const isDnd5eSensesShape =
      keys.includes('ranges') && keys.some(k => DEPRECATED_DND5E_SENSE_KEYS.includes(k));

    for (const key of keys) {
      // Skip sensitive and problematic fields entirely
      if (isSensitiveOrProblematicField(key, path)) {
        continue;
      }

      // Skip most private properties except essential ones.
      // _stats (Foundry document audit metadata) and _source (raw stored data
      // duplicate) are bloat in tool output; we keep only _id.
      if (key.startsWith('_') && key !== '_id') {
        continue;
      }

      if (isDnd5eSensesShape && DEPRECATED_DND5E_SENSE_KEYS.includes(key)) {
        continue;
      }

      // Recursively sanitize the value (read only after filter to avoid getter-triggered warnings)
      sanitized[key] = removeSensitiveFields(obj[key], visited, depth + 1, [...path, key]);
    }

    return sanitized;
  } catch (error) {
    console.warn(`[${MODULE_ID}] Error during sanitization at depth ${depth}:`, error);
    return '[Sanitization failed]';
  }
}

/**
 * Check if a field should be excluded from sanitized output
 */
export function isSensitiveOrProblematicField(key: string, parentPath: string[]): boolean {
  const sensitiveKeys = [
    'password',
    'token',
    'secret',
    'key',
    'auth',
    'credential',
    'session',
    'cookie',
    'private',
  ];

  const problematicKeys = [
    'parent',
    '_parent',
    'collection',
    'apps',
    'document',
    '_document',
    'constructor',
    'prototype',
    '__proto__',
    'valueOf',
    'toString',
    // dnd5e item leveling metadata; full of cycles back to the actor and other items.
    // Detailed Item reads reinsert only the separately sanitized serialized source value.
    'advancement',
  ];

  // dnd5e retains ability.save as a deprecated accessor which warns when read.
  // Other save fields, including Activity save configuration, are document data.
  const isDeprecatedDnd5eAbilitySave =
    game.system?.id === 'dnd5e' &&
    key === 'save' &&
    parentPath[parentPath.length - 2] === 'abilities';

  // `key` is structural, not a credential, inside PF2e rule elements (rules[i].key
  // names the element type, e.g. FlatModifier) and ActiveEffect changes
  // (changes[i].key is the attribute path being modified). Stripping it there
  // left both unreadable on every read path.
  const isStructuralKey =
    key === 'key' &&
    ['rules', 'changes'].includes(parentPath[parentPath.length - 2]) &&
    /^\d+$/.test(parentPath[parentPath.length - 1] ?? '');

  return (
    (sensitiveKeys.includes(key) && !isStructuralKey) ||
    problematicKeys.includes(key) ||
    isDeprecatedDnd5eAbilitySave
  );
}

/**
 * Custom JSON serializer that handles Foundry objects safely
 */
export function safeJSONStringify(obj: any): string {
  try {
    // Deprecated accessors have already been excluded without reading them by
    // the path-aware removeSensitiveFields traversal above.
    return JSON.stringify(obj);
  } catch (error) {
    console.warn(`[${MODULE_ID}] JSON stringify failed, using fallback:`, error);
    return '{}';
  }
}

/**
 * Validate that Foundry is ready and world is active
 */
export function validateFoundryState(): void {
  if (!game?.ready) {
    throw new Error('Foundry VTT is not ready');
  }

  if (!game.world) {
    throw new Error('No active world');
  }

  if (!game.user) {
    throw new Error('No active user');
  }
}

/**
 * Audit log for write operations
 */
export function auditLog(
  operation: string,
  data: any,
  result: 'success' | 'failure',
  error?: string
): void {
  // Always audit write operations (no setting required)
  const logEntry = {
    timestamp: new Date().toISOString(),
    operation,
    user: game.user?.name || 'Unknown',
    userId: game.user?.id || 'unknown',
    world: game.world?.id || 'unknown',
    data: sanitizeData(data),
    result,
    error,
  };

  // Store in flags for persistence (optional)
  if (game.world && (game.world as any).setFlag) {
    const auditLogs = (game.world as any).getFlag(MODULE_ID, 'auditLogs') || [];
    auditLogs.push(logEntry);

    // Keep only last 100 entries to prevent bloat
    if (auditLogs.length > 100) {
      auditLogs.splice(0, auditLogs.length - 100);
    }

    (game.world as any).setFlag(MODULE_ID, 'auditLogs', auditLogs);
  }
}
