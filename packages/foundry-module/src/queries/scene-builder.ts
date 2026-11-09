import { validateGMAccess } from './gm-access.js';
import type { QueryGroup, QueryHandler } from './query-registry.js';

/** Building scenes and their embedded documents, and the Simple Calendar clock. */
export class SceneBuilderQueries implements QueryGroup {
  routes(): Record<string, QueryHandler> {
    return {
      calendarClock: this.handleCalendarClock.bind(this),
    };
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
