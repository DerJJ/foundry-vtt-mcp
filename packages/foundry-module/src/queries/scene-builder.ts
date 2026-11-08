import { validateGMAccess } from './gm-access.js';
import type { QueryGroup, QueryHandler } from './query-registry.js';

/** Building scenes and their embedded documents, and the Simple Calendar clock. */
export class SceneBuilderQueries implements QueryGroup {
  routes(): Record<string, QueryHandler> {
    return {
      manageScene: this.handleManageScene.bind(this),
      calendarClock: this.handleCalendarClock.bind(this),
    };
  }

  async handleManageScene(data: any): Promise<any> {
    const gmCheck = validateGMAccess();
    if (!gmCheck.allowed) return { error: 'Access denied', success: false };
    const g = (globalThis as any).game;
    const findScene = (ident: string) =>
      g.scenes.get(ident) ??
      g.scenes.find((s: any) => s.name?.toLowerCase() === String(ident).toLowerCase());
    const compact = (doc: any) => {
      const o = doc.toObject();
      delete o._stats;
      return o;
    };
    if (data.action === 'create-scene') {
      const expectedBg = data.sceneData?.background?.src;
      const scene = await (globalThis as any).Scene.create(data.sceneData);
      if (expectedBg && scene.background?.src !== expectedBg) {
        await scene.update({ background: { src: expectedBg } });
      }
      return { success: true, scene: { id: scene.id, name: scene.name } };
    }
    const scene = findScene(data.sceneIdentifier);
    if (!scene) throw new Error(`Scene not found: ${data.sceneIdentifier}`);
    const type = data.documentType;
    switch (data.action) {
      case 'update-scene':
        await scene.update(data.sceneData);
        return { success: true, scene: { id: scene.id, name: scene.name } };
      case 'create-documents': {
        const docs = await scene.createEmbeddedDocuments(type, data.documents);
        return { success: true, documentType: type, created: docs.map((d: any) => d.id) };
      }
      case 'update-documents': {
        const docs = await scene.updateEmbeddedDocuments(type, data.documents);
        return { success: true, documentType: type, updated: docs.map((d: any) => d.id) };
      }
      case 'delete-documents': {
        const docs = await scene.deleteEmbeddedDocuments(type, data.ids);
        return { success: true, documentType: type, deleted: docs.map((d: any) => d.id) };
      }
      case 'list-documents':
        return {
          success: true,
          scene: { id: scene.id, name: scene.name },
          documentType: type,
          documents: scene.getEmbeddedCollection(type).map(compact),
        };
      default:
        throw new Error(`Unknown action: ${data.action}`);
    }
  }

  async handleCalendarClock(data: any): Promise<any> {
    const gmCheck = validateGMAccess();
    if (!gmCheck.allowed) return { error: 'Access denied', success: false };
    const api = (globalThis as any).SimpleCalendar?.api;
    if (!api) return { success: false, error: 'Simple Calendar Reborn ist nicht aktiv' };
    if (!api.isPrimaryGM())
      return { success: false, error: 'Dieser Browser ist nicht der Haupt-GM von Simple Calendar' };
    if (data.action === 'start') api.startClock();
    else if (data.action === 'pause') api.pauseClock();
    else if (data.action === 'stop') api.stopClock();
    const s = api.clockStatus();
    const status = s.started ? 'started' : s.paused ? 'paused' : 'stopped';
    return { success: true, status, gamePaused: (globalThis as any).game.paused === true };
  }
}
