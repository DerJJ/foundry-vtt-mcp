/**
 * Scene Management Tools
 *
 * CRUD for Foundry Scene documents: create, update, delete, activate.
 * Read-only scene inspection stays in scene.ts (get-current-scene) and
 * map-generation.ts (list-scenes, switch-scene); this tool adds the missing writes.
 *
 * The module side owns the Foundry-version quirks — on v14 the background image
 * lives on an embedded Level document, not a top-level Scene field.
 */

import { z } from 'zod';
import { FoundryClient } from '../foundry-client.js';
import { Logger } from '../logger.js';

// ─────────────────────────────────────────────────────────────────────────────

/** gridType enum → CONST.GRID_TYPES integer. */
const GRID_TYPES = {
  gridless: 0,
  square: 1,
  hexOddR: 2,
  hexEvenR: 3,
  hexOddQ: 4,
  hexEvenQ: 5,
} as const;

const gridTypeSchema = z.enum(['gridless', 'square', 'hexOddR', 'hexEvenR', 'hexOddQ', 'hexEvenQ']);

/** wall door kind → CONST.WALL_DOOR_TYPES integer. */
const DOOR_TYPES = { none: 0, door: 1, secret: 2 } as const;

/** Foundry's "normal" blocking value for both movement and sense restriction. */
const WALL_BLOCK = 20;

const wallSchema = z.object({
  x1: z.number(),
  y1: z.number(),
  x2: z.number(),
  y2: z.number(),
  door: z.enum(['none', 'door', 'secret']).default('none'),
  blocksMovement: z.boolean().default(true),
  blocksSight: z.boolean().default(true),
});

const GRID_SIZE_MIN = 50;

function rejectRemoteUrl(src: string | undefined): void {
  if (src !== undefined && /^https?:\/\//i.test(src)) {
    throw new Error(
      `background must be a path inside Foundry's data directory, not a remote URL (got "${src}"). ` +
        `Remote artwork fails to load for players if the host is unreachable.`
    );
  }
}

export interface SceneManagementToolsOptions {
  foundryClient: FoundryClient;
  logger: Logger;
}

export class SceneManagementTools {
  private foundryClient: FoundryClient;
  private logger: Logger;

  constructor({ foundryClient, logger }: SceneManagementToolsOptions) {
    this.foundryClient = foundryClient;
    this.logger = logger.child({ component: 'SceneManagementTools' });
  }

  getToolDefinitions() {
    return [
      {
        name: 'manage-scenes',
        description:
          'Create, update, delete, and activate Scene documents in Foundry VTT. ' +
          'Read-only inspection is elsewhere: get-current-scene, list-scenes.\n' +
          '- "create": Make a new scene. Only "name" is required; grid defaults to a 100px ' +
          'square grid at 5 ft. Pass "walls" to build walls in the same call, and "activate: true" ' +
          'to switch to it immediately.\n' +
          '- "update": Change an existing scene by name or ID ("identifier"). Only the fields you ' +
          'pass change.\n' +
          '- "delete": Permanently delete a scene. Requires "confirmDelete: true" — this also ' +
          "destroys the scene's tokens, walls, lighting and fog history.\n" +
          '- "activate": Make a scene the active one (what players see).\n' +
          "Background images must be paths inside Foundry's data directory " +
          '(e.g. "worlds/iron-gods/maps/foo.webp"); remote http(s) URLs are rejected.',
        inputSchema: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              description: 'Operation to perform.',
              enum: ['create', 'update', 'delete', 'activate'],
            },
            name: {
              type: 'string',
              description: 'Scene name. Required for "create".',
            },
            identifier: {
              type: 'string',
              description: 'Scene name or ID. Required for "update", "delete", "activate".',
            },
            width: {
              type: 'number',
              description:
                "Scene width in pixels (create/update). Omit on create for Foundry's default.",
            },
            height: {
              type: 'number',
              description: 'Scene height in pixels (create/update).',
            },
            background: {
              type: 'string',
              description:
                "Background image, as a path inside Foundry's data directory " +
                '(e.g. "worlds/iron-gods/maps/foo.webp"). Remote http(s) URLs are rejected.',
            },
            padding: {
              type: 'number',
              description:
                'Fractional padding around the scene (0–0.5). Defaults to 0.25 on create.',
            },
            gridType: {
              type: 'string',
              description: 'Grid style. Defaults to "square" on create.',
              enum: ['gridless', 'square', 'hexOddR', 'hexEvenR', 'hexOddQ', 'hexEvenQ'],
            },
            gridSize: {
              type: 'number',
              description: `Grid square size in pixels (min ${GRID_SIZE_MIN}). Defaults to 100 on create.`,
            },
            gridDistance: {
              type: 'number',
              description:
                'Real-world distance one grid square represents. Defaults to 5 on create.',
            },
            gridUnits: {
              type: 'string',
              description: 'Units for gridDistance (e.g. "ft", "m"). Defaults to "ft" on create.',
            },
            navigation: {
              type: 'boolean',
              description:
                'Whether the scene shows in the navigation bar. Defaults to true on create.',
            },
            walls: {
              type: 'array',
              description:
                'Walls to build (create only). Each: { x1, y1, x2, y2 } endpoints in pixels, ' +
                'optional "door" ("none" | "door" | "secret"), and optional "blocksMovement" / ' +
                '"blocksSight" booleans (both default true).',
              items: {
                type: 'object',
                properties: {
                  x1: { type: 'number' },
                  y1: { type: 'number' },
                  x2: { type: 'number' },
                  y2: { type: 'number' },
                  door: { type: 'string', enum: ['none', 'door', 'secret'] },
                  blocksMovement: { type: 'boolean' },
                  blocksSight: { type: 'boolean' },
                },
                required: ['x1', 'y1', 'x2', 'y2'],
              },
            },
            activate: {
              type: 'boolean',
              description: 'For "create": switch to the new scene immediately. Defaults to false.',
            },
            confirmDelete: {
              type: 'boolean',
              description:
                'Required confirmation for "delete". Guards against destroying a scene\'s tokens, ' +
                'walls and lighting as a side effect.',
            },
            optimizeView: {
              type: 'boolean',
              description:
                'For "activate": pan/zoom the canvas to frame the scene. Defaults to true.',
            },
          },
          required: ['action'],
        },
      },
    ];
  }

  async handleManageScenes(args: any): Promise<any> {
    const { action } = z
      .object({ action: z.enum(['create', 'update', 'delete', 'activate']) })
      .parse(args);

    switch (action) {
      case 'create':
        return this.handleCreate(args);
      case 'update':
        return this.handleUpdate(args);
      case 'delete':
        return this.handleDelete(args);
      case 'activate':
        return this.handleActivate(args);
    }
  }

  // ── create ────────────────────────────────────────────────────────────────

  private async handleCreate(args: any): Promise<any> {
    const p = z
      .object({
        name: z.string().min(1),
        width: z.number().positive().optional(),
        height: z.number().positive().optional(),
        background: z.string().optional(),
        padding: z.number().min(0).max(0.5).default(0.25),
        gridType: gridTypeSchema.default('square'),
        gridSize: z.number().min(GRID_SIZE_MIN).default(100),
        gridDistance: z.number().positive().default(5),
        gridUnits: z.string().default('ft'),
        navigation: z.boolean().default(true),
        walls: z.array(wallSchema).default([]),
        activate: z.boolean().default(false),
      })
      .parse(args);

    rejectRemoteUrl(p.background);

    const payload: Record<string, any> = {
      name: p.name,
      padding: p.padding,
      navigation: p.navigation,
      activate: p.activate,
      grid: {
        type: GRID_TYPES[p.gridType],
        size: p.gridSize,
        distance: p.gridDistance,
        units: p.gridUnits,
      },
      walls: p.walls.map(w => ({
        c: [w.x1, w.y1, w.x2, w.y2],
        door: DOOR_TYPES[w.door],
        move: w.blocksMovement ? WALL_BLOCK : 0,
        sense: w.blocksSight ? WALL_BLOCK : 0,
      })),
    };
    if (p.width !== undefined) payload.width = p.width;
    if (p.height !== undefined) payload.height = p.height;
    if (p.background !== undefined) payload.background = p.background;

    this.logger.info('Creating scene', { name: p.name, walls: p.walls.length });

    return this.foundryClient.query('foundry-mcp-bridge.createScene', payload);
  }

  // ── update ────────────────────────────────────────────────────────────────

  private async handleUpdate(args: any): Promise<any> {
    const p = z
      .object({
        identifier: z.string().min(1),
        name: z.string().min(1).optional(),
        width: z.number().positive().optional(),
        height: z.number().positive().optional(),
        background: z.string().optional(),
        padding: z.number().min(0).max(0.5).optional(),
        gridType: gridTypeSchema.optional(),
        gridSize: z.number().min(GRID_SIZE_MIN).optional(),
        gridDistance: z.number().positive().optional(),
        gridUnits: z.string().optional(),
        navigation: z.boolean().optional(),
      })
      .parse(args);

    rejectRemoteUrl(p.background);

    const changes: Record<string, any> = {};
    if (p.name !== undefined) changes.name = p.name;
    if (p.width !== undefined) changes.width = p.width;
    if (p.height !== undefined) changes.height = p.height;
    if (p.background !== undefined) changes.background = p.background;
    if (p.padding !== undefined) changes.padding = p.padding;
    if (p.navigation !== undefined) changes.navigation = p.navigation;

    const grid: Record<string, any> = {};
    if (p.gridType !== undefined) grid.type = GRID_TYPES[p.gridType];
    if (p.gridSize !== undefined) grid.size = p.gridSize;
    if (p.gridDistance !== undefined) grid.distance = p.gridDistance;
    if (p.gridUnits !== undefined) grid.units = p.gridUnits;
    if (Object.keys(grid).length > 0) changes.grid = grid;

    if (Object.keys(changes).length === 0) {
      throw new Error('update requires at least one scene field to change.');
    }

    this.logger.info('Updating scene', { identifier: p.identifier, fields: Object.keys(changes) });

    return this.foundryClient.query('foundry-mcp-bridge.updateScene', {
      identifier: p.identifier,
      changes,
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
        `Refusing to delete scene "${p.identifier}": set confirmDelete: true. Deleting a scene ` +
          `permanently destroys its tokens, walls, lighting and fog-of-war history.`
      );
    }

    this.logger.info('Deleting scene', { identifier: p.identifier });

    return this.foundryClient.query('foundry-mcp-bridge.deleteScene', { identifier: p.identifier });
  }

  // ── activate ──────────────────────────────────────────────────────────────

  private async handleActivate(args: any): Promise<any> {
    const p = z
      .object({
        identifier: z.string().min(1),
        optimizeView: z.boolean().default(true),
      })
      .parse(args);

    this.logger.info('Activating scene', { identifier: p.identifier });

    // Param names match the existing switch-scene bridge query so the module handler
    // can delegate straight to its switchScene implementation.
    return this.foundryClient.query('foundry-mcp-bridge.activateScene', {
      scene_identifier: p.identifier,
      optimize_view: p.optimizeView,
    });
  }
}
