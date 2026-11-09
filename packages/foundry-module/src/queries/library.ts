import { MODULE_ID } from '../constants.js';
import { validateFoundryState } from '../services/support.js';
import type { FoundryDataAccess } from '../data-access.js';
import { validateGMAccess } from './gm-access.js';
import type { QueryGroup, QueryHandler } from './query-registry.js';

/** Folders, compendium packs and their entries, and uploading image files into the world. */
export class LibraryQueries implements QueryGroup {
  constructor(private readonly dataAccess: FoundryDataAccess) {}

  routes(): Record<string, QueryHandler> {
    return {
      'upload-image': this.handleUploadImage.bind(this),
      listPacks: this.handleListPacks.bind(this),
      createPack: this.handleCreatePack.bind(this),
      deletePack: this.handleDeletePack.bind(this),
    };
  }

  /**
   * Handle a generic image upload: base64 in, written under
   * worlds/<world>/<subfolder>/, Foundry-relative path out. Used for token /
   * portrait art brought in from the machine running the MCP server. Shares the
   * FilePicker.upload mechanism with map upload but not its map-specific path,
   * MIME, or filename rules.
   */
  async handleUploadImage(data: {
    filename: string;
    subfolder: string;
    mimeType?: string;
    imageData: string;
  }): Promise<any> {
    try {
      const gmCheck = validateGMAccess();
      if (!gmCheck.allowed) {
        console.error(`[${MODULE_ID}] Image upload denied - not GM`);
        return { error: 'Access denied', success: false };
      }

      if (!data?.filename || typeof data.filename !== 'string') {
        throw new Error('filename is required and must be a string');
      }
      if (!data?.imageData || typeof data.imageData !== 'string') {
        throw new Error('imageData is required and must be a base64 string');
      }

      const ALLOWED = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.avif'];
      const safeFilename = data.filename.replace(/[^a-zA-Z0-9_\-.]/g, '_');
      const dot = safeFilename.lastIndexOf('.');
      const ext = dot >= 0 ? safeFilename.slice(dot).toLowerCase() : '';
      if (!ALLOWED.includes(ext)) {
        throw new Error(`Unsupported image type "${ext}". Allowed: ${ALLOWED.join(', ')}`);
      }

      const mimeType =
        typeof data.mimeType === 'string' && data.mimeType.startsWith('image/')
          ? data.mimeType
          : 'application/octet-stream';

      // base64 -> Blob -> File, matching the map-upload path.
      const byteCharacters = atob(data.imageData);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: mimeType });
      const file = new File([blob], safeFilename, { type: mimeType });

      const worldId = (game as any).world?.id || 'unknown-world';
      const subfolder = (data.subfolder || 'mcp-art')
        .split('/')
        .map((s: string) => s.trim().replace(/[^a-zA-Z0-9_\-.]/g, '_'))
        // drop "", ".", ".." — a segment that would climb out of the world dir
        .filter((s: string) => s !== '' && !/^\.+$/.test(s))
        .join('/');
      if (!subfolder) {
        throw new Error('subfolder resolved to an empty path');
      }
      const uploadPath = `worlds/${worldId}/${subfolder}`;

      const FilePickerAPI =
        (globalThis as any).foundry?.applications?.apps?.FilePicker?.implementation ||
        (globalThis as any).FilePicker;

      // FilePicker.createDirectory is not recursive; walk each level below the
      // (already-existing) world directory.
      let acc = `worlds/${worldId}`;
      for (const segment of subfolder.split('/')) {
        acc = `${acc}/${segment}`;
        try {
          await FilePickerAPI.createDirectory('data', acc, { bucket: null });
        } catch (dirError: any) {
          if (
            !dirError?.message?.includes('EEXIST') &&
            !dirError?.message?.includes('already exists')
          ) {
            console.warn(`[${MODULE_ID}] createDirectory("${acc}") warning:`, dirError?.message);
          }
        }
      }

      const response = await FilePickerAPI.upload('data', uploadPath, file, {}, { notify: false });

      console.log(`[${MODULE_ID}] Uploaded image to:`, response.path);

      return {
        success: true,
        path: response.path,
        filename: safeFilename,
        message: `Image uploaded to ${response.path}`,
      };
    } catch (error: any) {
      console.error(`[${MODULE_ID}] Failed to upload image:`, error);
      return {
        error: error.message || 'Failed to upload image',
        success: false,
      };
    }
  }

  async handleListPacks(): Promise<any> {
    const gmCheck = validateGMAccess();
    if (!gmCheck.allowed) return { error: 'Access denied', success: false };
    validateFoundryState();
    return this.dataAccess.library.listPacks();
  }

  async handleCreatePack(data: { label: string; type: string; name: string }): Promise<any> {
    const gmCheck = validateGMAccess();
    if (!gmCheck.allowed) return { error: 'Access denied', success: false };
    validateFoundryState();
    if (!data?.label || !data?.type || !data?.name) {
      throw new Error('label, type and name are required');
    }
    return this.dataAccess.library.createPack(data);
  }

  async handleDeletePack(data: { identifier: string }): Promise<any> {
    const gmCheck = validateGMAccess();
    if (!gmCheck.allowed) return { error: 'Access denied', success: false };
    validateFoundryState();
    if (!data?.identifier) {
      throw new Error('identifier is required');
    }
    return this.dataAccess.library.deletePack(data);
  }
}
