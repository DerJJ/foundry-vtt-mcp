/**
 * manage-folders tool tests — schema advertising, path handling, and the guard
 * rails that stop a folder delete from quietly taking actors with it.
 */

import { describe, it, expect, vi } from 'vitest';
import { FolderManagementTools } from './folder-management.js';

function makeTools(queryImpl?: (method: string, data: any) => unknown) {
  const query = vi.fn(queryImpl ?? (async () => ({ success: true })));
  const logger: any = { info: vi.fn(), debug: vi.fn(), error: vi.fn(), child: () => logger };
  const foundryClient: any = { query };
  const tools = new FolderManagementTools({ foundryClient, logger });
  return { tools, query };
}

describe('FolderManagementTools.getToolDefinitions', () => {
  it('advertises manage-folders with every approved action', () => {
    const [def] = makeTools().tools.getToolDefinitions();
    expect(def.name).toBe('manage-folders');
    expect(def.inputSchema.properties.action.enum).toEqual([
      'list',
      'create',
      'rename',
      'move',
      'delete',
    ]);
  });
});

describe('FolderManagementTools create', () => {
  it('sends a nested path to the bridge as resolved segments', async () => {
    const { tools, query } = makeTools();

    await tools.handleManageFolders({
      action: 'create',
      path: 'Iron Gods/Book 1 - Fires of Creation/Torch',
    });

    expect(query).toHaveBeenCalledWith('foundry-mcp-bridge.createFolder', {
      segments: ['Iron Gods', 'Book 1 - Fires of Creation', 'Torch'],
      documentType: 'Actor',
    });
  });

  it('defaults to Actor folders but honours an explicit documentType', async () => {
    const { tools, query } = makeTools();

    await tools.handleManageFolders({ action: 'create', path: 'Tech', documentType: 'Item' });

    expect(query).toHaveBeenCalledWith('foundry-mcp-bridge.createFolder', {
      segments: ['Tech'],
      documentType: 'Item',
    });
  });

  it('rejects a malformed path before touching the world', async () => {
    const { tools, query } = makeTools();

    await expect(
      tools.handleManageFolders({ action: 'create', path: 'Iron Gods//Torch' })
    ).rejects.toThrow(/empty segment/i);

    expect(query).not.toHaveBeenCalled();
  });
});

describe('FolderManagementTools delete', () => {
  it('deletes only the folder by default, orphaning its contents', async () => {
    const { tools, query } = makeTools();

    await tools.handleManageFolders({ action: 'delete', path: 'Iron Gods/Torch' });

    expect(query).toHaveBeenCalledWith('foundry-mcp-bridge.deleteFolder', {
      segments: ['Iron Gods', 'Torch'],
      documentType: 'Actor',
      deleteContents: false,
    });
  });

  it('refuses to destroy folder contents without explicit confirmation', async () => {
    const { tools, query } = makeTools();

    await expect(
      tools.handleManageFolders({
        action: 'delete',
        path: 'Iron Gods/Torch',
        deleteContents: true,
      })
    ).rejects.toThrow(/confirmDelete/);

    expect(query).not.toHaveBeenCalled();
  });

  it('destroys contents when both deleteContents and confirmDelete are set', async () => {
    const { tools, query } = makeTools();

    await tools.handleManageFolders({
      action: 'delete',
      path: 'Iron Gods/Torch',
      deleteContents: true,
      confirmDelete: true,
    });

    expect(query).toHaveBeenCalledWith('foundry-mcp-bridge.deleteFolder', {
      segments: ['Iron Gods', 'Torch'],
      documentType: 'Actor',
      deleteContents: true,
    });
  });
});

describe('FolderManagementTools pack scoping', () => {
  it('scopes create to a compendium pack and drops documentType', async () => {
    const { tools, query } = makeTools();

    await tools.handleManageFolders({
      action: 'create',
      path: 'Robots/Gearsmen',
      pack: 'world.my-monsters',
    });

    expect(query).toHaveBeenCalledWith('foundry-mcp-bridge.createFolder', {
      segments: ['Robots', 'Gearsmen'],
      pack: 'world.my-monsters',
    });
  });

  it('scopes list to a pack', async () => {
    const { tools, query } = makeTools();

    await tools.handleManageFolders({ action: 'list', pack: 'world.my-monsters' });

    expect(query).toHaveBeenCalledWith('foundry-mcp-bridge.listFolders', {
      pack: 'world.my-monsters',
    });
  });

  it('scopes rename, move and delete to a pack', async () => {
    const { tools, query } = makeTools();

    await tools.handleManageFolders({
      action: 'rename',
      path: 'Robots',
      newName: 'Constructs',
      pack: 'world.my-monsters',
    });
    await tools.handleManageFolders({
      action: 'move',
      path: 'Constructs',
      newParentPath: 'Enemies',
      pack: 'world.my-monsters',
    });
    await tools.handleManageFolders({
      action: 'delete',
      path: 'Enemies/Constructs',
      pack: 'world.my-monsters',
    });

    expect(query).toHaveBeenNthCalledWith(1, 'foundry-mcp-bridge.renameFolder', {
      segments: ['Robots'],
      newName: 'Constructs',
      pack: 'world.my-monsters',
    });
    expect(query).toHaveBeenNthCalledWith(2, 'foundry-mcp-bridge.moveFolder', {
      segments: ['Constructs'],
      newParentSegments: ['Enemies'],
      pack: 'world.my-monsters',
    });
    expect(query).toHaveBeenNthCalledWith(3, 'foundry-mcp-bridge.deleteFolder', {
      segments: ['Enemies', 'Constructs'],
      pack: 'world.my-monsters',
      deleteContents: false,
    });
  });
});

describe('FolderManagementTools list, rename and move', () => {
  it('lists folders for a document type', async () => {
    const { tools, query } = makeTools();

    await tools.handleManageFolders({ action: 'list', documentType: 'Scene' });

    expect(query).toHaveBeenCalledWith('foundry-mcp-bridge.listFolders', {
      documentType: 'Scene',
    });
  });

  it('renames a folder in place without moving it', async () => {
    const { tools, query } = makeTools();

    await tools.handleManageFolders({
      action: 'rename',
      path: 'Iron Gods/Torch',
      newName: 'Torch - Book 1',
    });

    expect(query).toHaveBeenCalledWith('foundry-mcp-bridge.renameFolder', {
      segments: ['Iron Gods', 'Torch'],
      documentType: 'Actor',
      newName: 'Torch - Book 1',
    });
  });

  it('moves a folder under a new parent', async () => {
    const { tools, query } = makeTools();

    await tools.handleManageFolders({
      action: 'move',
      path: 'Torch',
      newParentPath: 'Iron Gods/Book 1',
    });

    expect(query).toHaveBeenCalledWith('foundry-mcp-bridge.moveFolder', {
      segments: ['Torch'],
      documentType: 'Actor',
      newParentSegments: ['Iron Gods', 'Book 1'],
    });
  });

  it('moves a folder to the root when newParentPath is null', async () => {
    const { tools, query } = makeTools();

    await tools.handleManageFolders({ action: 'move', path: 'Torch', newParentPath: null });

    expect(query).toHaveBeenCalledWith('foundry-mcp-bridge.moveFolder', {
      segments: ['Torch'],
      documentType: 'Actor',
      newParentSegments: null,
    });
  });
});
