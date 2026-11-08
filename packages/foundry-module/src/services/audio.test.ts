import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioService } from './audio.js';

// game.playlists is a collection: it can look documents up but has no createDocuments. Creating
// goes through the document class (Playlist), as for Actor and Item.
describe('playlist creation', () => {
  const created: any[] = [];
  let embedded: Array<[string, any[]]>;

  beforeEach(() => {
    created.length = 0;
    embedded = [];
    vi.stubGlobal('game', {
      ready: true,
      world: {},
      user: { isGM: true },
      playlists: { contents: [] }, // no createDocuments, like the real collection
    });
    vi.stubGlobal('Playlist', {
      createDocuments: vi.fn(async (data: any[]) => {
        const docs = data.map((d, i) => ({
          id: `pl${i}`,
          ...d,
          createEmbeddedDocuments: vi.fn(async (type: string, rows: any[]) => {
            embedded.push([type, rows]);
            return rows;
          }),
        }));
        created.push(...docs);
        return docs;
      }),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  const service = () => new AudioService({} as any);

  it('creates a playlist through the Playlist document class', async () => {
    const result = await service().managePlaylists({ action: 'create', name: 'Tavern', mode: 1 });
    expect(result).toMatchObject({
      success: true,
      playlist: { id: 'pl0', name: 'Tavern', mode: 1 },
      soundsCreated: 0,
    });
    expect((globalThis as any).Playlist.createDocuments).toHaveBeenCalledWith([
      { name: 'Tavern', mode: 1 },
    ]);
  });

  it('adds the sounds to the new playlist', async () => {
    const result = await service().managePlaylists({
      action: 'create',
      name: 'Battle',
      sounds: [{ path: 'a.ogg', name: 'A' }, { path: 'b.ogg' }],
    });
    expect(result.soundsCreated).toBe(2);
    expect(embedded[0][0]).toBe('PlaylistSound');
    expect(embedded.flatMap(([, rows]) => rows).map(r => r.path)).toEqual(['a.ogg', 'b.ogg']);
  });

  it('asks for a name', async () => {
    await expect(service().managePlaylists({ action: 'create' })).rejects.toThrow(
      'name is required'
    );
  });
});
