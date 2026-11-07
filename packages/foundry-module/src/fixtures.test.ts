import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadFixtures } from './test-support/load-fixtures.js';
import { sanitizeData } from './services/support.js';

// These run against whatever worlds were captured in __fixtures__/ (see its README) and are
// skipped for systems without a capture.
for (const systemId of ['pf2e', 'dnd5e']) {
  const fixtures = loadFixtures(systemId);

  describe.skipIf(!fixtures)(`real ${systemId} world`, () => {
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
