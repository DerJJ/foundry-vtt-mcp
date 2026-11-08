/**
 * The server and the bridge module are separate packages joined only by query names (strings).
 * A name the server sends that the bridge does not register fails at runtime, in a live world.
 * This test reads the server sources and the bridge's published query list; it names no tool,
 * so it keeps holding when tools are regrouped. When the bridge's query list is regenerated,
 * this test shows which server calls now point nowhere.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const serverSrc = join(here, '..');
const bridgeQueries: string[] = JSON.parse(
  readFileSync(join(here, '../../../foundry-module/src/__golden__/query-names.json'), 'utf8')
);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(entry => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return entry === '__golden__' ? [] : sourceFiles(path);
    return /\.ts$/.test(entry) && !/\.test\.ts$/.test(entry) ? [path] : [];
  });
}

const referenced = new Map<string, string[]>();
for (const file of sourceFiles(serverSrc)) {
  const text = readFileSync(file, 'utf8');
  for (const match of text.matchAll(/['"`](foundry-mcp-bridge\.[A-Za-z0-9_-]+)['"`]/g)) {
    const name = match[1];
    referenced.set(name, [...(referenced.get(name) ?? []), file.replace(serverSrc, 'src')]);
  }
}

describe('server → bridge query names', () => {
  it('finds the query names the server sends', () => {
    expect(referenced.size).toBeGreaterThan(20);
  });

  it('only sends queries the bridge registers', () => {
    const registered = new Set(bridgeQueries);
    const dangling = [...referenced]
      .filter(([name]) => !registered.has(name))
      .map(([name, files]) => `${name} (in ${[...new Set(files)].join(', ')})`);
    expect(dangling).toEqual([]);
  });
});
