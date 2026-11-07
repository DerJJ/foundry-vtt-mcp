import type { PF2eCreatureIndex } from '../../services/types.js';

/**
 * Check if PF2e creature passes all specified criteria
 */
export function passesPF2eCriteria(
  creature: PF2eCreatureIndex,
  criteria: {
    level?: number | { min?: number; max?: number };
    traits?: string[];
    rarity?: string;
    creatureType?: string;
    size?: string;
    hasSpells?: boolean;
  }
): boolean {
  // Level filter
  if (criteria.level !== undefined) {
    if (typeof criteria.level === 'number') {
      if (creature.level !== criteria.level) {
        return false;
      }
    } else if (typeof criteria.level === 'object') {
      const { min = -1, max = 25 } = criteria.level;
      if (creature.level < min || creature.level > max) {
        return false;
      }
    }
  }

  // Traits filter (creature must have ALL specified traits)
  if (criteria.traits && criteria.traits.length > 0) {
    const hasAllTraits = criteria.traits.every(requiredTrait =>
      creature.traits.some(t => t.toLowerCase() === requiredTrait.toLowerCase())
    );
    if (!hasAllTraits) {
      return false;
    }
  }

  // Rarity filter
  if (criteria.rarity && creature.rarity !== criteria.rarity) {
    return false;
  }

  // Creature type filter
  if (
    criteria.creatureType &&
    creature.creatureType.toLowerCase() !== criteria.creatureType.toLowerCase()
  ) {
    return false;
  }

  // Size filter
  if (criteria.size && creature.size.toLowerCase() !== criteria.size.toLowerCase()) {
    return false;
  }

  // Spellcasting filter
  if (criteria.hasSpells !== undefined && creature.hasSpells !== criteria.hasSpells) {
    return false;
  }

  return true;
}
