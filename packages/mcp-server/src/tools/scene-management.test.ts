/**
 * manage-scenes tool tests — schema advertising, param→payload mapping, the
 * remote-URL guard on background images, and the confirmDelete guard that stops
 * a scene delete from quietly destroying its tokens/walls/lighting.
 */

import { describe, it, expect, vi } from 'vitest';
import { SceneManagementTools } from './scene-management.js';

function makeTools(queryImpl?: (method: string, data: any) => unknown) {
  const query = vi.fn(queryImpl ?? (async () => ({ success: true })));
  const logger: any = { info: vi.fn(), debug: vi.fn(), error: vi.fn(), child: () => logger };
  const foundryClient: any = { query };
  const tools = new SceneManagementTools({ foundryClient, logger });
  return { tools, query };
}

describe('SceneManagementTools.getToolDefinitions', () => {
  it('advertises manage-scenes with every approved action', () => {
    const [def] = makeTools().tools.getToolDefinitions();
    expect(def.name).toBe('manage-scenes');
    expect(def.inputSchema.properties.action.enum).toEqual([
      'create',
      'update',
      'delete',
      'activate',
    ]);
    expect(def.inputSchema.required).toEqual(['action']);
  });
});

describe('SceneManagementTools create', () => {
  it('maps a minimal create to the bridge with defaulted grid/padding/navigation', async () => {
    const { tools, query } = makeTools();

    await tools.handleManageScenes({ action: 'create', name: 'Torch Docks' });

    expect(query).toHaveBeenCalledWith('foundry-mcp-bridge.createScene', {
      name: 'Torch Docks',
      padding: 0.25,
      navigation: true,
      activate: false,
      grid: { type: 1, size: 100, distance: 5, units: 'ft' },
      walls: [],
    });
  });

  it('translates the gridType enum to a Foundry CONST.GRID_TYPES integer', async () => {
    const { tools, query } = makeTools();

    await tools.handleManageScenes({
      action: 'create',
      name: 'Hex Wilds',
      gridType: 'hexOddQ',
      gridSize: 120,
      gridDistance: 10,
      gridUnits: 'mi',
    });

    const payload = query.mock.calls[0][1];
    expect(payload.grid).toEqual({ type: 4, size: 120, distance: 10, units: 'mi' });
  });

  it('passes width/height/background through and forwards the background path verbatim', async () => {
    const { tools, query } = makeTools();

    await tools.handleManageScenes({
      action: 'create',
      name: 'Silver Mount',
      width: 4000,
      height: 3000,
      background: 'worlds/iron-gods/maps/silver-mount.webp',
    });

    const payload = query.mock.calls[0][1];
    expect(payload.width).toBe(4000);
    expect(payload.height).toBe(3000);
    expect(payload.background).toBe('worlds/iron-gods/maps/silver-mount.webp');
  });

  it('rejects a remote background URL before touching the world', async () => {
    const { tools, query } = makeTools();

    await expect(
      tools.handleManageScenes({
        action: 'create',
        name: 'Bad Scene',
        background: 'https://example.com/map.png',
      })
    ).rejects.toThrow(/remote URL/i);

    expect(query).not.toHaveBeenCalled();
  });

  it('maps a walls array to resolved Foundry Wall document fields', async () => {
    const { tools, query } = makeTools();

    await tools.handleManageScenes({
      action: 'create',
      name: 'Walled Room',
      walls: [
        { x1: 0, y1: 0, x2: 100, y2: 0 },
        { x1: 100, y1: 0, x2: 100, y2: 100, door: 'secret', blocksSight: false },
      ],
    });

    const payload = query.mock.calls[0][1];
    expect(payload.walls).toEqual([
      { c: [0, 0, 100, 0], door: 0, move: 20, sense: 20 },
      { c: [100, 0, 100, 100], door: 2, move: 20, sense: 0 },
    ]);
  });

  it('activates on create only when asked', async () => {
    const { tools, query } = makeTools();

    await tools.handleManageScenes({ action: 'create', name: 'Live Scene', activate: true });

    expect(query.mock.calls[0][1].activate).toBe(true);
  });

  it('rejects an unknown gridType via schema validation', async () => {
    const { tools, query } = makeTools();

    await expect(
      tools.handleManageScenes({ action: 'create', name: 'X', gridType: 'triangular' })
    ).rejects.toThrow();

    expect(query).not.toHaveBeenCalled();
  });
});

describe('SceneManagementTools update', () => {
  it('sends only the fields the caller provided', async () => {
    const { tools, query } = makeTools();

    await tools.handleManageScenes({
      action: 'update',
      identifier: 'Torch Docks',
      name: 'Torch Docks (Night)',
      navigation: false,
    });

    expect(query).toHaveBeenCalledWith('foundry-mcp-bridge.updateScene', {
      identifier: 'Torch Docks',
      changes: { name: 'Torch Docks (Night)', navigation: false },
    });
  });

  it('bundles any provided grid sub-fields under changes.grid', async () => {
    const { tools, query } = makeTools();

    await tools.handleManageScenes({
      action: 'update',
      identifier: 'abc123',
      gridSize: 140,
    });

    expect(query.mock.calls[0][1]).toEqual({
      identifier: 'abc123',
      changes: { grid: { size: 140 } },
    });
  });

  it('rejects a remote background URL on update too', async () => {
    const { tools, query } = makeTools();

    await expect(
      tools.handleManageScenes({
        action: 'update',
        identifier: 'abc123',
        background: 'http://cdn.example.com/x.jpg',
      })
    ).rejects.toThrow(/remote URL/i);

    expect(query).not.toHaveBeenCalled();
  });

  it('requires an identifier', async () => {
    const { tools, query } = makeTools();

    await expect(tools.handleManageScenes({ action: 'update', name: 'no id' })).rejects.toThrow();

    expect(query).not.toHaveBeenCalled();
  });
});

describe('SceneManagementTools delete', () => {
  it('refuses to delete without confirmDelete and never calls the bridge', async () => {
    const { tools, query } = makeTools();

    await expect(
      tools.handleManageScenes({ action: 'delete', identifier: 'Torch Docks' })
    ).rejects.toThrow(/confirmDelete/);

    expect(query).not.toHaveBeenCalled();
  });

  it('deletes when confirmDelete is set', async () => {
    const { tools, query } = makeTools();

    await tools.handleManageScenes({
      action: 'delete',
      identifier: 'Torch Docks',
      confirmDelete: true,
    });

    expect(query).toHaveBeenCalledWith('foundry-mcp-bridge.deleteScene', {
      identifier: 'Torch Docks',
    });
  });
});

describe('SceneManagementTools activate', () => {
  it('delegates to the existing switch-scene bridge query shape', async () => {
    const { tools, query } = makeTools();

    await tools.handleManageScenes({ action: 'activate', identifier: 'Torch Docks' });

    expect(query).toHaveBeenCalledWith('foundry-mcp-bridge.activateScene', {
      scene_identifier: 'Torch Docks',
      optimize_view: true,
    });
  });

  it('honours optimizeView: false', async () => {
    const { tools, query } = makeTools();

    await tools.handleManageScenes({
      action: 'activate',
      identifier: 'Torch Docks',
      optimizeView: false,
    });

    expect(query.mock.calls[0][1].optimize_view).toBe(false);
  });
});
