import type { MGT2eCreatureIndex } from '../../services/types.js';

/**
 * MGT2e criteria filter — minHits/maxHits, hasPsionics, creatureType, actorType.
 */
export function passesMGT2eCriteria(creature: MGT2eCreatureIndex, criteria: any): boolean {
  if (criteria.minHits !== undefined && creature.hits < criteria.minHits) return false;
  if (criteria.maxHits !== undefined && creature.hits > criteria.maxHits) return false;
  if (criteria.hasPsionics !== undefined && creature.hasPsionics !== criteria.hasPsionics)
    return false;
  if (criteria.creatureType && creature.creatureType !== criteria.creatureType) return false;
  if (criteria.actorType && creature.type !== criteria.actorType) return false;
  return true;
}
