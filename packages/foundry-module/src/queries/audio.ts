import type { FoundryDataAccess } from '../data-access.js';
import { validateGMAccess } from './gm-access.js';
import type { QueryGroup, QueryHandler } from './query-registry.js';

export class AudioQueries implements QueryGroup {
  constructor(private readonly dataAccess: FoundryDataAccess) {}

  routes(): Record<string, QueryHandler> {
    return {
      'control-playlist': this.handleControlPlaylist.bind(this),
    };
  }

  private async handleControlPlaylist(data: any): Promise<any> {
    try {
      const gmCheck = validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }
      if (!data?.playlist || !data?.command) {
        throw new Error('playlist and command are required');
      }
      return await this.dataAccess.audio.controlPlaylist(data);
    } catch (error) {
      throw new Error(
        `Failed to control playlist: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}
