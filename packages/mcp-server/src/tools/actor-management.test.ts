/**
 * manage-actors tests.
 *
 * Covers the "place" action (the token placement itself runs browser-side via
 * data-access.addActorsToScene, so this checks the MCP tool layer: the action is
 * advertised, and a valid call forwards to the GM-gated bridge query with defaults
 * applied) and the "update" action's "folder" field, which files an existing actor
 * into a folder — previously only possible at creation time.
 */

import { describe, it, expect, vi } from 'vitest';
import { ActorManagementTools } from './actor-management.js';

function makeTools(queryImpl?: (method: string, data: any) => unknown) {
  const query = vi.fn(queryImpl ?? (async () => ({ success: true, created: [] })));
  const logger: any = {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: () => logger,
  };
  const foundryClient: any = { query };
  const tools = new ActorManagementTools({ foundryClient, logger });
  return { tools, query };
}

describe('manage-actors place action', () => {
  it('advertises "place" in the action enum', () => {
    const { tools } = makeTools();
    const def = tools.getToolDefinitions()[0];
    const actionEnum = def.inputSchema.properties.action.enum;
    expect(actionEnum).toContain('place');
  });

  it('forwards to addActorsToScene with the given ids and options', async () => {
    const { tools, query } = makeTools();
    await tools.handleManageActors({
      action: 'place',
      actorIds: ['abc', 'def'],
      placement: 'grid',
      hidden: true,
    });
    expect(query).toHaveBeenCalledWith('foundry-mcp-bridge.addActorsToScene', {
      actorIds: ['abc', 'def'],
      placement: 'grid',
      hidden: true,
    });
  });

  it('defaults placement to random and hidden to false', async () => {
    const { tools, query } = makeTools();
    await tools.handleManageActors({ action: 'place', actorIds: ['abc'] });
    expect(query).toHaveBeenCalledWith('foundry-mcp-bridge.addActorsToScene', {
      actorIds: ['abc'],
      placement: 'random',
      hidden: false,
    });
  });

  it('rejects a place call with no actorIds', async () => {
    const { tools, query } = makeTools();
    await expect(tools.handleManageActors({ action: 'place', actorIds: [] })).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });
});

describe('ActorManagementTools update — folder', () => {
  it('files an actor into a folder by path', async () => {
    const { tools, query } = makeTools();

    await tools.handleManageActors({
      action: 'update',
      updates: [{ id: 'actor1', folder: 'Iron Gods/Book 1 - Fires of Creation' }],
    });

    const call = query.mock.calls.find(c => c[0] === 'foundry-mcp-bridge.updateActors');
    expect(call?.[1]).toEqual({
      updates: [{ id: 'actor1', folderSegments: ['Iron Gods', 'Book 1 - Fires of Creation'] }],
    });
  });

  it('moves an actor to the root when folder is null', async () => {
    const { tools, query } = makeTools();

    await tools.handleManageActors({
      action: 'update',
      updates: [{ id: 'actor1', folder: null }],
    });

    const call = query.mock.calls.find(c => c[0] === 'foundry-mcp-bridge.updateActors');
    expect(call?.[1]).toEqual({ updates: [{ id: 'actor1', folderSegments: null }] });
  });

  it('leaves updates without a folder field untouched', async () => {
    const { tools, query } = makeTools();

    await tools.handleManageActors({
      action: 'update',
      updates: [{ id: 'actor1', name: 'Gearsman' }],
    });

    const call = query.mock.calls.find(c => c[0] === 'foundry-mcp-bridge.updateActors');
    expect(call?.[1]).toEqual({ updates: [{ id: 'actor1', name: 'Gearsman' }] });
  });

  it('rejects a malformed folder path before touching the world', async () => {
    const { tools, query } = makeTools();

    await expect(
      tools.handleManageActors({
        action: 'update',
        updates: [{ id: 'actor1', folder: 'Iron Gods//Torch' }],
      })
    ).rejects.toThrow(/empty segment/i);

    expect(query).not.toHaveBeenCalledWith('foundry-mcp-bridge.updateActors', expect.anything());
  });
});

describe('ActorManagementTools update — tokenImg', () => {
  it('passes a data-directory tokenImg path through to the bridge', async () => {
    const { tools, query } = makeTools();

    await tools.handleManageActors({
      action: 'update',
      updates: [{ id: 'actor1', tokenImg: 'worlds/iron-gods/mcp-art/gearsman.webp' }],
    });

    const call = query.mock.calls.find(c => c[0] === 'foundry-mcp-bridge.updateActors');
    expect(call?.[1]).toEqual({
      updates: [{ id: 'actor1', tokenImg: 'worlds/iron-gods/mcp-art/gearsman.webp' }],
    });
  });

  it('rejects a remote tokenImg URL before touching the world — art from an unreachable host would not load for players', async () => {
    const { tools, query } = makeTools();

    await expect(
      tools.handleManageActors({
        action: 'update',
        updates: [{ id: 'actor1', tokenImg: 'https://example.com/gearsman.webp' }],
      })
    ).rejects.toThrow(/not a remote URL/i);

    expect(query).not.toHaveBeenCalledWith('foundry-mcp-bridge.updateActors', expect.anything());
  });
});

describe('manage-actors update-items action', () => {
  it('forwards supported Item fields and returns the update result', async () => {
    const updateResult = {
      updated: [{ id: 'item-id', name: 'Updated Item' }],
      total: 1,
    };
    const { tools, query } = makeTools(async () => updateResult);

    const result = await tools.handleManageActors({
      action: 'update-items',
      actorIdentifier: 'actor-id',
      itemUpdates: [
        {
          id: 'item-id',
          name: 'Updated Item',
          img: 'icons/updated.webp',
          system: { quantity: 2 },
        },
      ],
    });

    expect(query).toHaveBeenCalledWith('foundry-mcp-bridge.updateActorItems', {
      actorIdentifier: 'actor-id',
      itemUpdates: [
        {
          id: 'item-id',
          name: 'Updated Item',
          img: 'icons/updated.webp',
          system: { quantity: 2 },
        },
      ],
    });
    expect(result).toEqual(updateResult);
  });

  it('rejects Item ActiveEffects instead of reporting success', async () => {
    const { tools, query } = makeTools();

    await expect(
      tools.handleManageActors({
        action: 'update-items',
        actorIdentifier: 'actor-id',
        itemUpdates: [
          {
            id: 'item-id',
            effects: [{ _id: 'effect-id', disabled: true }],
          },
        ],
      })
    ).rejects.toThrow(
      'Item ActiveEffects are not supported by update-items and require dedicated effect management.'
    );
    expect(query).not.toHaveBeenCalled();
  });
});
