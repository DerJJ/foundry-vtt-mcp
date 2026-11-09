import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DocumentsService } from './documents.js';

function setup(generation: number) {
  const level = { background: { src: '' }, update: vi.fn(async () => undefined) };
  const scene: any = {
    documentName: 'Scene',
    id: 's1',
    name: 'Tavern',
    levels: { contents: [level] },
    background: { src: '' },
    update: vi.fn(async () => undefined),
  };
  const SceneClass = {
    createDocuments: vi.fn(async () => [scene]),
    updateDocuments: vi.fn(async () => [scene]),
    schema: { fields: {} },
    metadata: { embedded: {} },
  };
  vi.stubGlobal('game', {
    ready: true,
    world: { id: 'w' },
    user: { id: 'gm' },
    system: { id: 'dnd5e' },
    release: { generation },
    documentTypes: { Item: [], Actor: [] },
    collections: new Map<string, any>([
      ['Scene', { contents: [scene], get: (id: string) => (id === 's1' ? scene : undefined) }],
    ]),
  });
  vi.stubGlobal('getDocumentClass', () => SceneClass);
  const library: any = { folderPathOf: () => '' };
  return { service: new DocumentsService(library), level, scene, SceneClass };
}

describe('scene backgrounds through documents', () => {
  beforeEach(() => vi.spyOn(console, 'log').mockImplementation(() => undefined));
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('create sets the image on the first level on v14, not in the scene data', async () => {
    const { service, level, SceneClass } = setup(14);
    await service.run({
      action: 'create',
      type: 'Scene',
      data: { name: 'Tavern', background: { src: 'maps/tavern.png' } },
    });
    expect(SceneClass.createDocuments).toHaveBeenCalledWith([{ name: 'Tavern' }]);
    expect(level.update).toHaveBeenCalledWith({ background: { src: 'maps/tavern.png' } });
  });

  it('update does the same for a scene found by name', async () => {
    const { service, level, SceneClass } = setup(14);
    await service.run({
      action: 'update',
      type: 'Scene',
      name: 'Tavern',
      data: { background: { src: 'maps/new.png' }, width: 3000 },
    });
    expect(SceneClass.updateDocuments).toHaveBeenCalledWith([{ width: 3000, _id: 's1' }]);
    expect(level.update).toHaveBeenCalledWith({ background: { src: 'maps/new.png' } });
  });

  it('before v14 the scene itself is updated', async () => {
    const { service, scene } = setup(13);
    await service.run({
      action: 'update',
      type: 'Scene',
      name: 'Tavern',
      data: { background: { src: 'maps/old.png' } },
    });
    expect(scene.update).toHaveBeenCalledWith({ background: { src: 'maps/old.png' } });
  });
});

describe('system notes in schema', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('adds the notes of a system that has them, and leaves out the empty answer', async () => {
    setup(14);
    const library: any = { folderPathOf: () => '' };
    const withNotes = new DocumentsService(library, () => ({
      description: 'Enum reference',
      items: { weapon: {} },
    }));
    expect((await withNotes.run({ action: 'schema' })).systemNotes).toMatchObject({
      description: 'Enum reference',
    });
    const without = new DocumentsService(library, () => ({ message: 'nothing' }));
    expect((await without.run({ action: 'schema' })).systemNotes).toBeUndefined();
  });
});
