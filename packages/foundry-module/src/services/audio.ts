import { validateFoundryState } from './support.js';

export class AudioService {
  /**
   * Resolve a playlist/sound identifier to its document. Accepts an exact id,
   * an exact name, or (unless opts.exact) a unique case-insensitive name
   * substring. Returns the document, or null for a null/empty identifier
   * (intentional clear).
   */
  private findMusicDoc(
    collection: any,
    identifier: string | null | undefined,
    kind: 'playlist' | 'playlistSound',
    opts?: { exact?: boolean }
  ): any | null {
    if (identifier === null || identifier === undefined || identifier === '') {
      return null;
    }
    if (typeof identifier !== 'string') {
      throw new Error(`${kind} identifier must be a string or null`);
    }
    const docs = collection?.contents || collection || [];
    const idMatch = docs.find((d: any) => d.id === identifier);
    if (idMatch) return idMatch;
    const lowered = identifier.toLowerCase();
    const exact = docs.find((d: any) => (d.name || '').toLowerCase() === lowered);
    if (exact) return exact;
    if (opts?.exact) {
      throw new Error(`${kind} not found: "${identifier}" (delete needs an exact id or name)`);
    }
    const partial = docs.filter((d: any) => (d.name || '').toLowerCase().includes(lowered));
    if (partial.length === 1) return partial[0];
    throw new Error(
      partial.length > 1
        ? `${kind} identifier is ambiguous: "${identifier}" matches ${partial.length} documents`
        : `${kind} not found: "${identifier}"`
    );
  }

  /**
   * Read the music binding of a scene document (playlist + playlistSound,
   * with names). Shared by the active-scene and scenes-list builders.
   */
  resolveSceneMusicBinding(scene: any): {
    playlist: { id: string; name: string } | null;
    playlistSound: { id: string; name: string } | null;
  } {
    // On a live client, scene.playlist / playlistSound are resolved
    // documents after an update; normalize back to ids.
    const plRaw = (scene as any).playlist;
    const sndRaw = (scene as any).playlistSound;
    const playlistId = typeof plRaw === 'string' ? plRaw : plRaw?.id || null;
    const soundId = typeof sndRaw === 'string' ? sndRaw : sndRaw?.id || null;
    const playlistDoc = playlistId ? (game as any).playlists?.get(playlistId) || null : null;
    const soundDoc = playlistDoc && soundId ? playlistDoc.sounds?.get(soundId) || null : null;
    return {
      playlist: playlistId ? { id: playlistId, name: playlistDoc?.name || '(unknown)' } : null,
      playlistSound: soundId ? { id: soundId, name: soundDoc?.name || '(unknown)' } : null,
    };
  }

  // ===== PLAYLIST MANAGEMENT (CRUD + PLAYBACK) =====

  /**
   * Playback control. Supports playlist-level play/stop/cycle-mode and
   * per-sound play/stop, all through the client Playlist API so the server
   * and every connected client stay in sync.
   */
  async controlPlaylist(options: {
    playlist: string;
    command: 'play' | 'stop' | 'cycle-mode' | 'play-sound' | 'stop-sound';
    sound?: string;
  }): Promise<any> {
    validateFoundryState();

    try {
      const pl = this.findMusicDoc((game as any).playlists, options.playlist, 'playlist');
      if (!pl) throw new Error('playlist identifier is required');
      const info = { id: pl.id, name: pl.name, mode: pl.mode };

      switch (options.command) {
        case 'play':
          await pl.playAll();
          return { success: true, action: 'play', playlist: info };
        case 'stop':
          await pl.stopAll();
          return { success: true, action: 'stop', playlist: info };
        case 'cycle-mode':
          await pl.cycleMode();
          return { success: true, action: 'cycle-mode', playlist: info, mode: pl.mode as number };
        case 'play-sound':
        case 'stop-sound': {
          if (!options.sound) throw new Error(`command ${options.command} requires "sound"`);
          const snd = this.findMusicDoc(pl.sounds, options.sound, 'playlistSound');
          if (!snd) throw new Error(`sound not found: "${options.sound}"`);
          if (options.command === 'play-sound') await pl.playSound(snd);
          else await pl.stopSound(snd);
          return {
            success: true,
            action: options.command,
            playlist: info,
            sound: { id: snd.id, name: snd.name, path: snd.path },
          };
        }
        default:
          throw new Error(`Unknown command: ${options.command}`);
      }
    } catch (error) {
      throw new Error(
        `Failed to control playlist: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}
