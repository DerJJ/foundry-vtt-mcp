import type { CosmereRpgCreatureIndex } from '../../services/types.js';

/**
 * Cosmere RPG criteria filter — tier, role, creatureType, size,
 * hasInvestiture, hitPoints range, defenses minimums, deflect minimum.
 */
export function passesCosmereRpgCriteria(
  creature: CosmereRpgCreatureIndex,
  criteria: {
    tier?: number | { min?: number; max?: number };
    role?: string;
    creatureType?: string;
    size?: string;
    hasInvestiture?: boolean;
    hitPoints?: number | { min?: number; max?: number };
    health?: number | { min?: number; max?: number };
    defensesMin?: { phy?: number; cog?: number; spi?: number };
    deflectMin?: number;
  }
): boolean {
  if (criteria.tier !== undefined) {
    if (typeof criteria.tier === 'number') {
      if (creature.tier !== criteria.tier) return false;
    } else {
      const { min, max } = criteria.tier;
      if (min !== undefined && creature.tier < min) return false;
      if (max !== undefined && creature.tier > max) return false;
    }
  }

  if (criteria.role && creature.role.toLowerCase() !== criteria.role.toLowerCase()) {
    return false;
  }

  if (
    criteria.creatureType &&
    creature.creatureType.toLowerCase() !== criteria.creatureType.toLowerCase()
  ) {
    return false;
  }

  if (criteria.size && creature.size.toLowerCase() !== criteria.size.toLowerCase()) {
    return false;
  }

  if (
    criteria.hasInvestiture !== undefined &&
    creature.hasInvestiture !== criteria.hasInvestiture
  ) {
    return false;
  }

  // Accept either `hitPoints` or `health` from callers — they're synonyms
  // here (hitPoints is the cross-system convention; health is the cosmere-
  // native term).
  const hpRange = criteria.hitPoints ?? criteria.health;
  if (hpRange !== undefined) {
    if (typeof hpRange === 'number') {
      if (creature.hitPoints !== hpRange) return false;
    } else {
      const { min, max } = hpRange;
      if (min !== undefined && creature.hitPoints < min) return false;
      if (max !== undefined && creature.hitPoints > max) return false;
    }
  }

  if (criteria.defensesMin) {
    const { phy, cog, spi } = criteria.defensesMin;
    if (phy !== undefined && creature.defensePhysical < phy) return false;
    if (cog !== undefined && creature.defenseCognitive < cog) return false;
    if (spi !== undefined && creature.defenseSpiritual < spi) return false;
  }

  if (criteria.deflectMin !== undefined && creature.deflect < criteria.deflectMin) {
    return false;
  }

  return true;
}
