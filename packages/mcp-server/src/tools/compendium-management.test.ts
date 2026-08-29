/**
 * manage-compendiums tool tests — schema advertising, label→slug derivation,
 * the world-pack-only guard on delete, and the confirmDelete guard that stops a
 * pack delete from quietly destroying every entry inside it.
 */

import { describe, it, expect, vi } from 'vitest';
import { CompendiumManagementTools } from './compendium-management.js';

function makeTools(queryImpl?: (method: string, data: any) => unknown) {
  const query = vi.fn(queryImpl ?? (async () => ({ success: true })));
  const logger: any = { info: vi.fn(), debug: vi.fn(), error: vi.fn(), child: () => logger };
  const foundryClient: any = { query };
  const tools = new CompendiumManagementTools({ foundryClient, logger });
  return { tools, query };
}

describe('CompendiumManagementTools.getToolDefinitions', () => {
  it('advertises manage-compendiums with every approved action', () => {
    const [def] = makeTools().tools.getToolDefinitions();
    expect(def.name).toBe('manage-compendiums');
    expect(def.inputSchema.properties.action.enum).toEqual(['list', 'create', 'delete']);
    expect(def.inputSchema.required).toEqual(['action']);
  });
});

describe('CompendiumManagementTools list', () => {
  it('asks the bridge for every pack', async () => {
    const { tools, query } = makeTools();

    await tools.handleManageCompendiums({ action: 'list' });

    expect(query).toHaveBeenCalledWith('foundry-mcp-bridge.listPacks', {});
  });
});

describe('CompendiumManagementTools create', () => {
  it('derives a slug name from the label when none is given', async () => {
    const { tools, query } = makeTools();

    await tools.handleManageCompendiums({
      action: 'create',
      label: 'Iron Gods Monsters!',
      type: 'Actor',
    });

    expect(query).toHaveBeenCalledWith('foundry-mcp-bridge.createPack', {
      label: 'Iron Gods Monsters!',
      type: 'Actor',
      name: 'iron-gods-monsters',
    });
  });

  it('sanitises an explicit name rather than trusting it verbatim', async () => {
    const { tools, query } = makeTools();

    await tools.handleManageCompendiums({
      action: 'create',
      label: 'Loot',
      type: 'Item',
      name: 'My Custom Loot',
    });

    expect(query.mock.calls[0][1].name).toBe('my-custom-loot');
  });

  it('rejects a document type Foundry cannot make a compendium for', async () => {
    const { tools, query } = makeTools();

    await expect(
      tools.handleManageCompendiums({ action: 'create', label: 'X', type: 'Combat' })
    ).rejects.toThrow();

    expect(query).not.toHaveBeenCalled();
  });

  it('rejects a label that yields an empty slug', async () => {
    const { tools, query } = makeTools();

    await expect(
      tools.handleManageCompendiums({ action: 'create', label: '!!!', type: 'Item' })
    ).rejects.toThrow(/name/i);

    expect(query).not.toHaveBeenCalled();
  });
});

describe('CompendiumManagementTools delete', () => {
  it('refuses to delete a pack without confirmDelete and never calls the bridge', async () => {
    const { tools, query } = makeTools();

    await expect(
      tools.handleManageCompendiums({ action: 'delete', identifier: 'world.my-monsters' })
    ).rejects.toThrow(/confirmDelete/);

    expect(query).not.toHaveBeenCalled();
  });

  it('refuses to delete a pack that clearly belongs to a system or module', async () => {
    const { tools, query } = makeTools();

    await expect(
      tools.handleManageCompendiums({
        action: 'delete',
        identifier: 'dnd5e.monsters',
        confirmDelete: true,
      })
    ).rejects.toThrow(/world/i);

    expect(query).not.toHaveBeenCalled();
  });

  it('deletes a world pack when confirmDelete is set', async () => {
    const { tools, query } = makeTools();

    await tools.handleManageCompendiums({
      action: 'delete',
      identifier: 'world.my-monsters',
      confirmDelete: true,
    });

    expect(query).toHaveBeenCalledWith('foundry-mcp-bridge.deletePack', {
      identifier: 'world.my-monsters',
    });
  });

  it('passes a bare label through for the module to resolve', async () => {
    const { tools, query } = makeTools();

    await tools.handleManageCompendiums({
      action: 'delete',
      identifier: 'My Monsters',
      confirmDelete: true,
    });

    expect(query).toHaveBeenCalledWith('foundry-mcp-bridge.deletePack', {
      identifier: 'My Monsters',
    });
  });
});
