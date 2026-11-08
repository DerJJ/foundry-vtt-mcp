import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IndexBuildingError, PersistentCreatureIndex } from './creature-index.js';

function pack(id: string, size: number, label = id) {
  return { metadata: { id, label, type: 'Actor' }, index: { size } };
}

function stubWorld(packs: ReturnType<typeof pack>[], systemId = 'dnd5e') {
  vi.stubGlobal('Hooks', { on: vi.fn(() => 1), once: vi.fn(() => 1), off: vi.fn() });
  vi.stubGlobal('game', {
    system: { id: systemId },
    packs: new Map(packs.map(p => [p.metadata.id, p])),
  });
}

type Internals = {
  loadPersistedIndex: () => Promise<unknown>;
  isIndexValid: (index: unknown) => boolean;
  buildEnhancedIndex: (force: boolean) => Promise<unknown[]>;
  generatePackFingerprint: (pack: unknown) => unknown;
  unchangedPacks: (index: unknown) => Map<string, unknown[]>;
  extractOrReuse: (
    pack: unknown,
    extract: () => Promise<{ creatures: unknown[]; errors: number }>
  ) => Promise<{ creatures: unknown[]; errors: number }>;
  reusable: Map<string, unknown[]>;
  progress: { done: number; total: number; current: string };
};

function setup(packs = [pack('a', 3), pack('b', 5)]) {
  stubWorld(packs);
  const index = new PersistentCreatureIndex();
  return { index, internals: index as unknown as Internals };
}

function saved(index: Internals, packs: ReturnType<typeof pack>[], creatures: unknown[]) {
  return {
    metadata: {
      version: '1.0.0',
      gameSystem: 'dnd5e',
      totalCreatures: creatures.length,
      timestamp: 0,
      packFingerprints: new Map(packs.map(p => [p.metadata.id, index.generatePackFingerprint(p)])),
    },
    creatures,
  };
}

describe('creature index availability', () => {
  beforeEach(() => vi.spyOn(console, 'log').mockImplementation(() => undefined));
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns a valid saved index at once, without building', async () => {
    const { index, internals } = setup();
    const creatures = [{ id: '1', pack: 'a' }];
    internals.loadPersistedIndex = async () =>
      saved(internals, [pack('a', 3), pack('b', 5)], creatures);
    internals.buildEnhancedIndex = vi.fn();

    await expect(index.getEnhancedIndex()).resolves.toEqual(creatures);
    expect(internals.buildEnhancedIndex).not.toHaveBeenCalled();
  });

  it('builds when the saved index is out of date, and returns what was built', async () => {
    const { index, internals } = setup();
    internals.loadPersistedIndex = async () => null;
    internals.buildEnhancedIndex = vi.fn(async () => [{ id: 'new' }]);

    await expect(index.getEnhancedIndex()).resolves.toEqual([{ id: 'new' }]);
    expect(index.getStatus().building).toBe(false);
  });

  it('reports progress instead of waiting for a slow build', async () => {
    vi.useFakeTimers();
    const { index, internals } = setup();
    internals.loadPersistedIndex = async () => null;
    internals.buildEnhancedIndex = vi.fn(() => new Promise<unknown[]>(() => undefined));

    const search = index.getEnhancedIndex();
    const assertion = expect(search).rejects.toBeInstanceOf(IndexBuildingError);
    await vi.advanceTimersByTimeAsync(20_000);
    await assertion;
    await expect(search).rejects.toThrow(/still building.*fallbackToNameSearch/s);
    expect(index.getStatus().building).toBe(true);
  });

  it('tells how far the build is', async () => {
    vi.useFakeTimers();
    const { index, internals } = setup();
    internals.loadPersistedIndex = async () => null;
    internals.buildEnhancedIndex = vi.fn(async () => {
      internals.progress.done = 1;
      internals.progress.current = 'Monsters';
      return new Promise<unknown[]>(() => undefined);
    });

    const search = index.getEnhancedIndex();
    const assertion = expect(search).rejects.toThrow('1 of 2 packs done, now Monsters');
    await vi.advanceTimersByTimeAsync(20_000);
    await assertion;
  });

  it('starts one build for requests that arrive while it runs', async () => {
    vi.useFakeTimers();
    const { index, internals } = setup();
    internals.loadPersistedIndex = async () => null;
    internals.buildEnhancedIndex = vi.fn(() => new Promise<unknown[]>(() => undefined));

    const first = index.getEnhancedIndex().catch(e => e);
    const second = index.getEnhancedIndex().catch(e => e);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(await first).toBeInstanceOf(IndexBuildingError);
    expect(await second).toBeInstanceOf(IndexBuildingError);
    expect(internals.buildEnhancedIndex).toHaveBeenCalledTimes(1);
  });

  it('builds in the background when the world loads, without waiting', async () => {
    const { index, internals } = setup();
    internals.loadPersistedIndex = async () => null;
    internals.buildEnhancedIndex = vi.fn(() => new Promise<unknown[]>(() => undefined));

    await index.ensureIndex();
    expect(internals.buildEnhancedIndex).toHaveBeenCalledTimes(1);
    expect(index.getStatus().building).toBe(true);
  });

  it('does nothing at world load when the saved index is valid', async () => {
    const { index, internals } = setup();
    internals.loadPersistedIndex = async () => saved(internals, [pack('a', 3), pack('b', 5)], []);
    internals.buildEnhancedIndex = vi.fn();
    await index.ensureIndex();
    expect(internals.buildEnhancedIndex).not.toHaveBeenCalled();
  });
});

describe('incremental rebuild', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('reuses the creatures of unchanged packs and not those of a changed one', () => {
    const { internals } = setup([pack('a', 3), pack('b', 6)]); // b has grown from 5 to 6
    const old = saved(
      internals,
      [pack('a', 3), pack('b', 5)],
      [
        { id: '1', pack: 'a' },
        { id: '2', pack: 'a' },
        { id: '3', pack: 'b' },
      ]
    );
    const reusable = internals.unchangedPacks(old);
    expect([...reusable.keys()]).toEqual(['a']);
    expect(reusable.get('a')).toHaveLength(2);
  });

  it('reuses nothing when the game system or the index version changed', () => {
    const { internals } = setup();
    const old = saved(internals, [pack('a', 3)], [{ id: '1', pack: 'a' }]);
    expect(
      internals.unchangedPacks({ ...old, metadata: { ...old.metadata, gameSystem: 'pf2e' } }).size
    ).toBe(0);
    expect(
      internals.unchangedPacks({ ...old, metadata: { ...old.metadata, version: '0.1' } }).size
    ).toBe(0);
  });

  it('skips extraction for a reused pack and counts it as done', async () => {
    const { internals } = setup();
    internals.reusable = new Map([['a', [{ id: '1' }]]]);
    internals.progress = { done: 0, total: 2, current: '' };
    const extract = vi.fn(async () => ({ creatures: [{ id: 'x' }], errors: 0 }));

    const reused = await internals.extractOrReuse(pack('a', 3), extract);
    const fresh = await internals.extractOrReuse(pack('b', 5), extract);

    expect(reused.creatures).toEqual([{ id: '1' }]);
    expect(fresh.creatures).toEqual([{ id: 'x' }]);
    expect(extract).toHaveBeenCalledTimes(1);
    expect(internals.progress).toMatchObject({ done: 2, current: 'b' });
  });
});
