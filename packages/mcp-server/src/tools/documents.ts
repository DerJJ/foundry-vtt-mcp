import { z } from 'zod';
import { FoundryClient } from '../foundry-client.js';
import { Logger } from '../logger.js';
import { parseFolderPath } from './folder-path.js';

export interface DocumentsToolsOptions {
  foundryClient: FoundryClient;
  logger: Logger;
}

const parentSchema: Record<string, unknown> = {
  type: 'object',
  description:
    'The document this one lives in: {type, id or name, parent?}. For an item on an actor: {"type":"Actor","name":"Hero"}. ' +
    'It can have its own parent, for an effect on an item on an actor.',
  properties: {
    type: { type: 'string' },
    id: { type: 'string' },
    name: { type: 'string' },
    parent: { type: 'object' },
  },
  required: ['type'],
};

const selector: z.ZodType<any> = z.lazy(() =>
  z.object({
    type: z.string().min(1),
    id: z.string().optional(),
    name: z.string().optional(),
    parent: selector.optional(),
  })
);

const requestSchema = z.object({
  action: z.enum(['list', 'get', 'create', 'update', 'delete', 'schema']),
  type: z.string().min(1).optional(),
  subtype: z.string().min(1).optional(),
  kind: z.string().min(1).optional(),
  id: z.union([z.string(), z.array(z.string())]).optional(),
  name: z.string().optional(),
  parent: selector.optional(),
  pack: z.string().min(1).optional(),
  folder: z.string().min(1).optional(),
  from: z
    .object({
      packId: z.string().optional(),
      itemId: z.string().optional(),
      uuid: z.string().optional(),
    })
    .optional(),
  data: z.any().optional(),
  query: z.string().optional(),
  filter: z.record(z.unknown()).optional(),
  fields: z.array(z.string()).optional(),
  limit: z.number().int().positive().optional(),
  offset: z.number().int().min(0).optional(),
  confirm: z.boolean().optional(),
  deleteContents: z.boolean().optional(),
  maxChars: z.number().int().positive().optional(),
});

/** Plain changes to any Foundry document (ADR-0007). One operation; the domain tool fixes `action`. */
export class DocumentsTools {
  private foundryClient: FoundryClient;
  private logger: Logger;

  constructor({ foundryClient, logger }: DocumentsToolsOptions) {
    this.foundryClient = foundryClient;
    this.logger = logger.child({ component: 'DocumentsTools' });
  }

  getToolDefinitions() {
    return [
      {
        name: 'documents',
        description:
          'List, read, create, change and delete any Foundry document: an actor, an item on an actor, ' +
          'a scene and its walls, a journal and its pages, a playlist, a macro, a folder, an entry of a compendium pack. ' +
          'Call schema first for the fields of a type in this world.',
        inputSchema: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['list', 'get', 'create', 'update', 'delete', 'schema'],
            },
            type: {
              type: 'string',
              description:
                'The document type: Actor, Item, Scene, JournalEntry, RollTable, Playlist, Macro, Cards, Folder; ' +
                'or one that lives inside another document (with parent): Item or ActiveEffect on an actor, ' +
                'Token, Wall, AmbientLight, AmbientSound, Region, Tile, Note, Drawing in a scene, ' +
                'JournalEntryPage in a journal, PlaylistSound in a playlist.',
            },
            subtype: {
              type: 'string',
              description:
                'The game system\'s type of the document: "spell" or "weapon" for an Item, "npc" for an Actor. ' +
                'For a Folder, the type of document it holds, for example "Actor".',
            },
            kind: {
              type: 'string',
              description:
                "A group of a system's item types: inventory, spells, features (the system may add more; schema lists them).",
            },
            id: {
              description: 'The document id. A list of ids works for delete.',
              oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
            },
            name: {
              type: 'string',
              description:
                'Find the document by its exact name (not case sensitive) instead of an id.',
            },
            parent: parentSchema,
            pack: {
              type: 'string',
              description:
                'Work in this compendium pack (id such as "world.my-monsters") instead of the world. Only unlocked world packs can be changed.',
            },
            folder: {
              type: 'string',
              description:
                'A folder path such as "Monsters/Goblins". For create it files the new documents there (created if missing). ' +
                'For type Folder it is the folder itself.',
            },
            from: {
              type: 'object',
              description:
                'Create a copy of a compendium entry: {"packId":"dnd5e.monsters","itemId":"<entry id>"} or {"uuid":"Compendium...."}. data is put on top.',
              properties: {
                packId: { type: 'string' },
                itemId: { type: 'string' },
                uuid: { type: 'string' },
              },
            },
            data: {
              description:
                'The fields, as Foundry stores them (schema shows them). For create an object or a list of objects; ' +
                'for update an object (applied to the document found by id or name) or a list where every object has an id. ' +
                'Dotted keys work: {"system.hp.value": 3}. For a Folder update: {"name": "New"} to rename, {"parent": ["A","B"]} or {"parent": null} to move.',
              oneOf: [{ type: 'object' }, { type: 'array', items: { type: 'object' } }],
            },
            query: {
              type: 'string',
              description: 'list: only documents whose name contains this.',
            },
            filter: {
              type: 'object',
              description:
                'list: only documents whose fields match, by dotted path: {"system.level": 3, "type": "spell"}. A list of values matches any of them.',
            },
            fields: {
              type: 'array',
              items: { type: 'string' },
              description:
                'get and list: return only these dotted paths, for example ["name","system.attributes.hp"]. Without it a large document is summarised instead of returned.',
            },
            limit: { type: 'integer', description: 'list: documents to return (default 50).' },
            offset: { type: 'integer', description: 'list: documents to skip.' },
            confirm: {
              type: 'boolean',
              description:
                'delete: needed to delete more than one document, or a folder with its contents.',
            },
            deleteContents: {
              type: 'boolean',
              description: 'delete of a Folder: also delete what is in it. Needs confirm.',
            },
            maxChars: {
              type: 'integer',
              description:
                'get: the size above which a document is summarised (default 40000, at most 200000).',
            },
          },
          required: ['action'],
        },
      },
    ];
  }

  async handleDocuments(args: unknown): Promise<any> {
    const request = requestSchema.parse(args);
    const { folder, ...rest } = request;
    const payload: Record<string, unknown> = { ...rest };

    if (folder !== undefined) payload['folderSegments'] = parseFolderPath(folder);
    // A folder is moved by naming its new parent as a path.
    if (request.type === 'Folder' && request.action === 'update') {
      const data = request.data as { parent?: unknown } | undefined;
      if (data && typeof data.parent === 'string') {
        payload['data'] = { ...data, parent: parseFolderPath(data.parent) };
      }
    }

    this.logger.info('documents', {
      action: request.action,
      type: request.type,
      pack: request.pack,
    });
    return this.foundryClient.query('foundry-mcp-bridge.documents', payload);
  }
}
