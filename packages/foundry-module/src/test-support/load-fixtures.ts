import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface WorldFixtures {
  /** True for the invented fixtures that are committed; absent in a capture from a real world. */
  synthetic?: boolean;
  exportedAt: string;
  foundry: { version: string; release?: number };
  system: { id: string; version: string };
  world: { id: string; title: string };
  conditions: string[];
  actors: Array<Record<string, any>>;
  items: Array<Record<string, any>>;
  effects: Array<Record<string, any>>;
  scene: Record<string, any> | null;
  chat: Array<Record<string, any>>;
  packs: Array<{
    collection: string;
    documentName: string;
    title: string;
    total: number;
    rows: Array<Record<string, any>>;
  }>;
}

export const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '__fixtures__');
/** Captures from real worlds live here. Git ignores it; they are never committed. */
export const LOCAL_FIXTURE_DIR = join(FIXTURE_DIR, 'local');

function newestIn(dir: string, systemId: string): string | undefined {
  if (!existsSync(dir)) return undefined;
  const files = readdirSync(dir)
    .filter(name => name.startsWith(`${systemId}-`) && name.endsWith('.json'))
    .sort();
  const newest = files[files.length - 1];
  return newest ? join(dir, newest) : undefined;
}

/**
 * Fixtures for a game system: a local capture if there is one, otherwise the committed synthetic
 * file. Undefined if neither exists.
 */
export function loadFixtures(systemId: string): WorldFixtures | undefined {
  const path = newestIn(LOCAL_FIXTURE_DIR, systemId) ?? newestIn(FIXTURE_DIR, systemId);
  return path ? (JSON.parse(readFileSync(path, 'utf8')) as WorldFixtures) : undefined;
}

/** Every fixture file that is committed (top level of the fixture folder). */
export function committedFixtureFiles(): string[] {
  if (!existsSync(FIXTURE_DIR)) return [];
  return readdirSync(FIXTURE_DIR)
    .filter(name => name.endsWith('.json'))
    .map(name => join(FIXTURE_DIR, name));
}
