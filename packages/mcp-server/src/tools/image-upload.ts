/**
 * Image Upload Tool
 *
 * Brings a local image file — on the machine running this MCP server — into the
 * active Foundry world's data directory, via the module's FilePicker.upload path
 * (the same mechanism AI map generation uses). Returns the Foundry-relative path,
 * ready to hand to manage-actors (img / tokenImg) or update-token (img).
 *
 * The server reads and base64-encodes the file; the module writes it. Remote
 * URLs are never involved — that is the whole point, since art served from an
 * unreachable host fails to load for players.
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { z } from 'zod';
import { FoundryClient } from '../foundry-client.js';
import { Logger } from '../logger.js';

/** Extensions Foundry renders as token / portrait / scene art. */
const ALLOWED_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.avif'];

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.avif': 'image/avif',
};

/** Foundry's default upload ceiling is 30 MB; stay under it with margin. */
const MAX_BYTES = 28 * 1024 * 1024;

/** Strip anything that could escape a single path segment. */
const sanitizeSegment = (s: string) => s.trim().replace(/[^a-zA-Z0-9_\-.]/g, '_');

/** "", ".", ".." and friends — a segment that would climb or vanish. */
const isTraversal = (s: string) => s === '' || /^\.+$/.test(s);

export interface ImageUploadToolsOptions {
  foundryClient: FoundryClient;
  logger: Logger;
}

export class ImageUploadTools {
  private foundryClient: FoundryClient;
  private logger: Logger;

  constructor({ foundryClient, logger }: ImageUploadToolsOptions) {
    this.foundryClient = foundryClient;
    this.logger = logger.child({ component: 'ImageUploadTools' });
  }

  getToolDefinitions() {
    return [
      {
        name: 'upload-image',
        description:
          'Upload a local image file (on the machine running this MCP server) into the active ' +
          'Foundry world, returning the Foundry-relative path to use as an actor portrait ' +
          '(manage-actors img), a prototype-token image (manage-actors tokenImg), or a placed ' +
          "token's image (update-token img). Files land under worlds/<world>/<subfolder>/. " +
          'Accepts .png .jpg .jpeg .webp .gif .svg .avif, up to 28 MB.',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description:
                'Absolute or ~-relative path to the image file on the machine running this ' +
                'MCP server.',
            },
            subfolder: {
              type: 'string',
              description:
                'Destination under the world directory (worlds/<world>/<subfolder>/), created ' +
                'if absent. "/" nests. Defaults to "mcp-art".',
              default: 'mcp-art',
            },
            filename: {
              type: 'string',
              description:
                "Name to save the file as, including extension. Defaults to the source file's " +
                'name. Characters outside [A-Za-z0-9_-.] become "_".',
            },
          },
          required: ['path'],
        },
      },
    ];
  }

  async handleUploadImage(args: any): Promise<any> {
    const { path: filePath, subfolder, filename } = z
      .object({
        path: z.string().min(1),
        subfolder: z.string().default('mcp-art'),
        filename: z.string().min(1).optional(),
      })
      .parse(args);

    const resolved = filePath.startsWith('~')
      ? path.join(os.homedir(), filePath.slice(1))
      : path.resolve(filePath);

    const ext = path.extname(filename ?? resolved).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      throw new Error(
        `Unsupported image type "${ext || '(none)'}". Allowed: ${ALLOWED_EXTENSIONS.join(', ')}.`
      );
    }

    let data: Buffer;
    try {
      data = await fs.readFile(resolved);
    } catch (err) {
      throw new Error(
        `Cannot read image file at "${resolved}": ` +
          `${err instanceof Error ? err.message : String(err)}`
      );
    }

    if (data.length > MAX_BYTES) {
      throw new Error(
        `Image is ${(data.length / 1024 / 1024).toFixed(1)} MB; the limit is ` +
          `${MAX_BYTES / 1024 / 1024} MB. Resize or re-encode it first.`
      );
    }

    const safeName = sanitizeSegment(filename ?? path.basename(resolved));
    if (isTraversal(safeName)) {
      throw new Error(`filename "${safeName}" is not a valid image file name.`);
    }

    const cleanSubfolder = subfolder
      .split('/')
      .map(sanitizeSegment)
      .filter(s => !isTraversal(s))
      .join('/');
    if (!cleanSubfolder) {
      throw new Error('subfolder resolved to an empty path.');
    }

    this.logger.info('Uploading image to Foundry', {
      source: resolved,
      bytes: data.length,
      subfolder: cleanSubfolder,
      filename: safeName,
    });

    const result = await this.foundryClient.query('foundry-mcp-bridge.upload-image', {
      filename: safeName,
      subfolder: cleanSubfolder,
      mimeType: MIME_BY_EXT[ext],
      imageData: data.toString('base64'),
    });

    if (result?.success === false) {
      throw new Error(result.error || 'Foundry rejected the image upload.');
    }

    return {
      success: true,
      path: result.path,
      filename: result.filename ?? safeName,
    };
  }
}
