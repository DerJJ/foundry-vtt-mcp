import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LibraryService } from './library.js';

function setup(options: { documentName?: string; hasDocument?: boolean } = {}) {
  const document = { id: 'doc1', name: 'Tavern Rumours' };
  const create = vi.fn(async (data: any) => ({
    id: 'new1',
    name: data.name,
    type: undefined,
    folder: data.folder ? { name: 'Imported' } : null,
  }));
  const fromCompendium = vi.fn((doc: any) => ({ name: doc.name, flags: { source: 'pack' } }));
  const pack = {
    documentName: options.documentName ?? 'JournalEntry',
    metadata: { type: options.documentName ?? 'JournalEntry' },
    getDocument: vi.fn(async () => (options.hasDocument === false ? null : document)),
  };
  vi.stubGlobal('game', {
    ready: true,
    world: { id: 'w' },
    user: { id: 'gm' },
    packs: new Map([['mod.rumours', pack]]),
    collections: new Map([[pack.documentName, { fromCompendium }]]),
  });
  vi.stubGlobal('getDocumentClass', () => ({ create }));
  return { create, fromCompendium, pack };
}

describe('importing a compendium document into the world', () => {
  beforeEach(() => vi.spyOn(console, 'log').mockImplementation(() => undefined));
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('creates a world document through the compendium conversion of Foundry itself', async () => {
    const { create, fromCompendium } = setup();
    const result = await new LibraryService().importCompendiumDocument({
      packId: 'mod.rumours',
      documentId: 'doc1',
    });

    expect(fromCompendium).toHaveBeenCalled();
    expect(create).toHaveBeenCalledWith({ name: 'Tavern Rumours', flags: { source: 'pack' } });
    expect(result).toMatchObject({
      success: true,
      imported: {
        id: 'new1',
        name: 'Tavern Rumours',
        documentName: 'JournalEntry',
        fromPack: 'mod.rumours',
      },
    });
  });

  it('files the new document in a folder path, creating it', async () => {
    const { create } = setup();
    const service = new LibraryService();
    const createFolder = vi.fn(async () => ({ id: 'folder9' }));
    service.createFolderByPath = createFolder as any;

    await service.importCompendiumDocument({
      packId: 'mod.rumours',
      documentId: 'doc1',
      folderSegments: ['Imported', 'Rumours'],
    });

    expect(createFolder).toHaveBeenCalledWith(['Imported', 'Rumours'], 'JournalEntry');
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ folder: 'folder9' }));
  });

  it('refuses adventures', async () => {
    const { create } = setup({ documentName: 'Adventure' });
    await expect(
      new LibraryService().importCompendiumDocument({ packId: 'mod.rumours', documentId: 'doc1' })
    ).rejects.toThrow(/Adventures cannot be imported/);
    expect(create).not.toHaveBeenCalled();
  });

  it('says when the pack or the document does not exist', async () => {
    setup();
    await expect(
      new LibraryService().importCompendiumDocument({ packId: 'nope', documentId: 'doc1' })
    ).rejects.toThrow('pack nope not found');
    setup({ hasDocument: false });
    await expect(
      new LibraryService().importCompendiumDocument({ packId: 'mod.rumours', documentId: 'gone' })
    ).rejects.toThrow('Document gone not found');
  });
});
