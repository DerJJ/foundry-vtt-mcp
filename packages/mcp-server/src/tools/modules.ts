import { z } from 'zod';
import { FoundryClient } from '../foundry-client.js';
import { Logger } from '../logger.js';

export interface ModulesToolsOptions {
  foundryClient: FoundryClient;
  logger: Logger;
}

const requestSchema = z.object({
  action: z.enum(['list', 'get', 'set-active']),
  id: z.string().min(1).optional(),
  ids: z.array(z.string().min(1)).min(1).optional(),
  active: z.boolean().optional(),
  query: z.string().optional(),
  withDependencies: z.boolean().optional(),
  withDependents: z.boolean().optional(),
});

/** The Foundry modules of the world: which are installed and running, and switching them. */
export class ModulesTools {
  private foundryClient: FoundryClient;
  private logger: Logger;

  constructor({ foundryClient, logger }: ModulesToolsOptions) {
    this.foundryClient = foundryClient;
    this.logger = logger.child({ component: 'ModulesTools' });
  }

  getToolDefinitions() {
    return [
      {
        name: 'modules',
        description:
          'The Foundry modules of this world. list shows what is installed and what runs; get reads one ' +
          'module with its requirements; set-active switches modules on or off. Foundry applies a ' +
          'switch only when the world loads again, so every browser has to reload (F5) afterwards: ' +
          'until then a module shows pendingReload.',
        inputSchema: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['list', 'get', 'set-active'] },
            id: { type: 'string', description: 'A module id such as "polyglot".' },
            ids: {
              type: 'array',
              items: { type: 'string' },
              description: 'set-active: several module ids at once.',
            },
            active: {
              type: 'boolean',
              description:
                'list: only running (true) or not running (false) modules. set-active: switch them on (true) or off (false).',
            },
            query: {
              type: 'string',
              description: 'list: only modules whose id or title contains this.',
            },
            withDependencies: {
              type: 'boolean',
              description: 'set-active on: also switch on the modules these require.',
            },
            withDependents: {
              type: 'boolean',
              description: 'set-active off: also switch off the active modules that require these.',
            },
          },
          required: ['action'],
        },
      },
    ];
  }

  async handleModules(args: unknown): Promise<any> {
    const request = requestSchema.parse(args);
    this.logger.info('modules', {
      action: request.action,
      id: request.id,
      active: request.active,
    });
    return this.foundryClient.query('foundry-mcp-bridge.modules', request);
  }
}
