import {
  applyDamage,
  combatControl,
  creatureCard,
  gmRoll,
  partyStatus,
  postChat,
  rollTable,
  sceneView,
} from '../services/table-actions.js';
import type { QueryGroup, QueryHandler } from './query-registry.js';

/** Running the table: combat, damage, party status, hidden rolls, tables, chat, scene view. */
export class TableQueries implements QueryGroup {
  routes(): Record<string, QueryHandler> {
    return {
      combatControl,
      applyDamage,
      partyStatus,
      gmRoll,
      rollTable,
      postChat,
      sceneView,
      creatureCard,
    };
  }
}
