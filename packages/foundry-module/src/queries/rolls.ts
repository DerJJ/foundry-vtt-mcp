import { validateFoundryState } from '../services/support.js';
import type { FoundryDataAccess } from '../data-access.js';
import { validateGMAccess } from './gm-access.js';
import type { QueryGroup, QueryHandler } from './query-registry.js';

export class RollQueries implements QueryGroup {
  constructor(private readonly dataAccess: FoundryDataAccess) {}

  routes(): Record<string, QueryHandler> {
    return {
      'request-player-rolls': this.handleRequestPlayerRolls.bind(this),
    };
  }

  /**
   * Handle request player rolls - creates interactive roll buttons in chat
   */
  async handleRequestPlayerRolls(data: {
    rollType: string;
    rollTarget: string;
    targetPlayer: string;
    isPublic: boolean;
    rollModifier: string;
    flavor: string;
  }): Promise<any> {
    try {
      // SECURITY: Silent GM validation
      const gmCheck = validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      validateFoundryState();

      if (!data.rollType || !data.rollTarget || !data.targetPlayer) {
        throw new Error('rollType, rollTarget, and targetPlayer are required');
      }

      return await this.dataAccess.rolls.requestPlayerRolls(data);
    } catch (error) {
      throw new Error(
        `Failed to request player rolls: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}
