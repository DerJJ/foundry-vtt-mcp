/**
 * Folder Management Tools
 *
 * CRUD for Foundry Folder documents, addressed by "Parent/Child" paths.
 * Works for any folderable document type — Actor by default, since that is what
 * bulk actor creation needs somewhere to go.
 *
 * Actions: list, create, rename, move, delete
 * Filing an actor into a folder is handled by manage-actors → update (folder field).
 */

import { z } from 'zod';
import { FoundryClient } from '../foundry-client.js';
import { Logger } from '../logger.js';
import { parseFolderPath } from './folder-path.js';

// ─────────────────────────────────────────────────────────────────────────────

/** Foundry document types that support folders. */
const DOCUMENT_TYPES = [
  'Actor',
  'Item',
  'JournalEntry',
  'Scene',
  'RollTable',
  'Cards',
  'Macro',
  'Playlist',
] as const;

const documentTypeSchema = z.enum(DOCUMENT_TYPES).default('Actor');

export interface FolderManagementToolsOptions {
  foundryClient: FoundryClient;
  logger: Logger;
}

export class FolderManagementTools {
  private foundryClient: FoundryClient;
  private logger: Logger;

  constructor({ foundryClient, logger }: FolderManagementToolsOptions) {
    this.foundryClient = foundryClient;
    this.logger = logger.child({ component: 'FolderManagementTools' });
  }

  getToolDefinitions() {
    return [
      {
        name: 'manage-folders',
        description:
          'Create, list, rename, move, and delete folders in Foundry VTT. Folders are addressed by path, ' +
          'using "/" to nest (e.g. "Iron Gods/Book 1 - Fires of Creation/Torch"); missing parent folders are ' +
          'created automatically. Works for any folderable document type (Actor by default).\n' +
          '- "list": Return the folder tree for a document type, with each folder\'s path and content count.\n' +
          '- "create": Create a folder at the given path, creating any missing parents.\n' +
          '- "rename": Rename the folder at the given path, leaving it where it is.\n' +
          '- "move": Reparent the folder at the given path under newParentPath (null moves it to the root).\n' +
          '- "delete": Delete the folder. By default its contents are kept and moved up to the parent; ' +
          'destroying the contents requires BOTH deleteContents and confirmDelete.\n' +
          'To file an actor into a folder, use manage-actors → update with the "folder" field.',
        inputSchema: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              description: 'Operation to perform.',
              enum: ['list', 'create', 'rename', 'move', 'delete'],
            },
            path: {
              type: 'string',
              description:
                'Folder path, "/" separated (e.g. "Iron Gods/Torch"). Required for create, rename, move and delete. ' +
                'A folder name containing a literal "/" cannot be addressed this way.',
            },
            documentType: {
              type: 'string',
              description: 'Which document type the folder holds. Defaults to "Actor".',
              enum: [...DOCUMENT_TYPES],
            },
            newName: {
              type: 'string',
              description: 'Required for "rename": the folder\'s new name (a name, not a path).',
            },
            newParentPath: {
              type: ['string', 'null'],
              description:
                'Required for "move": path of the new parent folder, or null to move to the root.',
            },
            deleteContents: {
              type: 'boolean',
              description:
                'For "delete": also delete the documents and subfolders inside. Defaults to false, ' +
                'which keeps them and moves them up to the parent. Requires confirmDelete.',
              default: false,
            },
            confirmDelete: {
              type: 'boolean',
              description:
                'Required confirmation when deleteContents is true. Guards against destroying actors ' +
                'as a side effect of tidying folders.',
              default: false,
            },
          },
          required: ['action'],
        },
      },
    ];
  }

  async handleManageFolders(args: any): Promise<any> {
    const { action } = z
      .object({
        action: z.enum(['list', 'create', 'rename', 'move', 'delete']),
      })
      .parse(args);

    switch (action) {
      case 'list':
        return this.handleList(args);
      case 'create':
        return this.handleCreate(args);
      case 'rename':
        return this.handleRename(args);
      case 'move':
        return this.handleMove(args);
      case 'delete':
        return this.handleDelete(args);
    }
  }

  // ── list ──────────────────────────────────────────────────────────────────

  private async handleList(args: any): Promise<any> {
    const { documentType } = z.object({ documentType: documentTypeSchema }).parse(args);

    this.logger.info('Listing folders', { documentType });

    return this.foundryClient.query('foundry-mcp-bridge.listFolders', { documentType });
  }

  // ── create ────────────────────────────────────────────────────────────────

  private async handleCreate(args: any): Promise<any> {
    const { path, documentType } = z
      .object({ path: z.string(), documentType: documentTypeSchema })
      .parse(args);

    const segments = parseFolderPath(path);

    this.logger.info('Creating folder', { segments, documentType });

    return this.foundryClient.query('foundry-mcp-bridge.createFolder', { segments, documentType });
  }

  // ── rename ────────────────────────────────────────────────────────────────

  private async handleRename(args: any): Promise<any> {
    const { path, documentType, newName } = z
      .object({
        path: z.string(),
        documentType: documentTypeSchema,
        newName: z.string().min(1),
      })
      .parse(args);

    const segments = parseFolderPath(path);

    this.logger.info('Renaming folder', { segments, documentType, newName });

    return this.foundryClient.query('foundry-mcp-bridge.renameFolder', {
      segments,
      documentType,
      newName,
    });
  }

  // ── move ──────────────────────────────────────────────────────────────────

  private async handleMove(args: any): Promise<any> {
    const { path, documentType, newParentPath } = z
      .object({
        path: z.string(),
        documentType: documentTypeSchema,
        newParentPath: z.string().nullable(),
      })
      .parse(args);

    const segments = parseFolderPath(path);
    const newParentSegments = newParentPath === null ? null : parseFolderPath(newParentPath);

    this.logger.info('Moving folder', { segments, documentType, newParentSegments });

    return this.foundryClient.query('foundry-mcp-bridge.moveFolder', {
      segments,
      documentType,
      newParentSegments,
    });
  }

  // ── delete ────────────────────────────────────────────────────────────────

  private async handleDelete(args: any): Promise<any> {
    const { path, documentType, deleteContents, confirmDelete } = z
      .object({
        path: z.string(),
        documentType: documentTypeSchema,
        deleteContents: z.boolean().default(false),
        confirmDelete: z.boolean().default(false),
      })
      .parse(args);

    const segments = parseFolderPath(path);

    // Deleting a folder is recoverable; deleting the actors inside it is not.
    if (deleteContents && !confirmDelete) {
      throw new Error(
        `Refusing to delete the contents of "${path}": set confirmDelete: true to destroy the ` +
          `documents and subfolders inside. Omit deleteContents to delete only the folder and keep them.`
      );
    }

    this.logger.info('Deleting folder', { segments, documentType, deleteContents });

    return this.foundryClient.query('foundry-mcp-bridge.deleteFolder', {
      segments,
      documentType,
      deleteContents,
    });
  }
}
