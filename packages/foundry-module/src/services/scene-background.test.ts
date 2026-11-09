import { afterEach, describe, expect, it, vi } from 'vitest';
import { applySceneBackground, splitBackground } from './scene-background.js';

const generation = (n: number) => vi.stubGlobal('game', { release: { generation: n } });

describe('applySceneBackground', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('on v14 sets the image on the first level', async () => {
    generation(14);
    const level = { background: { src: '' }, update: vi.fn(async () => undefined) };
    const scene: any = { levels: { contents: [level] }, update: vi.fn() };
    await applySceneBackground(scene, 'a.png');
    expect(level.update).toHaveBeenCalledWith({ background: { src: 'a.png' } });
    expect(scene.update).not.toHaveBeenCalled();
  });

  it('on v14 creates a level when the scene has none', async () => {
    generation(14);
    const scene: any = { levels: { contents: [] }, createEmbeddedDocuments: vi.fn() };
    await applySceneBackground(scene, 'a.png');
    expect(scene.createEmbeddedDocuments).toHaveBeenCalledWith('Level', [
      { name: 'Base', background: { src: 'a.png' } },
    ]);
  });

  it('leaves a level that already has the image alone', async () => {
    generation(14);
    const level = { background: { src: 'a.png' }, update: vi.fn() };
    await applySceneBackground({ levels: { contents: [level] } }, 'a.png');
    expect(level.update).not.toHaveBeenCalled();
  });

  it('before v14 updates the scene itself, only when it differs', async () => {
    generation(13);
    const scene: any = { background: { src: '' }, update: vi.fn() };
    await applySceneBackground(scene, 'a.png');
    expect(scene.update).toHaveBeenCalledWith({ background: { src: 'a.png' } });
    scene.update.mockClear();
    scene.background.src = 'a.png';
    await applySceneBackground(scene, 'a.png');
    expect(scene.update).not.toHaveBeenCalled();
  });
});

describe('splitBackground', () => {
  it('takes the background out of the data', () => {
    expect(splitBackground({ name: 'S', background: { src: 'a.png', tint: 1 } })).toEqual({
      data: { name: 'S' },
      background: 'a.png',
    });
  });
  it('returns the data untouched without a background', () => {
    const data = { name: 'S' };
    expect(splitBackground(data)).toEqual({ data, background: undefined });
  });
});
