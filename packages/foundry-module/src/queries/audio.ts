import type { FoundryDataAccess } from '../data-access.js';
import { validateGMAccess } from './gm-access.js';
import type { QueryGroup, QueryHandler } from './query-registry.js';

export class AudioQueries implements QueryGroup {
  constructor(private readonly dataAccess: FoundryDataAccess) {}

  routes(): Record<string, QueryHandler> {
    return {
      'update-scene-music': this.handleUpdateSceneMusic.bind(this),
      'manage-playlists': this.handleManagePlaylists.bind(this),
      'control-playlist': this.handleControlPlaylist.bind(this),
    };
  }

  private async handleUpdateSceneMusic(data: any): Promise<any> {
    try {
      const gmCheck = validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }
      if (!data?.scene_identifier) {
        throw new Error('scene_identifier is required');
      }
      return await this.dataAccess.audio.updateSceneMusic(data);
    } catch (error) {
      throw new Error(
        `Failed to update scene music: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private async handleManagePlaylists(data: any): Promise<any> {
    try {
      const gmCheck = validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }
      if (!data?.action) {
        throw new Error('action is required (create | update | delete | describe)');
      }
      return await this.dataAccess.audio.managePlaylists(data);
    } catch (error) {
      throw new Error(
        `Failed to manage playlists: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
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
