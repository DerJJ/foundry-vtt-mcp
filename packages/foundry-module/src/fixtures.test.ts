import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { committedFixtureFiles, loadFixtures } from './test-support/load-fixtures.js';
import { sanitizeData } from './services/support.js';

// Nothing real may be committed: worlds hold campaign content, player data and copyrighted text.
describe('committed fixtures', () => {
  it('are all synthetic', () => {
    const files = committedFixtureFiles();
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      expect(JSON.parse(readFileSync(file, 'utf8')).synthetic, file).toBe(true);
    }
  });
});

// These run against the local capture of a world if there is one, else the synthetic fixture
// (see __fixtures__/README.md).
for (const systemId of ['pf2e', 'dnd5e']) {
  const fixtures = loadFixtures(systemId);

  describe.skipIf(!fixtures)(`${systemId} fixture world`, () => {
    afterEach(() => vi.unstubAllGlobals());

    it('was exported from the system it is named after', () => {
      expect(fixtures!.system.id).toBe(systemId);
    });

    it('has actors, and every actor survives sanitising as plain JSON', () => {
      vi.stubGlobal('game', { system: { id: systemId } });
      expect(fixtures!.actors.length).toBeGreaterThan(0);
      for (const actor of fixtures!.actors) {
        const clean = sanitizeData(actor);
        expect(clean._id).toBe(actor._id);
        expect(clean).toEqual(JSON.parse(JSON.stringify(clean)));
        expect(clean._stats).toBeUndefined();
        expect(clean.parent).toBeUndefined();
      }
    });

    it('keeps no credentials in anything it exports', () => {
      vi.stubGlobal('game', { system: { id: systemId } });
      for (const doc of [...fixtures!.actors, ...fixtures!.items, ...fixtures!.chat]) {
        const text = JSON.stringify(sanitizeData(doc));
        expect(text).not.toMatch(/"(password|secret|credential|cookie)"\s*:/);
      }
    });
  });
}
