/**
 * Folder path parsing. Nested folders are addressed as "A/B/C"; this turns that
 * into segments the module can resolve against game.folders. Bad input is rejected
 * here rather than silently creating a folder literally named " / Book 1".
 */

import { describe, it, expect } from 'vitest';
import { MAX_FOLDER_DEPTH, parseFolderPath } from './folder-path.js';

describe('parseFolderPath', () => {
  it('splits a nested path into segments', () => {
    expect(parseFolderPath('Iron Gods/Book 1 - Fires of Creation/Torch')).toEqual([
      'Iron Gods',
      'Book 1 - Fires of Creation',
      'Torch',
    ]);
  });

  it('returns a single segment for an unnested name', () => {
    expect(parseFolderPath('Foundry MCP Creatures')).toEqual(['Foundry MCP Creatures']);
  });

  it('trims whitespace around segments', () => {
    expect(parseFolderPath('  Iron Gods / Torch  ')).toEqual(['Iron Gods', 'Torch']);
  });

  it('rejects an empty path instead of creating an unnamed folder', () => {
    expect(() => parseFolderPath('   ')).toThrow(/empty/i);
  });

  it('rejects an empty segment so a stray slash cannot create a blank folder', () => {
    expect(() => parseFolderPath('Iron Gods//Torch')).toThrow(/empty segment/i);
  });

  it('rejects a trailing slash rather than silently ignoring it', () => {
    expect(() => parseFolderPath('Iron Gods/')).toThrow(/empty segment/i);
  });

  it('rejects nesting deeper than Foundry comfortably displays', () => {
    const tooDeep = Array.from({ length: MAX_FOLDER_DEPTH + 1 }, (_, i) => `L${i}`).join('/');
    expect(() => parseFolderPath(tooDeep)).toThrow(/depth/i);
  });
});
