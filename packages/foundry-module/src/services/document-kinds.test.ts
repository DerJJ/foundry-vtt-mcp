import { describe, expect, it } from 'vitest';
import { hasKindTable, kindsFor } from './document-kinds.js';

describe('kindsFor', () => {
  it('groups the dnd5e item types from the table', () => {
    const kinds = kindsFor('dnd5e', ['weapon', 'spell', 'feat', 'class', 'loot', 'mystery']);
    expect(kinds['inventory']).toEqual(['weapon', 'loot']);
    expect(kinds['spells']).toEqual(['spell']);
    expect(kinds['features']).toEqual(['feat', 'class']);
    expect(kinds['other']).toEqual(['mystery']);
  });

  it('puts both spell and spellcasting entry under spells on pf2e', () => {
    const kinds = kindsFor('pf2e', ['spell', 'spellcastingEntry', 'armor', 'effect', 'melee']);
    expect(kinds['spells']).toEqual(['spell', 'spellcastingEntry']);
    expect(kinds['inventory']).toEqual(['armor']);
    expect(kinds['effects']).toEqual(['effect']);
    expect(kinds['attacks']).toEqual(['melee']);
  });

  it('guesses from the type names for a system without a table', () => {
    const kinds = kindsFor('wfrp4e', ['trapping', 'talent', 'spell', 'career', 'weapon']);
    expect(kinds['spells']).toEqual(['spell']);
    expect(kinds['inventory']).toEqual(['trapping', 'weapon']);
    expect(kinds['features']).toEqual(['talent', 'career']);
    expect(hasKindTable('wfrp4e')).toBe(false);
    expect(hasKindTable('pf2e')).toBe(true);
  });
});
