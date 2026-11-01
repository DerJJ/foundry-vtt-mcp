/**
 * Compendium Entry Tools
 *
 * CRUD for the documents *inside* a compendium pack, plus a copy action that
 * pulls an existing document (an SRD compendium entry, a world actor, another
 * pack's entry) into the target pack by UUID.
 *
 * Every action is pack-scoped. System data is passed straight through to
 * Foundry's DataModel layer, exactly as manage-world-items does — this tool does
 * not know or validate any system's item schema. Folder paths inside a pack are
 * parsed to segments here (same "/"-separated form as manage-folders) so bad
 * paths fail on the server.
 */

import { z } from 'zod';
import { FoundryClient } from '../foundry-client.js';
import { Logger } from '../logger.js';
import { parseFolderPath } from './folder-path.js';

// ─────────────────────────────────────────────────────────────────────────────

const packSchema = z
  .string()
  .min(1, 'pack is required: pass the compendium id ("world.my-monsters") or its label');

const entrySchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1).optional(),
  img: z.string().min(1).optional(),
  system: z.record(z.any()).optional(),
  folder: z.string().min(1).optional(),
});

const updateSchema = z.object({
  identifier: z.string().min(1),
  name: z.string().min(1).optional(),
  img: z.string().min(1).optional(),
  system: z.record(z.any()).optional(),
  folder: z.string().min(1).optional(),
});

/** Replace an entry's "folder" path string with parsed "folderSegments". */
function resolveFolder(entry: Record<string, any>): Record<string, any> {
  const { folder, ...rest } = entry;
  if (folder === undefined) return rest;
  return { ...rest, folderSegments: parseFolderPath(folder) };
}

export interface CompendiumEntryToolsOptions {
  foundryClient: FoundryClient;
  logger: Logger;
}

export class CompendiumEntryTools {
  private foundryClient: FoundryClient;
  private logger: Logger;

  constructor({ foundryClient, logger }: CompendiumEntryToolsOptions) {
    this.foundryClient = foundryClient;
    this.logger = logger.child({ component: 'CompendiumEntryTools' });
  }

  getToolDefinitions() {
    return [
      {
        name: 'manage-compendium-entries',
        description:
          'Create, list, update, delete, and copy documents inside a compendium pack. ' +
          'The pack itself is managed by manage-compendiums. Every action needs "pack" ' +
          '(a pack id like "world.my-monsters", or its label). Only unlocked world packs ' +
          'can be written.\n' +
          '- "list": Index entries in the pack, with optional nameFilter/type.\n' +
          '- "create": Add new documents. Each entry needs a name; "type" is the document ' +
          'subtype (e.g. "npc", "weapon") where the system has one. "system" is free-form ' +
          'system data. "folder" is a "/"-path inside the pack, created if absent.\n' +
          '- "update": Patch entries by "identifier" (entry name or id within the pack).\n' +
          '- "delete": Remove entries by name/id. Requires "confirmDelete: true".\n' +
          '- "copy": Copy an existing document into the pack by "source" UUID ' +
          '(e.g. "Compendium.dnd5e.monsters.Actor.xxxx" or "Actor.xxxx"). The source ' +
          "document type must match the pack's type.",
        inputSchema: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              description: 'Operation to perform.',
              enum: ['list', 'create', 'update', 'delete', 'copy'],
            },
            pack: {
              type: 'string',
              description: 'Pack id ("world.my-monsters") or label. Required for every action.',
            },
            nameFilter: {
              type: 'string',
              description: 'For "list": case-insensitive substring match on entry name.',
            },
            type: {
              type: 'string',
              description: 'For "list": filter to this document subtype.',
            },
            entries: {
              type: 'array',
              minItems: 1,
              description: 'Required for "create". Documents to add.',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string', description: 'Document name.' },
                  type: {
                    type: 'string',
                    description:
                      'Document subtype (e.g. "npc", "weapon"), where the system has one.',
                  },
                  img: { type: 'string', description: 'Icon/portrait path.' },
                  system: {
                    type: 'object',
                    description:
                      "Free-form system data, passed through to Foundry's DataModel layer.",
                    additionalProperties: true,
                  },
                  folder: {
                    type: 'string',
                    description: '"/"-separated folder path inside the pack, created if absent.',
                  },
                },
                required: ['name'],
              },
            },
            updates: {
              type: 'array',
              minItems: 1,
              description:
                'Required for "update". Each patch needs "identifier" plus a field to change.',
              items: {
                type: 'object',
                properties: {
                  identifier: {
                    type: 'string',
                    description: 'Entry name or id within the pack.',
                  },
                  name: { type: 'string', description: 'New name.' },
                  img: { type: 'string', description: 'New icon/portrait path.' },
                  system: {
                    type: 'object',
                    description: 'System fields to merge into existing system data.',
                    additionalProperties: true,
                  },
                  folder: {
                    type: 'string',
                    description:
                      'Move the entry to this "/"-path inside the pack, created if absent.',
                  },
                },
                required: ['identifier'],
              },
            },
            identifiers: {
              type: 'array',
              minItems: 1,
              description: 'Required for "delete". Entry names or ids to remove.',
              items: { type: 'string' },
            },
            confirmDelete: {
              type: 'boolean',
              description: 'Required confirmation for "delete".',
            },
            source: {
              type: 'string',
              description:
                'Required for "copy". UUID of the document to copy in ' +
                '(e.g. "Compendium.dnd5e.monsters.Actor.xxxx", "Actor.xxxx").',
            },
            newName: {
              type: 'string',
              description: 'For "copy": rename the copy (defaults to the source name).',
            },
            folder: {
              type: 'string',
              description:
                'For "copy": "/"-path inside the pack to place the copy, created if absent.',
            },
          },
          required: ['action'],
        },
      },
    ];
  }

  async handleManageCompendiumEntries(args: any): Promise<any> {
    const { action } = z
      .object({ action: z.enum(['list', 'create', 'update', 'delete', 'copy']) })
      .parse(args);

    switch (action) {
      case 'list':
        return this.handleList(args);
      case 'create':
        return this.handleCreate(args);
      case 'update':
        return this.handleUpdate(args);
      case 'delete':
        return this.handleDelete(args);
      case 'copy':
        return this.handleCopy(args);
    }
  }

  // ── list ──────────────────────────────────────────────────────────────────

  private async handleList(args: any): Promise<any> {
    const p = z
      .object({
        pack: packSchema,
        nameFilter: z.string().min(1).optional(),
        type: z.string().min(1).optional(),
      })
      .parse(args);

    const payload: Record<string, any> = { pack: p.pack };
    if (p.nameFilter !== undefined) payload.nameFilter = p.nameFilter;
    if (p.type !== undefined) payload.type = p.type;

    this.logger.info('Listing compendium entries', { pack: p.pack });

    return this.foundryClient.query('foundry-mcp-bridge.listPackEntries', payload);
  }

  // ── create ────────────────────────────────────────────────────────────────

  private async handleCreate(args: any): Promise<any> {
    const p = z.object({ pack: packSchema, entries: z.array(entrySchema).min(1) }).parse(args);

    const entries = p.entries.map(resolveFolder);

    this.logger.info('Creating compendium entries', { pack: p.pack, count: entries.length });

    return this.foundryClient.query('foundry-mcp-bridge.createPackEntries', {
      pack: p.pack,
      entries,
    });
  }

  // ── update ────────────────────────────────────────────────────────────────

  private async handleUpdate(args: any): Promise<any> {
    const p = z.object({ pack: packSchema, updates: z.array(updateSchema).min(1) }).parse(args);

    const updates = p.updates.map(resolveFolder);

    this.logger.info('Updating compendium entries', { pack: p.pack, count: updates.length });

    return this.foundryClient.query('foundry-mcp-bridge.updatePackEntries', {
      pack: p.pack,
      updates,
    });
  }

  // ── delete ────────────────────────────────────────────────────────────────

  private async handleDelete(args: any): Promise<any> {
    const p = z
      .object({
        pack: packSchema,
        identifiers: z.array(z.string().min(1)).min(1),
        confirmDelete: z.boolean().default(false),
      })
      .parse(args);

    if (!p.confirmDelete) {
      throw new Error(
        `Refusing to delete ${p.identifiers.length} entr${p.identifiers.length === 1 ? 'y' : 'ies'} ` +
          `from "${p.pack}": set confirmDelete: true.`
      );
    }

    this.logger.info('Deleting compendium entries', { pack: p.pack, count: p.identifiers.length });

    return this.foundryClient.query('foundry-mcp-bridge.deletePackEntries', {
      pack: p.pack,
      identifiers: p.identifiers,
    });
  }

  // ── copy ──────────────────────────────────────────────────────────────────

  private async handleCopy(args: any): Promise<any> {
    const p = z
      .object({
        pack: packSchema,
        source: z.string().min(1),
        newName: z.string().min(1).optional(),
        folder: z.string().min(1).optional(),
      })
      .parse(args);

    const payload: Record<string, any> = { pack: p.pack, source: p.source };
    if (p.folder !== undefined) payload.folderSegments = parseFolderPath(p.folder);
    if (p.newName !== undefined) payload.newName = p.newName;

    this.logger.info('Copying document into compendium', { pack: p.pack, source: p.source });

    return this.foundryClient.query('foundry-mcp-bridge.copyPackEntry', payload);
  }
}
