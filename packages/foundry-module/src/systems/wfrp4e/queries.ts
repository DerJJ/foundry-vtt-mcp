import { validateFoundryState } from '../../services/support.js';
import type { FoundryDataAccess } from '../../data-access.js';
import { validateGMAccess } from '../../queries/gm-access.js';
import type { QueryGroup, QueryHandler } from '../../queries/query-registry.js';

export class Wfrp4eQueries implements QueryGroup {
  constructor(private readonly dataAccess: FoundryDataAccess) {}

  routes(): Record<string, QueryHandler> {
    return {
      updateWfrp4eActor: this.handleUpdateWfrp4eActor.bind(this),
      addWfrp4eItems: this.handleAddWfrp4eItems.bind(this),
    };
  }

  /**
   * Handle WFRP4e actor stat-block update request
   */
  async handleUpdateWfrp4eActor(data: any): Promise<any> {
    try {
      // SECURITY: Silent GM validation
      const gmCheck = validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      validateFoundryState();

      if (!data.actor) {
        throw new Error('actor (name or id) is required');
      }

      return await this.dataAccess.wfrp4e.updateWfrp4eActor(data);
    } catch (error) {
      throw new Error(
        `Failed to update WFRP4e actor: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Add items (skills, talents, careers, trappings, …) to a WFRP4e actor,
   * resolved from the installed compendiums. GM-only.
   */
  async handleAddWfrp4eItems(data: any): Promise<any> {
    try {
      // SECURITY: Silent GM validation
      const gmCheck = validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      validateFoundryState();

      if (!data.actor) {
        throw new Error('actor (name or id) is required');
      }
      if (!Array.isArray(data.items) || data.items.length === 0) {
        throw new Error('items array is required and must contain at least one entry');
      }

      return await this.dataAccess.wfrp4e.addWfrp4eItems(data);
    } catch (error) {
      throw new Error(
        `Failed to add WFRP4e items: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}
