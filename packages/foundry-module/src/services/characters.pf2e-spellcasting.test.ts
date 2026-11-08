/**
 * PF2e spellcasting entries must report the spell save DC and spell attack the sheet shows.
 * Current PF2e computes them on the entry's Statistic; they are not in `system.spelldc`.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CharacterService } from './characters.js';

function makeActor(entries: any[]) {
  return {
    items: Object.assign([], { filter: () => [] }),
    spellcasting: { contents: entries },
  } as any;
}

function extract(entries: any[]) {
  const da = new CharacterService() as any;
  return da.extractSpellcastingData(makeActor(entries));
}

describe('PF2e spellcasting DC and attack', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.stubGlobal('game', { system: { id: 'pf2e' } });
  });

  it('reads DC and attack from the entry statistic', () => {
    const [entry] = extract([
      {
        id: 'e1',
        name: 'Primal Prepared Spells',
        system: { tradition: { value: 'primal' }, prepared: { value: 'prepared' }, slots: {} },
        statistic: { dc: { value: 28 }, check: { mod: 20 } },
      },
    ]);

    expect(entry.dc).toBe(28);
    expect(entry.attack).toBe(20);
    expect(entry.tradition).toBe('primal');
  });

  it('keeps a spell attack modifier of 0', () => {
    const [entry] = extract([
      {
        id: 'e1',
        name: 'Innate Spells',
        system: { tradition: { value: 'occult' }, prepared: { value: 'innate' }, slots: {} },
        statistic: { dc: { value: 10 }, check: { mod: 0 } },
      },
    ]);

    expect(entry.attack).toBe(0);
  });

  it('falls back to system.spelldc on older PF2e data', () => {
    const [entry] = extract([
      {
        id: 'e1',
        name: 'Arcane Spells',
        system: {
          tradition: { value: 'arcane' },
          prepared: { value: 'prepared' },
          spelldc: { dc: 24, value: 14 },
          slots: {},
        },
      },
    ]);

    expect(entry.dc).toBe(24);
    expect(entry.attack).toBe(14);
  });
});

describe('D&D 5e spellcasting DC and attack', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.stubGlobal('game', { system: { id: 'dnd5e' } });
  });

  it('reports the actor-level spell save DC and attack on the class entry', () => {
    const da = new CharacterService() as any;
    const wizard = {
      id: 'c1',
      name: 'Wizard',
      type: 'class',
      system: { spellcasting: { progression: 'full', type: 'prepared', ability: 'int' } },
    };
    const actor = {
      items: Object.assign([wizard], {
        filter(fn: (i: any) => boolean) {
          return Array.prototype.filter.call(this, fn);
        },
      }),
      system: { spells: {}, attributes: { spell: { dc: 15, attack: 7 } } },
    } as any;

    const [entry] = da.extractSpellcastingData(actor);

    expect(entry.dc).toBe(15);
    expect(entry.attack).toBe(7);
  });
});
