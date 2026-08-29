/**
 * Compendium Management Tools
 *
 * CRUD for the compendium packs themselves (not their contents — that is
 * manage-compendium-entries). Only *world* packs can be written: system and
 * module packs are locked by Foundry, so create always makes a world pack and
 * delete refuses anything that looks like a system/module pack id.
 *
 * Read-only pack discovery already exists as list-compendium-packs; this adds
 * the writes.
 */

import { z } from 'zod';
import { FoundryClient } from '../foundry-client.js';
import { Logger } from '../logger.js';

// ─────────────────────────────────────────────────────────────────────────────

/** Foundry's CONST.COMPENDIUM_DOCUMENT_TYPES (v14). */
const COMPENDIUM_DOCUMENT_TYPES = [
  'Actor',
  'Cards',
  'Item',
  'JournalEntry',
  'Macro',
  'Playlist',
  'RollTable',
  'Scene',
  'Adventure',
] as const;

const compendiumTypeSchema = z.enum(COMPENDIUM_DOCUMENT_TYPES);

/**
 * Reduce a human label to a Foundry pack name: lowercase, non-alphanumeric runs
 * collapsed to single hyphens, no leading/trailing hyphen. Throws if nothing is
 * left — "!!!" is not a usable pack name.
 */
export function slugifyPackName(input: string): string {
  const slug = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (slug === '') {
    throw new Error(
      `Cannot derive a compendium name from "${input}": it has no letters or digits. ` +
        `Pass an explicit "name" (letters, digits and hyphens).`
    );
  }

  return slug;
}

/**
 * A pack id like "dnd5e.monsters" or "some-module.stuff" belongs to a system or
 * module and cannot be deleted. "world.x" can. A bare string with no dot is a
 * label — leave it for the module to resolve.
 */
function assertNotForeignPackId(identifier: string): void {
  const looksLikePackId = /^[a-z0-9_-]+\.[a-z0-9_.-]+$/i.test(identifier);
  if (looksLikePackId && !identifier.startsWith('world.')) {
    throw new Error(
      `Refusing to delete "${identifier}": only world compendiums can be deleted. ` +
        `System and module packs are locked by Foundry.`
    );
  }
}

export interface CompendiumManagementToolsOptions {
  foundryClient: FoundryClient;
  logger: Logger;
}

export class CompendiumManagementTools {
  private foundryClient: FoundryClient;
  private logger: Logger;

  constructor({ foundryClient, logger }: CompendiumManagementToolsOptions) {
    this.foundryClient = foundryClient;
    this.logger = logger.child({ component: 'CompendiumManagementTools' });
  }

  getToolDefinitions() {
    return [
      {
        name: 'manage-compendiums',
        description:
          'Create, list, and delete compendium packs in Foundry VTT. Managing the ' +
          'documents inside a pack is a different tool: manage-compendium-entries.\n' +
          '- "list": Every pack, with its id, label, document type, and whether it is writable ' +
          '(only unlocked world packs are).\n' +
          '- "create": Make a new world compendium. "label" and "type" are required; "name" ' +
          '(the pack id suffix) defaults to a slug of the label.\n' +
          '- "delete": Permanently delete a world compendium and every document in it. Requires ' +
          '"confirmDelete: true". System and module packs cannot be deleted.',
        inputSchema: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              description: 'Operation to perform.',
              enum: ['list', 'create', 'delete'],
            },
            label: {
              type: 'string',
              description: 'For "create": the pack\'s display name.',
            },
            type: {
              type: 'string',
              description: 'For "create": which document type the pack holds.',
              enum: [...COMPENDIUM_DOCUMENT_TYPES],
            },
            name: {
              type: 'string',
              description:
                'For "create": the pack id suffix (final id is "world.<name>"). Defaults to a ' +
                'slug of the label. Sanitised to lowercase letters, digits and hyphens.',
            },
            identifier: {
              type: 'string',
              description: 'For "delete": the pack id ("world.my-monsters") or its label.',
            },
            confirmDelete: {
              type: 'boolean',
              description:
                'Required confirmation for "delete". Guards against destroying every document ' +
                'in the pack as a side effect.',
            },
          },
          required: ['action'],
        },
      },
    ];
  }

  async handleManageCompendiums(args: any): Promise<any> {
    const { action } = z
      .object({ action: z.enum(['list', 'create', 'delete']) })
      .parse(args);

    switch (action) {
      case 'list':
        return this.handleList();
      case 'create':
        return this.handleCreate(args);
      case 'delete':
        return this.handleDelete(args);
    }
  }

  // ── list ──────────────────────────────────────────────────────────────────

  private async handleList(): Promise<any> {
    this.logger.info('Listing compendium packs');
    return this.foundryClient.query('foundry-mcp-bridge.listPacks', {});
  }

  // ── create ────────────────────────────────────────────────────────────────

  private async handleCreate(args: any): Promise<any> {
    const p = z
      .object({
        label: z.string().min(1),
        type: compendiumTypeSchema,
        name: z.string().min(1).optional(),
      })
      .parse(args);

    const name = slugifyPackName(p.name ?? p.label);

    this.logger.info('Creating compendium pack', { label: p.label, type: p.type, name });

    return this.foundryClient.query('foundry-mcp-bridge.createPack', {
      label: p.label,
      type: p.type,
      name,
    });
  }

  // ── delete ────────────────────────────────────────────────────────────────

  private async handleDelete(args: any): Promise<any> {
    const p = z
      .object({
        identifier: z.string().min(1),
        confirmDelete: z.boolean().default(false),
      })
      .parse(args);

    if (!p.confirmDelete) {
      throw new Error(
        `Refusing to delete compendium "${p.identifier}": set confirmDelete: true. This ` +
          `permanently destroys the pack and every document in it.`
      );
    }

    assertNotForeignPackId(p.identifier);

    this.logger.info('Deleting compendium pack', { identifier: p.identifier });

    return this.foundryClient.query('foundry-mcp-bridge.deletePack', {
      identifier: p.identifier,
    });
  }
}
