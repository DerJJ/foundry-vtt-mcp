import { afterEach, describe, expect, it, vi } from 'vitest';
import { DocumentsService } from './documents.js';

function setup(max: number) {
  const ActorClass = {
    createDocuments: vi.fn(async (payload: any[]) =>
      payload.map((p, i) => ({ id: `a${i}`, name: p.name }))
    ),
    schema: { fields: {} },
    metadata: { embedded: {} },
  };
  vi.stubGlobal('game', {
    ready: true,
    world: { id: 'w' },
    user: { id: 'gm' },
    system: { id: 'dnd5e' },
    settings: { get: vi.fn(() => max) },
    documentTypes: { Item: [], Actor: [] },
    collections: new Map<string, any>([['Actor', { contents: [], get: () => undefined }]]),
  });
  vi.stubGlobal('getDocumentClass', () => ActorClass);
  return { service: new DocumentsService({ folderPathOf: () => '' } as any), ActorClass };
}

describe('the Max Actors Per Request setting', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('refuses to create more actors than the setting allows, before creating any', async () => {
    const { service, ActorClass } = setup(2);
    await expect(
      service.run({
        action: 'create',
        type: 'Actor',
        data: [{ name: 'a' }, { name: 'b' }, { name: 'c' }],
      })
    ).rejects.toThrow('At most 2 actors');
    expect(ActorClass.createDocuments).not.toHaveBeenCalled();
  });

  it('allows up to the limit', async () => {
    const { service, ActorClass } = setup(2);
    await service.run({ action: 'create', type: 'Actor', data: [{ name: 'a' }, { name: 'b' }] });
    expect(ActorClass.createDocuments).toHaveBeenCalledTimes(1);
  });
});
