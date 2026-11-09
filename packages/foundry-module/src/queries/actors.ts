import { validateFoundryState } from '../services/support.js';
import type { FoundryDataAccess } from '../data-access.js';
import { validateGMAccess } from './gm-access.js';
import type { QueryGroup, QueryHandler } from './query-registry.js';

export class ActorQueries implements QueryGroup {
  constructor(private readonly dataAccess: FoundryDataAccess) {}

  routes(): Record<string, QueryHandler> {
    return {
      createActorFromData: this.handleCreateActorFromData.bind(this),
      addActorItems: this.handleAddActorItems.bind(this),
      removeActorItems: this.handleRemoveActorItems.bind(this),
    };
  }

  // ===== PHASE 2: WRITE OPERATION HANDLERS =====

  private async handleCreateActorFromData(data: {
    actorData: Record<string, unknown>;
    addToScene?: boolean;
    updateExisting?: boolean;
    existingActorIdentifier?: string;
    preserveItemTypes?: string[];
    placement?: {
      type: 'random' | 'grid' | 'center' | 'coordinates';
      coordinates?: { x: number; y: number }[];
    };
  }): Promise<any> {
    try {
      // SECURITY: Silent GM validation
      const gmCheck = validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      validateFoundryState();

      if (!data?.actorData || typeof data.actorData !== 'object') {
        throw new Error('actorData object is required');
      }

      const requestData: {
        actorData: Record<string, unknown>;
        addToScene?: boolean;
        updateExisting?: boolean;
        existingActorIdentifier?: string;
        preserveItemTypes?: string[];
        placement?: {
          type: 'random' | 'grid' | 'center' | 'coordinates';
          coordinates?: { x: number; y: number }[];
        };
      } = {
        actorData: data.actorData,
        addToScene: data.addToScene ?? false,
        updateExisting: data.updateExisting ?? false,
      };
      if (data.existingActorIdentifier) {
        requestData.existingActorIdentifier = data.existingActorIdentifier;
      }
      if (data.preserveItemTypes?.length) {
        requestData.preserveItemTypes = data.preserveItemTypes;
      }
      if (data.placement) {
        requestData.placement = data.placement;
      }

      return await this.dataAccess.actors.createActorFromData(requestData);
    } catch (error) {
      throw new Error(
        `Failed to create actor from data: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private async handleAddActorItems(data: {
    actorIdentifier: string;
    items: Array<{
      name: string;
      type: string;
      img?: string;
      system?: Record<string, any>;
    }>;
  }): Promise<any> {
    try {
      // SECURITY: Silent GM validation - writes to actor sheets are GM-only
      const gmCheck = validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      validateFoundryState();

      if (!data?.actorIdentifier) {
        throw new Error('actorIdentifier is required');
      }
      if (!Array.isArray(data?.items) || data.items.length === 0) {
        throw new Error('items array is required and must contain at least one entry');
      }

      return await this.dataAccess.actors.addActorItems({
        actorIdentifier: data.actorIdentifier,
        items: data.items,
      });
    } catch (error) {
      throw new Error(
        `Failed to add actor items: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private async handleRemoveActorItems(data: {
    actorIdentifier: string;
    itemIds?: string[];
    itemNames?: string[];
    type?: string;
  }): Promise<any> {
    try {
      // SECURITY: Silent GM validation - writes to actor sheets are GM-only
      const gmCheck = validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      validateFoundryState();

      if (!data?.actorIdentifier) {
        throw new Error('actorIdentifier is required');
      }
      const hasIds = Array.isArray(data?.itemIds) && data.itemIds.length > 0;
      const hasNames = Array.isArray(data?.itemNames) && data.itemNames.length > 0;
      if (!hasIds && !hasNames) {
        throw new Error('Provide itemIds and/or itemNames identifying the items to remove');
      }

      return await this.dataAccess.actors.removeActorItems({
        actorIdentifier: data.actorIdentifier,
        ...(data.itemIds !== undefined ? { itemIds: data.itemIds } : {}),
        ...(data.itemNames !== undefined ? { itemNames: data.itemNames } : {}),
        ...(data.type !== undefined ? { type: data.type } : {}),
      });
    } catch (error) {
      throw new Error(
        `Failed to remove actor items: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  // ─── Generic actor CRUD ─────────────────────────────────────────────────────
}
