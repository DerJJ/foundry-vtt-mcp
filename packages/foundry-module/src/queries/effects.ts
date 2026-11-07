import { validateFoundryState } from '../services/support.js';
import type { FoundryDataAccess } from '../data-access.js';
import { validateGMAccess } from './gm-access.js';
import type { QueryGroup, QueryHandler } from './query-registry.js';

export class EffectQueries implements QueryGroup {
  constructor(private readonly dataAccess: FoundryDataAccess) {}

  routes(): Record<string, QueryHandler> {
    return {
      manageEffects: this.handleManageEffects.bind(this),
    };
  }

  private async handleManageEffects(data: {
    action: 'create' | 'update' | 'delete';
    actorIdentifier: string;
    parentType: 'actor' | 'item';
    parentItemIdentifier?: string;
    effectId?: string;
    effectData?: Record<string, any>;
  }): Promise<any> {
    const gmCheck = validateGMAccess();
    if (!gmCheck.allowed) return { error: 'Access denied', success: false };
    validateFoundryState();
    return this.dataAccess.effects.manageEffects(data);
  }
}
