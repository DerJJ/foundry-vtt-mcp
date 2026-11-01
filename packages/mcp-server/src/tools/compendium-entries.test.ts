/**
 * manage-compendium-entries tool tests — schema advertising, the pack-scoping
 * that every action requires, folder-path parsing on the way in, the copy
 * action's UUID pass-through, and the confirmDelete guard on delete.
 */

import { describe, it, expect, vi } from 'vitest';
import { CompendiumEntryTools } from './compendium-entries.js';

function makeTools(queryImpl?: (method: string, data: any) => unknown) {
  const query = vi.fn(queryImpl ?? (async () => ({ success: true })));
  const logger: any = { info: vi.fn(), debug: vi.fn(), error: vi.fn(), child: () => logger };
  const foundryClient: any = { query };
  const tools = new CompendiumEntryTools({ foundryClient, logger });
  return { tools, query };
}

describe('CompendiumEntryTools.getToolDefinitions', () => {
  it('advertises manage-compendium-entries with every approved action', () => {
    const [def] = makeTools().tools.getToolDefinitions();
    expect(def.name).toBe('manage-compendium-entries');
    expect(def.inputSchema.properties.action.enum).toEqual([
      'list',
      'create',
      'update',
      'delete',
      'copy',
    ]);
    expect(def.inputSchema.required).toEqual(['action']);
  });
});

describe('CompendiumEntryTools pack scoping', () => {
  it('refuses any action without a pack and never calls the bridge', async () => {
    const { tools, query } = makeTools();

    await expect(
      tools.handleManageCompendiumEntries({ action: 'create', entries: [{ name: 'X' }] })
    ).rejects.toThrow(/pack/i);

    expect(query).not.toHaveBeenCalled();
  });
});

describe('CompendiumEntryTools list', () => {
  it('scopes the listing to the pack and forwards name/type filters', async () => {
    const { tools, query } = makeTools();

    await tools.handleManageCompendiumEntries({
      action: 'list',
      pack: 'world.my-monsters',
      nameFilter: 'gear',
      type: 'npc',
    });

    expect(query).toHaveBeenCalledWith('foundry-mcp-bridge.listPackEntries', {
      pack: 'world.my-monsters',
      nameFilter: 'gear',
      type: 'npc',
    });
  });

  it('sends just the pack when no filters are given', async () => {
    const { tools, query } = makeTools();

    await tools.handleManageCompendiumEntries({ action: 'list', pack: 'world.my-monsters' });

    expect(query).toHaveBeenCalledWith('foundry-mcp-bridge.listPackEntries', {
      pack: 'world.my-monsters',
    });
  });
});

describe('CompendiumEntryTools create', () => {
  it('passes entries through and parses each folder path to segments', async () => {
    const { tools, query } = makeTools();

    await tools.handleManageCompendiumEntries({
      action: 'create',
      pack: 'world.my-monsters',
      entries: [
        {
          name: 'Gearsman',
          type: 'npc',
          img: 'icons/bot.svg',
          system: { cr: 2 },
          folder: 'Robots/Gearsmen',
        },
        { name: 'Loose Bolt' },
      ],
    });

    expect(query).toHaveBeenCalledWith('foundry-mcp-bridge.createPackEntries', {
      pack: 'world.my-monsters',
      entries: [
        {
          name: 'Gearsman',
          type: 'npc',
          img: 'icons/bot.svg',
          system: { cr: 2 },
          folderSegments: ['Robots', 'Gearsmen'],
        },
        { name: 'Loose Bolt' },
      ],
    });
  });

  it('rejects the whole batch if any entry has a malformed folder path', async () => {
    const { tools, query } = makeTools();

    await expect(
      tools.handleManageCompendiumEntries({
        action: 'create',
        pack: 'world.my-monsters',
        entries: [{ name: 'Gearsman', folder: 'Robots//Gearsmen' }],
      })
    ).rejects.toThrow(/empty segment/i);

    expect(query).not.toHaveBeenCalled();
  });

  it('rejects an empty entries array', async () => {
    const { tools, query } = makeTools();

    await expect(
      tools.handleManageCompendiumEntries({
        action: 'create',
        pack: 'world.my-monsters',
        entries: [],
      })
    ).rejects.toThrow();

    expect(query).not.toHaveBeenCalled();
  });
});

describe('CompendiumEntryTools update', () => {
  it('forwards patches keyed by identifier, parsing folder moves to segments', async () => {
    const { tools, query } = makeTools();

    await tools.handleManageCompendiumEntries({
      action: 'update',
      pack: 'world.my-monsters',
      updates: [
        { identifier: 'Gearsman', name: 'Gearsman Mk II', system: { cr: 3 } },
        { identifier: 'abc123', folder: 'Retired' },
      ],
    });

    expect(query).toHaveBeenCalledWith('foundry-mcp-bridge.updatePackEntries', {
      pack: 'world.my-monsters',
      updates: [
        { identifier: 'Gearsman', name: 'Gearsman Mk II', system: { cr: 3 } },
        { identifier: 'abc123', folderSegments: ['Retired'] },
      ],
    });
  });

  it('requires an identifier on every patch', async () => {
    const { tools, query } = makeTools();

    await expect(
      tools.handleManageCompendiumEntries({
        action: 'update',
        pack: 'world.my-monsters',
        updates: [{ name: 'no id' }],
      })
    ).rejects.toThrow();

    expect(query).not.toHaveBeenCalled();
  });
});

describe('CompendiumEntryTools delete', () => {
  it('refuses to delete entries without confirmDelete', async () => {
    const { tools, query } = makeTools();

    await expect(
      tools.handleManageCompendiumEntries({
        action: 'delete',
        pack: 'world.my-monsters',
        identifiers: ['Gearsman'],
      })
    ).rejects.toThrow(/confirmDelete/);

    expect(query).not.toHaveBeenCalled();
  });

  it('deletes the named entries when confirmDelete is set', async () => {
    const { tools, query } = makeTools();

    await tools.handleManageCompendiumEntries({
      action: 'delete',
      pack: 'world.my-monsters',
      identifiers: ['Gearsman', 'Loose Bolt'],
      confirmDelete: true,
    });

    expect(query).toHaveBeenCalledWith('foundry-mcp-bridge.deletePackEntries', {
      pack: 'world.my-monsters',
      identifiers: ['Gearsman', 'Loose Bolt'],
    });
  });
});

describe('CompendiumEntryTools copy', () => {
  it('forwards the source UUID and optional folder/newName', async () => {
    const { tools, query } = makeTools();

    await tools.handleManageCompendiumEntries({
      action: 'copy',
      pack: 'world.my-monsters',
      source: 'Compendium.dnd5e.monsters.Actor.abcd1234',
      folder: 'Imported/SRD',
      newName: 'Custom Bot',
    });

    expect(query).toHaveBeenCalledWith('foundry-mcp-bridge.copyPackEntry', {
      pack: 'world.my-monsters',
      source: 'Compendium.dnd5e.monsters.Actor.abcd1234',
      folderSegments: ['Imported', 'SRD'],
      newName: 'Custom Bot',
    });
  });

  it('sends just pack and source when nothing else is given', async () => {
    const { tools, query } = makeTools();

    await tools.handleManageCompendiumEntries({
      action: 'copy',
      pack: 'world.my-monsters',
      source: 'Actor.localworldactor01',
    });

    expect(query).toHaveBeenCalledWith('foundry-mcp-bridge.copyPackEntry', {
      pack: 'world.my-monsters',
      source: 'Actor.localworldactor01',
    });
  });

  it('requires a source', async () => {
    const { tools, query } = makeTools();

    await expect(
      tools.handleManageCompendiumEntries({ action: 'copy', pack: 'world.my-monsters' })
    ).rejects.toThrow();

    expect(query).not.toHaveBeenCalled();
  });
});
