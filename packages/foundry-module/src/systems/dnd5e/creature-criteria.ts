import type { DnD5eCreatureIndex } from '../../services/types.js';

// dnd5e stores short size keys (sm/med/lg/grg); normalize both sides for filtering
const DND5E_SIZE: Record<string, string> = {
  tiny: 'tiny',
  sm: 'small',
  small: 'small',
  med: 'medium',
  medium: 'medium',
  lg: 'large',
  large: 'large',
  huge: 'huge',
  grg: 'gargantuan',
  gargantuan: 'gargantuan',
};

/**
 * Check if D&D 5e creature passes all specified criteria
 */
export function passesDnD5eCriteria(
  creature: DnD5eCreatureIndex,
  criteria: {
    challengeRating?: number | { min?: number; max?: number };
    creatureType?: string;
    size?: string;
    hasSpells?: boolean;
    hasLegendaryActions?: boolean;
  }
): boolean {
  // Challenge Rating filter
  if (criteria.challengeRating !== undefined) {
    if (typeof criteria.challengeRating === 'number') {
      if (creature.challengeRating !== criteria.challengeRating) {
        return false;
      }
    } else if (typeof criteria.challengeRating === 'object') {
      const { min, max } = criteria.challengeRating;
      if (min !== undefined && creature.challengeRating < min) {
        return false;
      }
      if (max !== undefined && creature.challengeRating > max) {
        return false;
      }
    }
  }

  // Creature Type filter
  if (criteria.creatureType) {
    if (creature.creatureType.toLowerCase() !== criteria.creatureType.toLowerCase()) {
      return false;
    }
  }

  // Size filter
  if (criteria.size) {
    if (
      DND5E_SIZE[creature.size.toLowerCase()] !==
      (DND5E_SIZE[criteria.size.toLowerCase()] ?? criteria.size.toLowerCase())
    ) {
      return false;
    }
  }

  // Spellcaster filter
  if (criteria.hasSpells !== undefined) {
    if (creature.hasSpells !== criteria.hasSpells) {
      return false;
    }
  }

  // Legendary Actions filter
  if (criteria.hasLegendaryActions !== undefined) {
    if (creature.hasLegendaryActions !== criteria.hasLegendaryActions) {
      return false;
    }
  }

  return true;
}
