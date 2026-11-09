import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DocumentsService,
  deepMerge,
  getPath,
  matchesFilter,
  project,
  summarizeKeys,
} from './documents.js';

describe('helpers', () => {
  it('reads and projects dot paths', () => {
    const doc = { name: 'A', system: { hp: { value: 3, max: 9 }, tags: ['x'] } };
    expect(getPath(doc, 'system.hp.value')).toBe(3);
    expect(getPath(doc, 'system.nope.value')).toBeUndefined();
    expect(project(doc, ['name', 'system.hp.max'])).toEqual({
      name: 'A',
      system: { hp: { max: 9 } },
    });
  });

  it('filters by equality, and by membership for arrays', () => {
    const doc = { type: 'spell', system: { level: 3, tags: ['fire', 'bolt'] } };
    expect(matchesFilter(doc, { type: 'spell', 'system.level': 3 })).toBe(true);
    expect(matchesFilter(doc, { type: ['spell', 'feat'] })).toBe(true);
    expect(matchesFilter(doc, { 'system.tags': 'fire' })).toBe(true);
    expect(matchesFilter(doc, { 'system.level': 4 })).toBe(false);
  });

  it('merges objects and replaces arrays', () => {
    expect(deepMerge({ a: { b: 1, c: 2 }, list: [1, 2] }, { a: { b: 9 }, list: [3] })).toEqual({
      a: { b: 9, c: 2 },
      list: [3],
    });
  });

  it('summarises what makes a document large', () => {
    const summary = summarizeKeys({ name: 'x', items: [1, 2, 3], system: { details: { a: 1 } } });
    expect(summary['items']).toContain('3 entries');
    expect(Object.keys(summary)).toContain('system.details');
  });
});

// --- a small fake world ----------------------------------------------------------------------------

function fakeDoc(documentName: string, id: string, name: string, extra: Record<string, any> = {}) {
  const doc: any = {
    documentName,
    id,
    name,
    ...extra,
    toObject: () => ({ _id: id, name, ...extra }),
  };
  return doc;
}

function collection(docs: any[]) {
  return { contents: docs, get: (id: string) => docs.find(d => d.id === id) };
}

function setup(options: { locked?: boolean } = {}) {
  const sword = fakeDoc('Item', 'i1', 'Sword', { type: 'weapon' });
  const fireball = fakeDoc('Item', 'i2', 'Fireball', { type: 'spell' });
  const bless = fakeDoc('Item', 'i3', 'Bless', { type: 'spell' });
  const items = collection([sword, fireball, bless]);
  const hero: any = fakeDoc('Actor', 'a1', 'Hero', { type: 'character' });
  hero.getEmbeddedCollection = vi.fn((type: string) => {
    if (type !== 'Item') throw new Error('no such embedded');
    return items;
  });
  hero.createEmbeddedDocuments = vi.fn(async (_type: string, payload: any[]) =>
    payload.map((p, i) => fakeDoc('Item', `new${i}`, p.name, { type: p.type }))
  );
  hero.updateEmbeddedDocuments = vi.fn(async (_type: string, updates: any[]) =>
    updates.map(u => fakeDoc('Item', u._id, 'Renamed'))
  );
  hero.deleteEmbeddedDocuments = vi.fn(async () => []);
  const goblin = fakeDoc('Actor', 'a2', 'Goblin', { type: 'npc' });
  const twin1 = fakeDoc('Actor', 'a3', 'Twin');
  const twin2 = fakeDoc('Actor', 'a4', 'Twin');
  const actors = collection([hero, goblin, twin1, twin2]);

  const ActorClass = {
    createDocuments: vi.fn(async (payload: any[]) =>
      payload.map((p, i) => fakeDoc('Actor', `n${i}`, p.name))
    ),
    updateDocuments: vi.fn(async (updates: any[]) =>
      updates.map(u => fakeDoc('Actor', u._id, 'Changed'))
    ),
    deleteDocuments: vi.fn(async () => []),
    schema: { fields: {} },
    metadata: { embedded: { Item: 'items', ActiveEffect: 'effects' } },
  };
  const entry = fakeDoc('Actor', 'p1', 'Pack Goblin', { type: 'npc', system: { cr: 1 } });
  const pack: any = {
    documentName: 'Actor',
    locked: !!options.locked,
    metadata: { id: 'world.mine', packageType: 'world', type: 'Actor' },
    getDocument: vi.fn(async (id: string) => (id === 'p1' ? entry : null)),
    getIndex: vi.fn(async () => undefined),
    index: [{ _id: 'p1', name: 'Pack Goblin', type: 'npc' }],
  };
  const library: any = {
    resolvePack: vi.fn((id: string) => {
      if (id !== 'world.mine') throw new Error(`Compendium pack not found: "${id}"`);
      return pack;
    }),
    requireWritablePack: vi.fn((id: string) => {
      if (pack.locked) throw new Error(`Compendium "${id}" is locked.`);
      return pack;
    }),
    folderPathOf: vi.fn((f: any) => f.name),
    createFolderByPath: vi.fn(async () => ({ id: 'folder1' })),
    deleteFolderPath: vi.fn(async () => ({ success: true })),
  };

  vi.stubGlobal('game', {
    ready: true,
    world: { id: 'w' },
    user: { id: 'gm' },
    system: { id: 'dnd5e' },
    documentTypes: {
      Item: ['base', 'weapon', 'spell', 'feat'],
      Actor: ['base', 'character', 'npc'],
    },
    collections: new Map<string, any>([
      [
        'Actor',
        Object.assign(actors, {
          fromCompendium: (d: any) => ({ name: d.name, type: d.type, system: d.system }),
        }),
      ],
    ]),
  });
  vi.stubGlobal('getDocumentClass', (type: string) => (type === 'Actor' ? ActorClass : undefined));
  const service = new DocumentsService(library);
  return { service, hero, ActorClass, library, pack };
}

describe('DocumentsService', () => {
  beforeEach(() => vi.spyOn(console, 'log').mockImplementation(() => undefined));
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('list', () => {
    it('lists the world, sorted, with paging fields', async () => {
      const { service } = setup();
      const r = await service.run({ action: 'list', type: 'Actor', limit: 2 });
      expect(r.documents.map((d: any) => d.name)).toEqual(['Goblin', 'Hero']);
      expect(r).toMatchObject({ total: 4, limit: 2, offset: 0, hasMore: true });
      const next = await service.run({ action: 'list', type: 'Actor', limit: 2, offset: 2 });
      expect(next.documents.map((d: any) => d.name)).toEqual(['Twin', 'Twin']);
      expect(next.hasMore).toBe(false);
    });

    it('filters by name query and by field', async () => {
      const { service } = setup();
      expect((await service.run({ action: 'list', type: 'Actor', query: 'gob' })).total).toBe(1);
      expect(
        (await service.run({ action: 'list', type: 'Actor', filter: { type: 'npc' } })).total
      ).toBe(1);
    });

    it('lists the items of an actor by kind', async () => {
      const { service } = setup();
      const r = await service.run({
        action: 'list',
        type: 'Item',
        kind: 'spells',
        parent: { type: 'Actor', name: 'Hero' },
      });
      expect(r.documents.map((d: any) => d.name)).toEqual(['Bless', 'Fireball']);
      expect(r.parent).toMatchObject({ name: 'Hero' });
    });

    it('says which kinds exist when asked for one that does not', async () => {
      const { service } = setup();
      await expect(
        service.run({
          action: 'list',
          type: 'Item',
          kind: 'nope',
          parent: { type: 'Actor', name: 'Hero' },
        })
      ).rejects.toThrow('inventory');
    });

    it('lists a pack from its index', async () => {
      const { service } = setup();
      const r = await service.run({ action: 'list', type: 'Actor', pack: 'world.mine' });
      expect(r.documents).toEqual([{ id: 'p1', name: 'Pack Goblin', type: 'npc' }]);
    });

    it('refuses a pack that holds another type', async () => {
      const { service } = setup();
      await expect(
        service.run({ action: 'list', type: 'Item', pack: 'world.mine' })
      ).rejects.toThrow('holds Actor documents');
    });
  });

  describe('get', () => {
    it('reads one document by name, or only some fields', async () => {
      const { service } = setup();
      const r = await service.run({ action: 'get', type: 'Actor', name: 'goblin' });
      expect(r).toMatchObject({ id: 'a2', name: 'Goblin', data: { name: 'Goblin' } });
      const part = await service.run({ action: 'get', type: 'Actor', id: 'a2', fields: ['name'] });
      expect(part.data).toEqual({ name: 'Goblin' });
    });

    it('does not guess between two documents with one name', async () => {
      const { service } = setup();
      await expect(service.run({ action: 'get', type: 'Actor', name: 'Twin' })).rejects.toThrow(
        /2 Actor documents are named "Twin".*a3, a4/
      );
    });

    it('says what is large instead of returning it all', async () => {
      const { service, hero } = setup();
      hero.toObject = () => ({
        _id: 'a1',
        name: 'Hero',
        items: Array.from({ length: 500 }, (_, i) => ({
          name: `Item ${i}`,
          text: 'x'.repeat(200),
        })),
      });
      const r = await service.run({ action: 'get', type: 'Actor', id: 'a1' });
      expect(r.truncated).toBe(true);
      expect(r.keys.items).toContain('500 entries');
      expect(r.hint).toContain('fields');
    });
  });

  describe('create', () => {
    it('creates world documents with data', async () => {
      const { service, ActorClass } = setup();
      const r = await service.run({
        action: 'create',
        type: 'Actor',
        data: [{ name: 'A' }, { name: 'B' }],
      });
      expect(ActorClass.createDocuments).toHaveBeenCalledWith([{ name: 'A' }, { name: 'B' }]);
      expect(r.created.map((c: any) => c.name)).toEqual(['A', 'B']);
    });

    it('creates from a pack entry and lets data override it', async () => {
      const { service, ActorClass } = setup();
      await service.run({
        action: 'create',
        type: 'Actor',
        from: { packId: 'world.mine', itemId: 'p1' },
        data: { name: 'Gruk' },
      });
      expect(ActorClass.createDocuments).toHaveBeenCalledWith([
        { name: 'Gruk', type: 'npc', system: { cr: 1 } },
      ]);
    });

    it('files the new documents in a folder path', async () => {
      const { service, ActorClass, library } = setup();
      await service.run({
        action: 'create',
        type: 'Actor',
        data: { name: 'A' },
        folderSegments: ['Monsters', 'Goblins'],
      });
      expect(library.createFolderByPath).toHaveBeenCalledWith(
        ['Monsters', 'Goblins'],
        'Actor',
        undefined
      );
      expect(ActorClass.createDocuments).toHaveBeenCalledWith([{ name: 'A', folder: 'folder1' }]);
    });

    it('creates inside a parent, checking the kind', async () => {
      const { service, hero } = setup();
      await service.run({
        action: 'create',
        type: 'Item',
        kind: 'spells',
        parent: { type: 'Actor', name: 'Hero' },
        data: { name: 'Shield', type: 'spell' },
      });
      expect(hero.createEmbeddedDocuments).toHaveBeenCalledWith('Item', [
        { name: 'Shield', type: 'spell' },
      ]);
      await expect(
        service.run({
          action: 'create',
          type: 'Item',
          kind: 'spells',
          parent: { type: 'Actor', name: 'Hero' },
          data: { name: 'Axe', type: 'weapon' },
        })
      ).rejects.toThrow('not in spells');
    });

    it('uses the subtype as the default type', async () => {
      const { service, hero } = setup();
      await service.run({
        action: 'create',
        type: 'Item',
        subtype: 'spell',
        parent: { type: 'Actor', name: 'Hero' },
        data: { name: 'Shield' },
      });
      expect(hero.createEmbeddedDocuments).toHaveBeenCalledWith('Item', [
        { name: 'Shield', type: 'spell' },
      ]);
    });

    it('refuses a locked pack', async () => {
      const { service } = setup({ locked: true });
      await expect(
        service.run({ action: 'create', type: 'Actor', pack: 'world.mine', data: { name: 'A' } })
      ).rejects.toThrow('locked');
    });

    it('needs data or a source', async () => {
      const { service } = setup();
      await expect(service.run({ action: 'create', type: 'Actor' })).rejects.toThrow('needs data');
    });
  });

  describe('update', () => {
    it('changes one document found by name', async () => {
      const { service, ActorClass } = setup();
      await service.run({
        action: 'update',
        type: 'Actor',
        name: 'Goblin',
        data: { 'system.hp.value': 1 },
      });
      expect(ActorClass.updateDocuments).toHaveBeenCalledWith([
        { 'system.hp.value': 1, _id: 'a2' },
      ]);
    });

    it('changes several documents from a list that names their ids', async () => {
      const { service, ActorClass } = setup();
      await service.run({
        action: 'update',
        type: 'Actor',
        data: [
          { id: 'a1', name: 'Hero 2' },
          { _id: 'a2', name: 'Goblin 2' },
        ],
      });
      expect(ActorClass.updateDocuments).toHaveBeenCalledWith([
        { name: 'Hero 2', _id: 'a1' },
        { name: 'Goblin 2', _id: 'a2' },
      ]);
    });

    it('changes an embedded document through its parent', async () => {
      const { service, hero } = setup();
      await service.run({
        action: 'update',
        type: 'Item',
        id: 'i1',
        parent: { type: 'Actor', id: 'a1' },
        data: { name: 'Renamed' },
      });
      expect(hero.updateEmbeddedDocuments).toHaveBeenCalledWith('Item', [
        { name: 'Renamed', _id: 'i1' },
      ]);
    });

    it('needs data, and an id for each change in a list', async () => {
      const { service } = setup();
      await expect(
        service.run({ action: 'update', type: 'Actor', name: 'Goblin' })
      ).rejects.toThrow('needs data');
      await expect(
        service.run({ action: 'update', type: 'Actor', data: [{ name: 'x' }] })
      ).rejects.toThrow('needs an id');
    });
  });

  describe('delete', () => {
    it('deletes one document', async () => {
      const { service, ActorClass } = setup();
      const r = await service.run({ action: 'delete', type: 'Actor', id: 'a2' });
      expect(ActorClass.deleteDocuments).toHaveBeenCalledWith(['a2']);
      expect(r.deleted).toEqual([{ id: 'a2', name: 'Goblin' }]);
    });

    it('asks for confirmation before deleting several', async () => {
      const { service, ActorClass } = setup();
      await expect(
        service.run({ action: 'delete', type: 'Actor', id: ['a1', 'a2'] })
      ).rejects.toThrow('confirm');
      expect(ActorClass.deleteDocuments).not.toHaveBeenCalled();
      await service.run({ action: 'delete', type: 'Actor', id: ['a1', 'a2'], confirm: true });
      expect(ActorClass.deleteDocuments).toHaveBeenCalledWith(['a1', 'a2']);
    });

    it('deletes an embedded document through its parent', async () => {
      const { service, hero } = setup();
      await service.run({
        action: 'delete',
        type: 'Item',
        id: 'i1',
        parent: { type: 'Actor', id: 'a1' },
      });
      expect(hero.deleteEmbeddedDocuments).toHaveBeenCalledWith('Item', ['i1']);
    });

    it('deletes a folder with its contents only when confirmed', async () => {
      const { service, library } = setup();
      await expect(
        service.run({
          action: 'delete',
          type: 'Folder',
          subtype: 'Actor',
          folderSegments: ['A'],
          deleteContents: true,
        })
      ).rejects.toThrow('confirm');
      await service.run({
        action: 'delete',
        type: 'Folder',
        subtype: 'Actor',
        folderSegments: ['A'],
        deleteContents: true,
        confirm: true,
      });
      expect(library.deleteFolderPath).toHaveBeenCalledWith(
        expect.objectContaining({ segments: ['A'], deleteContents: true })
      );
    });
  });

  describe('schema', () => {
    it('without a type lists the types, what they contain and the kinds', async () => {
      const { service } = setup();
      const r = await service.run({ action: 'schema' });
      expect(r.system).toBe('dnd5e');
      expect(r.types.Actor.subtypes).toEqual(['character', 'npc']);
      expect(r.types.Actor.embedded).toEqual(['Item', 'ActiveEffect']);
      expect(r.kinds.spells).toEqual(['spell']);
      expect(r.kindsAreGuessed).toBe(false);
    });
  });

  it('refuses an unknown top-level type and an embedded type the parent does not have', async () => {
    const { service } = setup();
    await expect(service.run({ action: 'list', type: 'Wall' })).rejects.toThrow('needs a parent');
    await expect(
      service.run({ action: 'list', type: 'Wall', parent: { type: 'Actor', name: 'Hero' } })
    ).rejects.toThrow('has no embedded Wall');
  });
});
