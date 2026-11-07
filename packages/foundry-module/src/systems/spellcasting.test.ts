import { describe, expect, it } from 'vitest';
import {
  extractPF2eSpellSlots,
  extractPF2eSpellTargeting,
  formatPF2eActionCost,
} from './pf2e/spellcasting.js';
import { extractDSA5SpellTargeting } from './dsa5/spellcasting.js';
import { extractDnD5eSpellSlots, extractDnD5eSpellTargeting } from './dnd5e/spellcasting.js';

describe('pf2e spellcasting', () => {
  it('formats action costs', () => {
    expect(formatPF2eActionCost(undefined)).toBeUndefined();
    expect(formatPF2eActionCost(0)).toBeUndefined();
    expect(formatPF2eActionCost(1)).toBe('1 action');
    expect(formatPF2eActionCost(3)).toBe('3 actions');
    expect(formatPF2eActionCost('reaction')).toBe('reaction');
    expect(formatPF2eActionCost('free')).toBe('free action');
    expect(formatPF2eActionCost('2 to 3')).toBe('2 to 3');
  });

  it('reads slots per rank and skips empty ones', () => {
    const slots = extractPF2eSpellSlots({
      slots: { slot1: { value: 2, max: 3 }, slot2: { value: 0, max: 0 }, slot3: { max: 1 } },
    });
    expect(slots).toEqual({
      rank1: { value: 2, max: 3 },
      rank3: { value: 0, max: 1 },
    });
  });

  it('reads slots stored directly on the entry', () => {
    expect(extractPF2eSpellSlots({ slot10: { value: 1, max: 1 } })).toEqual({
      rank10: { value: 1, max: 1 },
    });
  });

  it('returns undefined when there are no slots', () => {
    expect(extractPF2eSpellSlots({})).toBeUndefined();
    expect(extractPF2eSpellSlots(undefined)).toBeUndefined();
  });

  it('extracts range, target and area', () => {
    expect(
      extractPF2eSpellTargeting({
        range: { value: '30 feet' },
        target: { value: '1 creature' },
      })
    ).toEqual({ range: '30 feet', target: '1 creature' });
  });

  it('treats an area spell without target as targeting the area', () => {
    expect(extractPF2eSpellTargeting({ area: { type: 'cone', value: 30 } })).toEqual({
      area: '30-foot cone',
      target: 'area',
    });
    expect(extractPF2eSpellTargeting({ area: { type: 'burst' } })).toEqual({
      area: 'burst',
      target: 'area',
    });
  });

  it('keeps an explicit target when the spell also has an area', () => {
    expect(
      extractPF2eSpellTargeting({ target: { value: 'enemies' }, area: { type: 'burst', value: 5 } })
    ).toEqual({ target: 'enemies', area: '5-foot burst' });
  });

  it('returns an empty result for no data', () => {
    expect(extractPF2eSpellTargeting(undefined)).toEqual({});
  });
});

describe('dsa5 spellcasting', () => {
  it('reads english and german field names', () => {
    expect(
      extractDSA5SpellTargeting({
        range: { value: '8 Schritt' },
        targetCategory: { value: 'Kulturschaffende' },
        effectRadius: { value: '4 Schritt' },
      })
    ).toEqual({ range: '8 Schritt', target: 'Kulturschaffende', area: '4 Schritt' });

    expect(
      extractDSA5SpellTargeting({
        Reichweite: 'Berührung',
        Zielkategorie: 'Tiere',
        Wirkungsbereich: 'Zone',
      })
    ).toEqual({ range: 'Berührung', target: 'Tiere', area: 'Zone' });
  });

  it('returns an empty result for no data', () => {
    expect(extractDSA5SpellTargeting({})).toEqual({});
  });
});

describe('dnd5e spellcasting', () => {
  it('reads slot levels and pact slots', () => {
    expect(
      extractDnD5eSpellSlots({
        spell1: { value: 4, max: 4 },
        spell2: { value: 0, max: 0 },
        spell9: { value: 1 },
        pact: { value: 1, max: 2 },
      })
    ).toEqual({
      level1: { value: 4, max: 4 },
      level9: { value: 1, max: 0 },
      pact: { value: 1, max: 2 },
    });
  });

  it('returns undefined when the actor has no slots', () => {
    expect(extractDnD5eSpellSlots({ pact: { value: 0, max: 0 } })).toBeUndefined();
    expect(extractDnD5eSpellSlots(undefined)).toBeUndefined();
  });

  describe('range', () => {
    it.each([
      [{ range: { units: 'self' } }, 'Self'],
      [{ range: { units: 'touch' } }, 'Touch'],
      [{ range: { units: 'spec', special: 'Sight' } }, 'Sight'],
      [{ range: { units: 'spec' } }, 'Special'],
      [{ range: { value: 60, units: 'ft' } }, '60 ft'],
    ])('%j -> %s', (system, expected) => {
      expect(extractDnD5eSpellTargeting(system).range).toBe(expected);
    });

    it('omits a range with a value but no units', () => {
      expect(extractDnD5eSpellTargeting({ range: { value: 60 } }).range).toBeUndefined();
    });
  });

  describe('target', () => {
    it.each([
      [{ target: { type: 'self' } }, 'self'],
      [{ target: { type: 'creature' } }, 'creature'],
      [{ target: { type: 'creature', value: 1 } }, '1 creature'],
      [{ target: { type: 'enemy', value: 3 } }, '3 enemys'],
      [{ target: { type: 'object' } }, 'object'],
      [{ target: { type: 'object', value: 2 } }, '2 objects'],
      [{ target: { type: 'space' } }, 'point'],
      [{ target: { type: 'point' } }, 'point'],
      [{ target: { type: 'wall' } }, 'wall'],
    ])('%j -> %s', (system, expected) => {
      expect(extractDnD5eSpellTargeting(system).target).toBe(expected);
    });
  });

  it('describes an area and turns a point into an area target', () => {
    expect(
      extractDnD5eSpellTargeting({
        target: { type: 'point', template: { type: 'sphere', size: 20, units: 'ft' } },
      })
    ).toEqual({ target: 'area', area: '20-ft sphere' });
  });

  it('defaults area units to ft and keeps a creature target', () => {
    expect(
      extractDnD5eSpellTargeting({
        target: { type: 'creature', value: 2, template: { type: 'cone', size: 15 } },
      })
    ).toEqual({ target: '2 creatures', area: '15-ft cone' });
  });

  it('returns an empty result for no data', () => {
    expect(extractDnD5eSpellTargeting({})).toEqual({});
  });
});
