/**
 * upload-image tests — the server reads a local file and hands the module a
 * base64 payload. These cover the validation that must happen before any file is
 * read or sent, and the shape of the bridge call.
 */

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ImageUploadTools } from './image-upload.js';

function makeTools(queryImpl?: (method: string, data: any) => unknown) {
  const query = vi.fn(
    queryImpl ?? (async () => ({ success: true, path: 'worlds/w/mcp-art/x.png', filename: 'x.png' }))
  );
  const logger: any = {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: () => logger,
  };
  const foundryClient: any = { query };
  const tools = new ImageUploadTools({ foundryClient, logger });
  return { tools, query };
}

let dir: string;
let pngPath: string;

beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'upload-image-test-'));
  pngPath = path.join(dir, 'gearsman.png');
  await fs.writeFile(pngPath, Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]));
});

afterAll(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe('ImageUploadTools', () => {
  it('reads the file and sends a base64 payload with the ext-derived MIME type', async () => {
    const { tools, query } = makeTools();

    const result = await tools.handleUploadImage({ path: pngPath });

    const call = query.mock.calls.find(c => c[0] === 'foundry-mcp-bridge.upload-image');
    expect(call?.[1]).toMatchObject({
      filename: 'gearsman.png',
      subfolder: 'mcp-art',
      mimeType: 'image/png',
      imageData: Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]).toString('base64'),
    });
    expect(result).toEqual({
      success: true,
      path: 'worlds/w/mcp-art/x.png',
      filename: 'x.png',
    });
  });

  it('sanitizes an override filename and drops traversal segments from a nested subfolder', async () => {
    const { tools, query } = makeTools();

    await tools.handleUploadImage({
      path: pngPath,
      subfolder: 'iron gods/../art',
      filename: 'weird name!.png',
    });

    const call = query.mock.calls.find(c => c[0] === 'foundry-mcp-bridge.upload-image');
    expect(call?.[1].subfolder).toBe('iron_gods/art');
    expect(call?.[1].filename).toBe('weird_name_.png');
  });

  it('rejects an unsupported extension before reading the file', async () => {
    const { tools, query } = makeTools();

    await expect(
      tools.handleUploadImage({ path: path.join(dir, 'notes.txt') })
    ).rejects.toThrow(/unsupported image type/i);

    expect(query).not.toHaveBeenCalled();
  });

  it('surfaces a clear error when the file does not exist', async () => {
    const { tools, query } = makeTools();

    await expect(
      tools.handleUploadImage({ path: path.join(dir, 'missing.png') })
    ).rejects.toThrow(/cannot read image file/i);

    expect(query).not.toHaveBeenCalled();
  });

  it('rejects a file over the size limit rather than streaming 30+ MB over the socket', async () => {
    const { tools, query } = makeTools();
    const bigPath = path.join(dir, 'huge.png');
    await fs.writeFile(bigPath, Buffer.alloc(29 * 1024 * 1024, 1));

    await expect(tools.handleUploadImage({ path: bigPath })).rejects.toThrow(/limit is 28 MB/i);

    expect(query).not.toHaveBeenCalled();
    await fs.rm(bigPath, { force: true });
  });

  it('propagates a module-side failure as a thrown error', async () => {
    const { tools } = makeTools(async () => ({ success: false, error: 'Access denied' }));

    await expect(tools.handleUploadImage({ path: pngPath })).rejects.toThrow(/access denied/i);
  });
});
