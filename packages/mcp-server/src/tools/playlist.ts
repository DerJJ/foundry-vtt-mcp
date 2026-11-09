import { z } from 'zod';
import { FoundryClient } from '../foundry-client.js';
import { Logger } from '../logger.js';

export interface PlaylistToolsOptions {
  foundryClient: FoundryClient;
  logger: Logger;
}

export class PlaylistTools {
  private foundryClient: FoundryClient;
  private logger: Logger;

  constructor({ foundryClient, logger }: PlaylistToolsOptions) {
    this.foundryClient = foundryClient;
    this.logger = logger.child({ component: 'PlaylistTools' });
  }

  getToolDefinitions() {
    return [
      {
        name: 'control-playlist',
        description:
          'Playback control for playlists and their sounds: play (playAll), stop (stopAll), cycle-mode (sequential -> shuffle -> soundboard), play-sound, stop-sound. Playlist and sound accept ids or unique names.',
        inputSchema: {
          type: 'object',
          properties: {
            playlist: { type: 'string', description: 'Playlist id or unique name' },
            command: {
              type: 'string',
              enum: ['play', 'stop', 'cycle-mode', 'play-sound', 'stop-sound'],
              description: 'Playback command',
            },
            sound: {
              type: 'string',
              description:
                'Sound id or unique name within the playlist (play-sound / stop-sound only)',
            },
          },
          required: ['playlist', 'command'],
        },
      },
    ];
  }

  async handleControlPlaylist(args: any): Promise<any> {
    const schema = z.object({
      playlist: z.string().min(1),
      command: z.enum(['play', 'stop', 'cycle-mode', 'play-sound', 'stop-sound']),
      sound: z.string().optional(),
    });
    const parsed = schema.parse(args);
    if ((parsed.command === 'play-sound' || parsed.command === 'stop-sound') && !parsed.sound) {
      throw new Error(`command ${parsed.command} requires "sound"`);
    }

    this.logger.info('Controlling playlist', {
      playlist: parsed.playlist,
      command: parsed.command,
    });
    try {
      const result = await this.foundryClient.query('foundry-mcp-bridge.control-playlist', parsed);
      return { success: true, ...result };
    } catch (error) {
      this.logger.error('Failed to control playlist', error);
      throw new Error(
        `Failed to control playlist: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}
