import { z } from 'zod';
import { FoundryClient } from '../foundry-client.js';
import { Logger } from '../logger.js';

export interface ActorPlacementToolsOptions {
  foundryClient: FoundryClient;
  logger: Logger;
}

/** Drops existing world actors on the current scene as tokens. */
export class ActorPlacementTools {
  private foundryClient: FoundryClient;
  private logger: Logger;

  constructor({ foundryClient, logger }: ActorPlacementToolsOptions) {
    this.foundryClient = foundryClient;
    this.logger = logger.child({ component: 'ActorPlacementTools' });
  }

  getToolDefinitions() {
    return [
      {
        name: 'place-actors',
        description:
          'Drop existing world actors on the current scene as tokens. To create actors first, ' +
          'use documents create, with from to copy a compendium entry.',
        inputSchema: {
          type: 'object',
          properties: {
            actorIds: {
              type: 'array',
              items: { type: 'string' },
              minItems: 1,
              description: 'Ids of existing world actors to place.',
            },
            placement: {
              type: 'string',
              enum: ['random', 'grid', 'center'],
              description: 'Token layout. Defaults to "random".',
            },
            hidden: {
              type: 'boolean',
              description: 'Create the tokens hidden from players. Defaults to false.',
            },
          },
          required: ['actorIds'],
        },
      },
    ];
  }

  async handlePlaceActors(args: unknown): Promise<any> {
    const { actorIds, placement, hidden } = z
      .object({
        actorIds: z.array(z.string().min(1)).min(1),
        placement: z.enum(['random', 'grid', 'center']).default('random'),
        hidden: z.boolean().default(false),
      })
      .parse(args);

    this.logger.info('Placing existing actors on scene', {
      count: actorIds.length,
      placement,
      hidden,
    });
    return this.foundryClient.query('foundry-mcp-bridge.addActorsToScene', {
      actorIds,
      placement,
      hidden,
    });
  }
}
