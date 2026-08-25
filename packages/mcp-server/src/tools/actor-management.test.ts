/**
 * manage-actors tests — focused on filing an existing actor into a folder, which
 * previously was only possible at creation time.
 */

import { describe, it, expect, vi } from 'vitest';
import { ActorManagementTools } from './actor-management.js';

function makeTools(queryImpl?: (method: string, data: any) => unknown) {
  const query = vi.fn(queryImpl ?? (async () => ({ success: true })));
  const logger: any = { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => logger };
  const foundryClient: any = { query };
  const tools = new ActorManagementTools({ foundryClient, logger });
  return { tools, query };
}

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
