import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface WorldFixtures {
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

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '__fixtures__');

/** Newest fixture file captured for a game system, or undefined if there is none. */
export function loadFixtures(systemId: string): WorldFixtures | undefined {
  if (!existsSync(FIXTURE_DIR)) return undefined;
  const files = readdirSync(FIXTURE_DIR)
    .filter(name => name.startsWith(`${systemId}-`) && name.endsWith('.json'))
    .sort();
  const newest = files[files.length - 1];
  if (!newest) return undefined;
  return JSON.parse(readFileSync(join(FIXTURE_DIR, newest), 'utf8')) as WorldFixtures;
}
