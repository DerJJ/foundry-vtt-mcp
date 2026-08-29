/**
 * dnd5e-create-npc tests — focused on the feature-5 addition: an optional
 * `features` array that adds attacks / passives / spellcasting in the same call
 * that creates the NPC.
 *
 * Why this matters: building an Iron Gods NPC otherwise takes one create call
 * plus one round-trip per attack. The `features` array collapses that to one
 * call WITHOUT weakening any per-feature validation (each entry still flows
 * through the real dnd5e-add-feature handlers) and WITHOUT silently swallowing
 * a feature that fails to apply.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DnD5eNpcTools } from './npc.js';
import { clearSystemCache } from '../../utils/system-detection.js';

const BASE_NPC = {
  name: 'Gearsman Sentinel',
  creatureType: 'construct',
  size: 'medium',
  cr: '2',
  abilities: { str: 16, dex: 12, con: 14, int: 6, wis: 10, cha: 5 },
  hpAverage: 45,
  hpFormula: '6d8+18',
  acMode: 'flat',
  acValue: 16,
};

function makeTools() {
  const calls: Array<{ method: string; data: any }> = [];
  const query = vi.fn(async (method: string, data?: any) => {
    calls.push({ method, data });
    if (method === 'foundry-mcp-bridge.getWorldInfo') {
      return { system: { id: 'dnd5e', version: '5.3.3' } };
    }
    if (method === 'foundry-mcp-bridge.createNpcActor') {
      return { actor: { id: 'npc-1', name: data.name } };
    }
    if (method.startsWith('foundry-mcp-bridge.add') || method.startsWith('foundry-mcp-bridge.set')) {
      // Shape the add-feature handlers expect back from the bridge.
      return {
        actor: { id: 'npc-1', name: 'Gearsman Sentinel' },
        item: { id: 'item-x', name: data?.featureName ?? 'feature' },
        items: [{ id: 'item-x', name: data?.featureName ?? 'feature' }],
      };
    }
    return { success: true };
  });
  const logger: any = {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: () => logger,
  };
  const foundryClient: any = { query };
  const tools = new DnD5eNpcTools({ foundryClient, logger });
  return { tools, query, calls };
}

beforeEach(() => {
  clearSystemCache();
});

describe('DnD5eNpcTools.getToolDefinitions', () => {
  it('advertises the optional features array with every add-feature mode', () => {
    const [def] = makeTools().tools.getToolDefinitions();
    expect(def.name).toBe('dnd5e-create-npc');
    const features = (def.inputSchema.properties as any).features;
    expect(features).toBeDefined();
    expect(features.type).toBe('array');
    expect(features.items.properties.featureType.enum).toEqual([
      'passive',
      'save',
      'attack',
      'attack-with-save',
      'aura',
      'spellcasting',
      'spells',
    ]);
  });

  it('does not make features required', () => {
    const [def] = makeTools().tools.getToolDefinitions();
    expect(def.inputSchema.required).not.toContain('features');
  });
});

describe('DnD5eNpcTools.handleCreateNpc — without features', () => {
  it('creates the actor and issues no add-feature queries', async () => {
    const { tools, calls } = makeTools();

    const res = await tools.handleCreateNpc({ ...BASE_NPC });

    expect(res.success).toBe(true);
    expect(res.actor.id).toBe('npc-1');
    const featureCalls = calls.filter(c => /Feature|Attack|Aura|Spell/.test(c.method));
    expect(featureCalls).toHaveLength(0);
  });

  it('treats an omitted features array as empty', async () => {
    const { tools } = makeTools();
    const res = await tools.handleCreateNpc({ ...BASE_NPC });
    expect(res.featuresAdded).toEqual([]);
    expect(res.featuresFailed).toEqual([]);
  });
});

describe('DnD5eNpcTools.handleCreateNpc — with features', () => {
  it('routes each feature to its add-feature handler, targeting the new actor, in order', async () => {
    const { tools, calls } = makeTools();

    const res = await tools.handleCreateNpc({
      ...BASE_NPC,
      features: [
        { featureType: 'passive', featureName: 'Immutable Form', description: 'Immune to shape change.' },
        {
          featureType: 'attack',
          featureName: 'Slam',
          attackType: 'melee',
          damageParts: [{ number: 2, denomination: 6, type: 'bludgeoning' }],
        },
      ],
    });

    expect(res.success).toBe(true);

    const featureMethods = calls
      .filter(c => c.method.startsWith('foundry-mcp-bridge.add'))
      .map(c => c.method);
    expect(featureMethods).toEqual([
      'foundry-mcp-bridge.addPassiveFeatureToActor',
      'foundry-mcp-bridge.addAttackToActor',
    ]);

    for (const c of calls.filter(c => c.method.startsWith('foundry-mcp-bridge.add'))) {
      expect(c.data.actorIdentifier).toBe('npc-1');
    }

    expect(res.featuresAdded.map((f: any) => f.featureName)).toEqual(['Immutable Form', 'Slam']);
    expect(res.featuresFailed).toEqual([]);
  });

  it('creates the actor before adding features', async () => {
    const { tools, calls } = makeTools();

    await tools.handleCreateNpc({
      ...BASE_NPC,
      features: [{ featureType: 'passive', featureName: 'Sentry Protocol' }],
    });

    const createIdx = calls.findIndex(c => c.method === 'foundry-mcp-bridge.createNpcActor');
    const featureIdx = calls.findIndex(c => c.method.startsWith('foundry-mcp-bridge.add'));
    expect(createIdx).toBeGreaterThanOrEqual(0);
    expect(featureIdx).toBeGreaterThan(createIdx);
  });

  it('keeps going when one feature fails, reports it, and still returns the actor', async () => {
    const calls: Array<{ method: string; data: any }> = [];
    const query = vi.fn(async (method: string, data?: any) => {
      calls.push({ method, data });
      if (method === 'foundry-mcp-bridge.getWorldInfo') return { system: { id: 'dnd5e' } };
      if (method === 'foundry-mcp-bridge.createNpcActor') return { actor: { id: 'npc-1', name: data.name } };
      if (method === 'foundry-mcp-bridge.addAttackToActor') throw new Error('bridge blew up');
      if (method.startsWith('foundry-mcp-bridge.add')) {
        return {
          actor: { id: 'npc-1', name: 'Gearsman Sentinel' },
          item: { id: 'item-x', name: data?.featureName ?? 'feature' },
        };
      }
      return { success: true };
    });
    const logger: any = {
      info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => logger,
    };
    const tools = new DnD5eNpcTools({ foundryClient: { query } as any, logger });

    const res = await tools.handleCreateNpc({
      ...BASE_NPC,
      features: [
        { featureType: 'attack', featureName: 'Bad Slam', attackType: 'melee', damageParts: [{ number: 1, denomination: 6, type: 'bludgeoning' }] },
        { featureType: 'passive', featureName: 'Still Works' },
      ],
    });

    expect(res.actor.id).toBe('npc-1');
    expect(res.featuresAdded.map((f: any) => f.featureName)).toEqual(['Still Works']);
    expect(res.featuresFailed).toHaveLength(1);
    expect(res.featuresFailed[0].featureName).toBe('Bad Slam');
    expect(res.partialFailure).toBe(true);
    expect(res.message).toMatch(/Bad Slam/);
  });

  it('rejects a features entry with no featureType before creating anything', async () => {
    const { tools, calls } = makeTools();

    await expect(
      tools.handleCreateNpc({ ...BASE_NPC, features: [{ featureName: 'Nameless' }] })
    ).rejects.toThrow();

    expect(calls.some(c => c.method === 'foundry-mcp-bridge.createNpcActor')).toBe(false);
  });
});
