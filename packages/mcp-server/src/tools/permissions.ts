import { z } from 'zod';
import { FoundryClient } from '../foundry-client.js';
import { Logger } from '../logger.js';

export interface PermissionsToolsOptions {
  foundryClient: FoundryClient;
  logger: Logger;
}

/** Read-only access to Foundry's world role permissions and document ownership. */
export class PermissionsTools {
  private foundryClient: FoundryClient;
  private logger: Logger;

  constructor({ foundryClient, logger }: PermissionsToolsOptions) {
    this.foundryClient = foundryClient;
    this.logger = logger.child({ component: 'PermissionsTools' });
  }

  getToolDefinitions() {
    return [
      {
        name: 'get-permissions',
        description:
          'Show Foundry world permissions by user role. Optionally include the explicit ownership entries for one Actor, Scene, or JournalEntry.',
        inputSchema: {
          type: 'object',
          properties: {
            identifier: {
              type: 'string',
              description: 'Foundry ID or name of the Actor, Scene, or JournalEntry to inspect.',
            },
            documentType: {
              type: 'string',
              enum: ['Actor', 'Scene', 'JournalEntry'],
              description: 'Document type for identifier. Required when identifier is supplied.',
            },
          },
        },
      },
    ];
  }

  async handleGetPermissions(args: any): Promise<any> {
    const params = z
      .object({
        identifier: z.string().min(1).optional(),
        documentType: z.enum(['Actor', 'Scene', 'JournalEntry']).optional(),
      })
      .refine(value => Boolean(value.identifier) === Boolean(value.documentType), {
        message: 'identifier and documentType must be provided together',
      })
      .parse(args);

    this.logger.info('Getting Foundry permissions', {
      documentType: params.documentType,
      identifier: params.identifier,
    });
    const permissions = await this.foundryClient.query('foundry-mcp-bridge.getPermissions', params);

    return {
      success: true,
      worldPermissions: permissions.worldPermissions.byRole,
      worldPermissionsRaw: permissions.worldPermissions.raw,
      ...(permissions.document ? { document: permissions.document } : {}),
    };
  }
}
