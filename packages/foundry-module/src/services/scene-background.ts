/**
 * Sets the background image of a scene.
 *
 * Foundry v14 removed `Scene#background`: the image lives on the scene's first Level document.
 * Older versions keep it in `background.src` on the scene itself, and a nested `background` in
 * `Scene.create` data is not always kept, so it is checked and set again after the create.
 */
export async function applySceneBackground(scene: any, src: string): Promise<void> {
  const generation = Number((globalThis as any).game?.release?.generation ?? 0);

  if (generation >= 14) {
    const level = scene.levels?.contents?.[0];
    if (level) {
      if (level.background?.src !== src) await level.update({ background: { src } });
    } else {
      await scene.createEmbeddedDocuments('Level', [{ name: 'Base', background: { src } }]);
    }
    return;
  }

  if (scene.background?.src !== src) await scene.update({ background: { src } });
}

/** Takes the background out of scene data, so that it is applied by {@link applySceneBackground}. */
export function splitBackground(sceneData: any): { data: any; background: string | undefined } {
  const background: string | undefined = sceneData?.background?.src;
  if (!background) return { data: sceneData, background: undefined };
  const data = { ...sceneData };
  delete data.background;
  return { data, background };
}
