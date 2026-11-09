import { z } from 'zod';
import { FoundryClient } from '../foundry-client.js';
import { Logger } from '../logger.js';
import { parseFolderPath } from './folder-path.js';

export interface CompendiumImportToolsOptions {
  foundryClient: FoundryClient;
  logger: Logger;
}

const importSchema = z.object({
  packId: z.string().min(1, 'packId is required, for example "dnd5e.items"'),
  itemId: z.string().min(1, 'itemId is required: the entry id from a compendium search or list'),
  folder: z.string().min(1).optional(),
});

/** Import one compendium entry of any document type into the world. */
export class CompendiumImportTools {
  private foundryClient: FoundryClient;
  private logger: Logger;

  constructor({ foundryClient, logger }: CompendiumImportToolsOptions) {
    this.foundryClient = foundryClient;
    this.logger = logger.child({ component: 'CompendiumImportTools' });
  }

  getToolDefinitions() {
    return [
      {
        name: 'import-compendium-entry',
        description:
          'Import one compendium entry into the world as a new document, like the Import button in Foundry: ' +
          'an Item, Journal entry, Roll table, Scene, Macro, Playlist, Cards or Actor, with all of its data. ' +
          'Find the pack and entry with compendium.search or compendium.list-entries. ' +
          'Adventures cannot be imported this way. To import actors with custom names or onto a scene, use actors.create-from-compendium.',
        inputSchema: {
          type: 'object',
          properties: {
            packId: {
              type: 'string',
              description: 'Compendium pack id, for example "dnd5e.items".',
            },
            itemId: { type: 'string', description: 'Id of the entry inside the pack.' },
            folder: {
              type: 'string',
              description:
                'Optional world folder to file the new document in, as a "Parent/Child" path; created if missing.',
            },
          },
          required: ['packId', 'itemId'],
        },
      },
    ];
  }

  async handleImportCompendiumEntry(args: unknown): Promise<any> {
    const { packId, itemId, folder } = importSchema.parse(args);
    this.logger.info('Importing compendium entry', { packId, itemId });
    return this.foundryClient.query('foundry-mcp-bridge.importCompendiumDocument', {
      packId,
      documentId: itemId,
      ...(folder !== undefined ? { folderSegments: parseFolderPath(folder) } : {}),
    });
  }
}
