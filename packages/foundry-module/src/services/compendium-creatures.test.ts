import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CompendiumService } from './compendium.js';
import { IndexBuildingError } from './creature-index.js';

type Internals = {
  persistentIndex: { getEnhancedIndex: () => Promise<unknown[]> };
  fallbackBasicCreatureSearch: (...args: unknown[]) => Promise<unknown>;
};

function setup(indexEnabled = true) {
  vi.stubGlobal('Hooks', { on: vi.fn(() => 1), once: vi.fn(() => 1), off: vi.fn() });
  vi.stubGlobal('game', {
    settings: {
      get: (_module: string, key: string) => key === 'enableEnhancedCreatureIndex' && indexEnabled,
    },
  });
  const service = new CompendiumService();
  const internals = service as unknown as Internals;
  internals.fallbackBasicCreatureSearch = vi.fn(async () => ({
    creatures: [{ name: 'by name' }],
    searchSummary: { searchMethod: 'fallback' },
  }));
  return { service, internals };
}

describe('creature search while the index is not usable', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const building = () => new IndexBuildingError({ done: 3, total: 10, current: 'Monsters' });

  it('says the index is building instead of answering from a different search', async () => {
    const { service, internals } = setup();
    internals.persistentIndex.getEnhancedIndex = vi.fn().mockRejectedValue(building());

    await expect(service.listCreaturesByCriteria({ creatureType: 'beast' })).rejects.toThrow(
      '3 of 10 packs done, now Monsters'
    );
    expect(internals.fallbackBasicCreatureSearch).not.toHaveBeenCalled();
  });

  it('does not hide other index failures either', async () => {
    const { service, internals } = setup();
    internals.persistentIndex.getEnhancedIndex = vi.fn().mockRejectedValue(new Error('disk full'));

    await expect(service.listCreaturesByCriteria({})).rejects.toThrow('disk full');
    expect(internals.fallbackBasicCreatureSearch).not.toHaveBeenCalled();
  });

  it('falls back to the name search when it is asked for', async () => {
    const { service, internals } = setup();
    internals.persistentIndex.getEnhancedIndex = vi.fn().mockRejectedValue(building());

    const result = await service.listCreaturesByCriteria({ fallbackToNameSearch: true });
    expect(result.creatures).toEqual([{ name: 'by name' }]);
  });

  it('uses the name search by design when the enhanced index is switched off', async () => {
    const { service, internals } = setup(false);
    await service.listCreaturesByCriteria({});
    expect(internals.fallbackBasicCreatureSearch).toHaveBeenCalled();
  });
});
