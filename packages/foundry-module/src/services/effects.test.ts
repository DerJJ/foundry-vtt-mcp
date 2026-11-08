import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EffectService } from './effects.js';

function world(systemId: string, createReturns: any[]) {
  const actor: any = {
    id: 'a1',
    name: 'Hero',
    effects: { get: () => undefined, contents: [] },
    items: { get: () => undefined, find: () => undefined },
    createEmbeddedDocuments: vi.fn(async () => createReturns),
  };
  vi.stubGlobal('game', {
    ready: true,
    world: {},
    user: { isGM: true },
    system: { id: systemId },
    actors: { get: (id: string) => (id === 'a1' ? actor : undefined), find: () => undefined },
  });
  return actor;
}

const create = (service = new EffectService()) =>
  service.manageEffects({
    action: 'create',
    actorIdentifier: 'a1',
    parentType: 'actor',
    effectData: { name: 'Blessed' },
  });

describe('effect creation', () => {
  beforeEach(() => vi.spyOn(console, 'warn').mockImplementation(() => undefined));
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns the created effect', async () => {
    world('dnd5e', [{ id: 'e1', toObject: () => ({ _id: 'e1', name: 'Blessed' }) }]);
    const result = await create();
    expect(result).toMatchObject({ success: true, effect: { name: 'Blessed' } });
  });

  // Some systems decline ActiveEffects without an error; the caller needs to know why.
  it('explains that PF2e models effects as items when nothing is created', async () => {
    world('pf2e', []);
    await expect(create()).rejects.toThrow(/pf2e.*effect item/i);
  });

  it('names the system when any other system creates nothing', async () => {
    world('dnd5e', []);
    await expect(create()).rejects.toThrow(/dnd5e/);
  });
});
