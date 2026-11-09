/**
 * Foundry settings: read them, and change them. Foundry has hundreds (the core ones, the game
 * system's, and every module's), so a list shows the ones a GM can see in the settings window
 * unless asked for all of them.
 *
 * Some settings are never changed from here:
 * - those of this bridge module (the access level, the execute and image generation switches):
 *   a tool that is limited by them must not be able to lift the limit;
 * - the list of active modules (`modules` does that, with its checks) and the role permissions
 *   of the players;
 * - anything that looks like a secret (a key, token or password): its value is not even shown.
 */

import { MODULE_ID } from '../constants.js';
import { auditLog, validateFoundryState } from './support.js';

export interface SettingsRequest {
  action: 'list' | 'get' | 'set';
  key?: string;
  value?: unknown;
  query?: string;
  namespace?: string;
  scope?: string;
  all?: boolean;
}

const SECRET = /(api[-_ ]?key|token|secret|password|passphrase|credential|bearer|auth)/i;

/** Settings that are not changed from here, with what to do instead. */
const REFUSED: Record<string, string> = {
  'core.moduleConfiguration': 'Use the modules tool to switch modules on or off.',
  'core.permissions':
    'The permissions of the player roles are changed in Foundry, under Configure Permissions.',
};

const MAX_VALUE_CHARS = 400;
const MAX_GET_CHARS = 20_000;

function safeJson(value: unknown): unknown {
  try {
    return JSON.parse(JSON.stringify(value ?? null));
  } catch {
    return String(value);
  }
}

function typeName(type: any): string {
  if (!type) return 'unknown';
  if (typeof type === 'function') return type.name || 'class';
  return type.constructor?.name?.replace(/Field$/, '').toLowerCase() ?? typeof type;
}

export class SettingsService {
  async run(request: SettingsRequest): Promise<any> {
    validateFoundryState();
    switch (request.action) {
      case 'list':
        return this.list(request);
      case 'get':
        return this.get(request);
      case 'set':
        return this.set(request);
      default:
        throw new Error(`Unknown settings action: ${String((request as any).action)}`);
    }
  }

  private definitions(): any[] {
    return Array.from(((game as any).settings?.settings as Map<string, any>)?.values?.() ?? []);
  }

  private find(key: string): any {
    const found = ((game as any).settings?.settings as Map<string, any>)?.get?.(key);
    if (!found) {
      throw new Error(
        `No setting "${key}". Settings are named namespace.key, for example "core.fontSize"; list finds them.`
      );
    }
    return found;
  }

  private label(definition: any): string {
    const name = String(definition.name ?? definition.key);
    return (game as any).i18n?.localize?.(name) ?? name;
  }

  private isSecret(definition: any): boolean {
    return SECRET.test(String(definition.key)) || SECRET.test(String(definition.name ?? ''));
  }

  private current(definition: any): unknown {
    try {
      return (game as any).settings.get(definition.namespace, definition.key);
    } catch {
      return undefined;
    }
  }

  private shown(definition: any, value: unknown, limit: number): unknown {
    if (this.isSecret(definition)) return '[hidden]';
    const json = safeJson(value);
    const size = JSON.stringify(json)?.length ?? 0;
    return size > limit ? { tooLarge: size, hint: 'Read it with get.' } : json;
  }

  private row(definition: any): Record<string, unknown> {
    const value = this.current(definition);
    return {
      key: `${definition.namespace}.${definition.key}`,
      name: this.label(definition),
      scope: definition.scope,
      type: typeName(definition.type),
      value: this.shown(definition, value, MAX_VALUE_CHARS),
      default: this.shown(definition, definition.default, MAX_VALUE_CHARS),
      requiresReload: !!definition.requiresReload,
      ...(definition.config ? {} : { config: false }),
    };
  }

  private list(request: SettingsRequest): any {
    let rows = this.definitions();
    if (!request.all) rows = rows.filter(definition => definition.config);
    if (request.namespace)
      rows = rows.filter(definition => definition.namespace === request.namespace);
    if (request.scope) rows = rows.filter(definition => definition.scope === request.scope);
    if (request.query) {
      const needle = request.query.toLowerCase();
      rows = rows.filter(
        definition =>
          `${definition.namespace}.${definition.key}`.toLowerCase().includes(needle) ||
          this.label(definition).toLowerCase().includes(needle)
      );
    }
    const settings = rows
      .map(definition => this.row(definition))
      .sort((a, b) => String(a['key']).localeCompare(String(b['key'])));
    return { total: settings.length, settings };
  }

  private get(request: SettingsRequest): any {
    if (!request.key) throw new Error('get needs key, for example "core.fontSize".');
    const definition = this.find(request.key);
    const hint = definition.hint
      ? ((game as any).i18n?.localize?.(definition.hint) ?? definition.hint)
      : undefined;
    return {
      ...this.row(definition),
      value: this.shown(definition, this.current(definition), MAX_GET_CHARS),
      ...(hint ? { hint } : {}),
      ...(definition.choices ? { choices: safeJson(definition.choices) } : {}),
      ...(definition.range ? { range: safeJson(definition.range) } : {}),
      ...(this.isSecret(definition) ? { hidden: true } : {}),
      changeable: this.refusal(request.key, definition) === undefined,
    };
  }

  /** Why a setting is not changed from here, or undefined if it can be. */
  private refusal(key: string, definition: any): string | undefined {
    if (definition.namespace === MODULE_ID) {
      return `The settings of ${MODULE_ID} (the access level, script execution, image generation) can only be changed in Foundry itself: a limit on this tool must not be liftable by it.`;
    }
    if (key in REFUSED) return REFUSED[key];
    if (this.isSecret(definition))
      return `${key} looks like a secret (a key, token or password) and is not changed from here.`;
    return undefined;
  }

  private async set(request: SettingsRequest): Promise<any> {
    if (!request.key) throw new Error('set needs key, for example "core.fontSize".');
    if (request.value === undefined) throw new Error('set needs value.');
    const definition = this.find(request.key);
    const refusal = this.refusal(request.key, definition);
    if (refusal) throw new Error(refusal);

    const expected = typeName(definition.type);
    const value = request.value;
    const actual = Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value;
    const wrong =
      (expected === 'Boolean' && actual !== 'boolean') ||
      (expected === 'Number' && actual !== 'number') ||
      (expected === 'String' && actual !== 'string');
    if (wrong) throw new Error(`${request.key} takes a ${expected.toLowerCase()}, got ${actual}.`);

    const before = safeJson(this.current(definition));
    await (game as any).settings.set(definition.namespace, definition.key, value);
    const after = safeJson(this.current(definition));
    auditLog('settings.set', { key: request.key }, 'success');

    const reload = !!definition.requiresReload;
    return {
      success: true,
      key: request.key,
      scope: definition.scope,
      from: before,
      to: after,
      requiresReload: reload,
      message:
        [
          definition.scope === 'client'
            ? 'A client setting: it is stored in this GM browser only.'
            : undefined,
          reload
            ? 'Foundry applies this setting only after a reload (world reload, then F5 in every browser).'
            : undefined,
        ]
          .filter(Boolean)
          .join(' ') || undefined,
    };
  }
}
