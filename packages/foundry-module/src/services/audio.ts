import { validateFoundryState } from './support.js';
import type { FoundryDataAccess } from '../data-access.js';

export class AudioService {
  constructor(private readonly access: FoundryDataAccess) {}

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

  /**
   * Set or clear the music binding of a scene. Writes through scene.update()
   * with the core ForeignDocumentFields playlist/playlistSound (id-only),
   * so the change syncs to connected clients without a reload. Both
   * identifiers are validated to exist before writing; explicit null clears.
   */
  async updateSceneMusic(options: {
    scene_identifier: string;
    playlist?: string | null;
    playlist_sound?: string | null;
  }): Promise<any> {
    validateFoundryState();

    try {
      const scene = this.access.world.findSceneByIdentifier(options.scene_identifier);

      const update: Record<string, any> = {};
      const result: Record<string, any> = {
        success: true,
        sceneId: scene.id,
        sceneName: scene.name,
      };

      if ('playlist' in options) {
        const pl = this.findMusicDoc((game as any).playlists, options.playlist, 'playlist');
        update.playlist = pl ? pl.id : null;
        result.playlist = pl ? { id: pl.id, name: pl.name } : null;
      }
      if ('playlist_sound' in options) {
        // A sound id is only valid together with its parent playlist: the
        // scene config UI enforces the same invariant.
        if (options.playlist_sound && !('playlist' in options) && !(scene as any).playlist) {
          throw new Error(
            'playlist_sound requires the scene to have a playlist (pass playlist too)'
          );
        }
        const parent = options.playlist
          ? this.findMusicDoc((game as any).playlists, options.playlist, 'playlist')
          : null;
        const snd = this.findMusicDoc(
          parent ? parent.sounds : null,
          options.playlist_sound,
          'playlistSound'
        );
        update.playlistSound = snd ? snd.id : null;
        result.playlistSound = snd ? { id: snd.id, name: snd.name } : null;
      }

      if (Object.keys(update).length === 0) {
        throw new Error('Nothing to update: pass playlist and/or playlist_sound (null to clear)');
      }
      if (
        'playlist' in update &&
        'playlistSound' in update &&
        update.playlistSound &&
        !update.playlist
      ) {
        throw new Error('playlist_sound cannot be set while clearing playlist');
      }

      await scene.update(update);

      return result;
    } catch (error) {
      throw new Error(
        `Failed to update scene music: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  // ===== PLAYLIST MANAGEMENT (CRUD + PLAYBACK) =====

  /**
   * Create or update a playlist, optionally with sounds in one call.
   * playlist: null -> create; identifier -> update by id or (unique) name.
   */
  async managePlaylists(options: {
    action: 'create' | 'update' | 'delete' | 'describe';
    playlist?: string | null;
    name?: string;
    mode?: number;
    fade?: number;
    description?: string;
    sorting?: 'a' | 'm';
    folder?: string | null;
    color?: string | null;
    sounds?: Array<{
      name?: string;
      path?: string;
      id?: string;
      volume?: number;
      repeat?: boolean;
      fade?: number;
    }>;
    updates?: Record<string, any>;
  }): Promise<any> {
    validateFoundryState();

    try {
      const playlists = () => (game as any).playlists?.contents || [];

      if (options.action === 'describe') {
        const doc = options.playlist
          ? this.findMusicDoc((game as any).playlists, options.playlist, 'playlist')
          : null;
        if (!doc) {
          return {
            success: true,
            playlists: playlists().map((pl: any) => ({
              id: pl.id,
              name: pl.name,
              mode: pl.mode,
              playing: pl.playing,
              soundCount: pl.sounds?.size || 0,
            })),
          };
        }
        return {
          success: true,
          playlist: {
            id: doc.id,
            name: doc.name,
            mode: doc.mode,
            playing: doc.playing,
            description: doc.description || '',
            folder: doc.folder || null,
            sort: doc.sort,
            sounds: (doc.sounds?.contents || []).map((s: any) => ({
              id: s.id,
              name: s.name,
              path: s.path,
              volume: s.volume,
              repeat: s.repeat,
              fade: s.fade,
              playing: s.playing,
            })),
          },
        };
      }

      if (options.action === 'create') {
        if (!options.name || typeof options.name !== 'string') {
          throw new Error('name is required for create');
        }
        const data: Record<string, any> = { name: options.name };
        if (options.mode !== undefined) data.mode = options.mode;
        if (options.fade !== undefined) data.fade = options.fade;
        if (options.description !== undefined) data.description = options.description;
        if (options.sorting !== undefined) data.sorting = options.sorting;
        if (options.folder !== undefined) data.folder = options.folder;
        if (options.color !== undefined) data.color = options.color;
        // The collection (game.playlists) cannot create documents; the document class can.
        const pl = await ((globalThis as any).Playlist as any).createDocuments([data]);
        const doc = Array.isArray(pl) ? pl[0] : pl;

        let soundsCreated = 0;
        for (const s of options.sounds || []) {
          if (!s.path) {
            throw new Error(`sound entry needs a "path": ${JSON.stringify(s)}`);
          }
          const sdata: Record<string, any> = { path: s.path };
          if (s.name !== undefined) sdata.name = s.name;
          if (s.volume !== undefined) sdata.volume = s.volume;
          if (s.repeat !== undefined) sdata.repeat = s.repeat;
          if (s.fade !== undefined) sdata.fade = s.fade;
          await (doc as any).createEmbeddedDocuments('PlaylistSound', [sdata]);
          soundsCreated++;
        }
        return {
          success: true,
          playlist: { id: doc.id, name: doc.name, mode: doc.mode },
          soundsCreated,
        };
      }

      if (options.action === 'update') {
        const doc = this.findMusicDoc((game as any).playlists, options.playlist, 'playlist');
        if (!doc) throw new Error('update requires a playlist identifier');
        const patch = { ...(options.updates || {}) } as Record<string, any>;
        for (const key of [
          'name',
          'mode',
          'fade',
          'description',
          'sorting',
          'folder',
          'color',
        ] as const) {
          if ((options as any)[key] !== undefined) patch[key] = (options as any)[key];
        }
        if (Object.keys(patch).length) await doc.update(patch);
        // Sound-level ops in the same call
        let soundsTouched = 0;
        for (const s of options.sounds || []) {
          if (!s.path && !s.name && !s.id) continue;
          const list = doc.sounds?.contents || [];
          let snd: any = null;
          if (s.id) snd = list.find((x: any) => x.id === s.id);
          else {
            const byPath = s.path ? list.filter((x: any) => x.path === s.path) : [];
            const byName = s.name ? list.filter((x: any) => x.name === s.name) : [];
            snd = byPath.length === 1 ? byPath[0] : byName.length === 1 ? byName[0] : null;
          }
          if (!snd) {
            throw new Error(
              `sound not found in playlist "${doc.name}" (need exact id or unique path/name)`
            );
          }
          const spatch: Record<string, any> = {};
          if (s.name !== undefined) spatch.name = s.name;
          if (s.path !== undefined) spatch.path = s.path;
          if (s.volume !== undefined) spatch.volume = s.volume;
          if (s.repeat !== undefined) spatch.repeat = s.repeat;
          if (s.fade !== undefined) spatch.fade = s.fade;
          if (Object.keys(spatch).length) {
            await snd.update(spatch);
            soundsTouched++;
          }
        }
        return {
          success: true,
          playlist: { id: doc.id, name: doc.name },
          soundsUpdated: soundsTouched,
        };
      }

      if (options.action === 'delete') {
        // Delete never guesses: exact id or name only.
        const doc = this.findMusicDoc((game as any).playlists, options.playlist, 'playlist', {
          exact: true,
        });
        if (!doc) throw new Error('delete requires a playlist identifier');
        const name = doc.name;
        await doc.delete();
        return { success: true, deleted: name };
      }

      throw new Error(`Unknown action: ${options.action}`);
    } catch (error) {
      throw new Error(
        `Failed to manage playlists: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

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
