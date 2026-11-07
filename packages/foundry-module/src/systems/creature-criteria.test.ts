import { describe, expect, it } from 'vitest';
import { passesPF2eCriteria } from './pf2e/creature-criteria.js';
import { passesDnD5eCriteria } from './dnd5e/creature-criteria.js';
import { passesMGT2eCriteria } from './mgt2e/creature-criteria.js';
import { passesCosmereRpgCriteria } from './cosmere-rpg/creature-criteria.js';

describe('pf2e criteria', () => {
  const goblin: any = {
    level: 1,
    traits: ['Goblin', 'Humanoid'],
    rarity: 'common',
    creatureType: 'Humanoid',
    size: 'Small',
    hasSpells: false,
  };

  it('accepts everything without criteria', () => {
    expect(passesPF2eCriteria(goblin, {})).toBe(true);
  });

  it('matches an exact level and a level range', () => {
    expect(passesPF2eCriteria(goblin, { level: 1 })).toBe(true);
    expect(passesPF2eCriteria(goblin, { level: 2 })).toBe(false);
    expect(passesPF2eCriteria(goblin, { level: { min: 0, max: 3 } })).toBe(true);
    expect(passesPF2eCriteria(goblin, { level: { min: 2 } })).toBe(false);
    expect(passesPF2eCriteria(goblin, { level: { max: 0 } })).toBe(false);
    expect(passesPF2eCriteria({ ...goblin, level: -1 }, { level: {} })).toBe(true);
  });

  it('requires all traits, ignoring case', () => {
    expect(passesPF2eCriteria(goblin, { traits: ['goblin', 'HUMANOID'] })).toBe(true);
    expect(passesPF2eCriteria(goblin, { traits: ['goblin', 'undead'] })).toBe(false);
    expect(passesPF2eCriteria(goblin, { traits: [] })).toBe(true);
  });

  it('filters rarity, type, size and spellcasting', () => {
    expect(passesPF2eCriteria(goblin, { rarity: 'rare' })).toBe(false);
    expect(passesPF2eCriteria(goblin, { creatureType: 'humanoid' })).toBe(true);
    expect(passesPF2eCriteria(goblin, { creatureType: 'beast' })).toBe(false);
    expect(passesPF2eCriteria(goblin, { size: 'small' })).toBe(true);
    expect(passesPF2eCriteria(goblin, { size: 'large' })).toBe(false);
    expect(passesPF2eCriteria(goblin, { hasSpells: false })).toBe(true);
    expect(passesPF2eCriteria(goblin, { hasSpells: true })).toBe(false);
  });
});

describe('dnd5e criteria', () => {
  const wolf: any = {
    challengeRating: 0.25,
    creatureType: 'Beast',
    size: 'med',
    hasSpells: false,
    hasLegendaryActions: false,
  };

  it('matches an exact challenge rating and a range', () => {
    expect(passesDnD5eCriteria(wolf, { challengeRating: 0.25 })).toBe(true);
    expect(passesDnD5eCriteria(wolf, { challengeRating: 1 })).toBe(false);
    expect(passesDnD5eCriteria(wolf, { challengeRating: { min: 0, max: 1 } })).toBe(true);
    expect(passesDnD5eCriteria(wolf, { challengeRating: { min: 1 } })).toBe(false);
    expect(passesDnD5eCriteria(wolf, { challengeRating: { max: 0.1 } })).toBe(false);
  });

  it('compares size across short and long names', () => {
    expect(passesDnD5eCriteria(wolf, { size: 'Medium' })).toBe(true);
    expect(passesDnD5eCriteria(wolf, { size: 'med' })).toBe(true);
    expect(passesDnD5eCriteria(wolf, { size: 'large' })).toBe(false);
    expect(passesDnD5eCriteria({ ...wolf, size: 'grg' }, { size: 'gargantuan' })).toBe(true);
  });

  it('filters type, spells and legendary actions', () => {
    expect(passesDnD5eCriteria(wolf, { creatureType: 'beast' })).toBe(true);
    expect(passesDnD5eCriteria(wolf, { creatureType: 'fiend' })).toBe(false);
    expect(passesDnD5eCriteria(wolf, { hasSpells: true })).toBe(false);
    expect(passesDnD5eCriteria(wolf, { hasLegendaryActions: false })).toBe(true);
    expect(passesDnD5eCriteria(wolf, { hasLegendaryActions: true })).toBe(false);
  });
});

describe('mgt2e criteria', () => {
  const scout: any = { hits: 12, hasPsionics: false, creatureType: 'Human', type: 'npc' };

  it('filters hit range, psionics, creature type and actor type', () => {
    expect(passesMGT2eCriteria(scout, {})).toBe(true);
    expect(passesMGT2eCriteria(scout, { minHits: 10, maxHits: 12 })).toBe(true);
    expect(passesMGT2eCriteria(scout, { minHits: 13 })).toBe(false);
    expect(passesMGT2eCriteria(scout, { maxHits: 11 })).toBe(false);
    expect(passesMGT2eCriteria(scout, { hasPsionics: true })).toBe(false);
    expect(passesMGT2eCriteria(scout, { creatureType: 'Human' })).toBe(true);
    expect(passesMGT2eCriteria(scout, { creatureType: 'Alien' })).toBe(false);
    expect(passesMGT2eCriteria(scout, { actorType: 'creature' })).toBe(false);
  });
});

describe('cosmere-rpg criteria', () => {
  const chull: any = {
    tier: 1,
    role: 'Minion',
    creatureType: 'Animal',
    size: 'Large',
    hasInvestiture: false,
    hitPoints: 30,
    defensePhysical: 12,
    defenseCognitive: 10,
    defenseSpiritual: 8,
    deflect: 1,
  };

  it('matches tier exactly and by range', () => {
    expect(passesCosmereRpgCriteria(chull, { tier: 1 })).toBe(true);
    expect(passesCosmereRpgCriteria(chull, { tier: 2 })).toBe(false);
    expect(passesCosmereRpgCriteria(chull, { tier: { min: 1, max: 2 } })).toBe(true);
    expect(passesCosmereRpgCriteria(chull, { tier: { min: 2 } })).toBe(false);
    expect(passesCosmereRpgCriteria(chull, { tier: { max: 0 } })).toBe(false);
  });

  it('filters role, type, size and investiture ignoring case', () => {
    expect(passesCosmereRpgCriteria(chull, { role: 'minion' })).toBe(true);
    expect(passesCosmereRpgCriteria(chull, { role: 'boss' })).toBe(false);
    expect(passesCosmereRpgCriteria(chull, { creatureType: 'animal' })).toBe(true);
    expect(passesCosmereRpgCriteria(chull, { creatureType: 'spren' })).toBe(false);
    expect(passesCosmereRpgCriteria(chull, { size: 'large' })).toBe(true);
    expect(passesCosmereRpgCriteria(chull, { size: 'small' })).toBe(false);
    expect(passesCosmereRpgCriteria(chull, { hasInvestiture: true })).toBe(false);
  });

  it('accepts hitPoints or its synonym health, as number or range', () => {
    expect(passesCosmereRpgCriteria(chull, { hitPoints: 30 })).toBe(true);
    expect(passesCosmereRpgCriteria(chull, { health: 31 })).toBe(false);
    expect(passesCosmereRpgCriteria(chull, { hitPoints: { min: 20, max: 40 } })).toBe(true);
    expect(passesCosmereRpgCriteria(chull, { health: { min: 31 } })).toBe(false);
    expect(passesCosmereRpgCriteria(chull, { hitPoints: { max: 29 } })).toBe(false);
  });

  it('checks minimum defenses and deflect', () => {
    expect(passesCosmereRpgCriteria(chull, { defensesMin: { phy: 12, cog: 10, spi: 8 } })).toBe(
      true
    );
    expect(passesCosmereRpgCriteria(chull, { defensesMin: { phy: 13 } })).toBe(false);
    expect(passesCosmereRpgCriteria(chull, { defensesMin: { cog: 11 } })).toBe(false);
    expect(passesCosmereRpgCriteria(chull, { defensesMin: { spi: 9 } })).toBe(false);
    expect(passesCosmereRpgCriteria(chull, { deflectMin: 1 })).toBe(true);
    expect(passesCosmereRpgCriteria(chull, { deflectMin: 2 })).toBe(false);
  });
});
