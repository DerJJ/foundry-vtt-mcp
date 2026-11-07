import { MODULE_ID } from '../constants.js';
import type { QueryGroup, QueryHandler } from './query-registry.js';

export class UtilityQueries implements QueryGroup {
  routes(): Record<string, QueryHandler> {
    return {
      ping: this.handlePing.bind(this),
    };
  }

  /**
   * Handle ping request
   */
  private async handlePing(): Promise<any> {
    return {
      status: 'ok',
      timestamp: Date.now(),
      module: MODULE_ID,
      foundryVersion: game.version,
      worldId: game.world?.id,
      userId: game.user?.id,
    };
  }
}
