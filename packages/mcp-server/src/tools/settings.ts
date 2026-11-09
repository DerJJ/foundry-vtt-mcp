import { z } from 'zod';
import { FoundryClient } from '../foundry-client.js';
import { Logger } from '../logger.js';

export interface SettingsToolsOptions {
  foundryClient: FoundryClient;
  logger: Logger;
}

const requestSchema = z.object({
  action: z.enum(['list', 'get', 'set']),
  key: z.string().min(1).optional(),
  value: z.any().optional(),
  query: z.string().optional(),
  namespace: z.string().min(1).optional(),
  scope: z.enum(['world', 'client', 'user']).optional(),
  all: z.boolean().optional(),
});

/** Foundry settings, and reloading the GM browser. */
export class SettingsTools {
  private foundryClient: FoundryClient;
  private logger: Logger;

  constructor({ foundryClient, logger }: SettingsToolsOptions) {
    this.foundryClient = foundryClient;
    this.logger = logger.child({ component: 'SettingsTools' });
  }

  getToolDefinitions() {
    return [
      {
        name: 'settings',
        description:
          'Foundry settings of the core, the game system and the modules. list finds them; get reads one; ' +
          'set changes one. The settings of the bridge module itself, the module list (use modules), the ' +
          'player role permissions and anything that looks like a secret cannot be changed from here.',
        inputSchema: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['list', 'get', 'set'] },
            key: {
              type: 'string',
              description:
                'The setting as namespace.key, for example "core.fontSize" or "dnd5e.metricWeightUnits".',
            },
            value: {
              description:
                'set: the new value, of the type the setting takes (boolean, number, string, object).',
            },
            query: {
              type: 'string',
              description: 'list: only settings whose key or name contains this.',
            },
            namespace: {
              type: 'string',
              description:
                'list: only settings of this namespace: "core", the game system id, or a module id.',
            },
            scope: {
              type: 'string',
              enum: ['world', 'client', 'user'],
              description:
                'list: only world settings (the whole world) or client settings (this browser).',
            },
            all: {
              type: 'boolean',
              description: 'list: also settings that Foundry does not show in its settings window.',
            },
          },
          required: ['action'],
        },
      },
      {
        name: 'reload-browser',
        description:
          'Reload this GM browser, which is what makes Foundry apply a module switch. The bridge connects ' +
          'again by itself afterwards. Other browsers (players) are not reloaded.',
        inputSchema: { type: 'object', properties: {} },
      },
    ];
  }

  async handleSettings(args: unknown): Promise<any> {
    const request = requestSchema.parse(args);
    this.logger.info('settings', { action: request.action, key: request.key });
    return this.foundryClient.query('foundry-mcp-bridge.settings', request);
  }

  async handleReloadBrowser(): Promise<any> {
    this.logger.info('Reloading the GM browser');
    return this.foundryClient.query('foundry-mcp-bridge.reloadClient', {});
  }
}
