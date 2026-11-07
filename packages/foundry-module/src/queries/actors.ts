import { validateFoundryState } from '../services/support.js';
import type { FoundryDataAccess } from '../data-access.js';
import { validateGMAccess } from './gm-access.js';
import type { QueryGroup, QueryHandler } from './query-registry.js';

export class ActorQueries implements QueryGroup {
  constructor(private readonly dataAccess: FoundryDataAccess) {}

  routes(): Record<string, QueryHandler> {
    return {
      createActorFromCompendium: this.handleCreateActorFromCompendium.bind(this),
      createActorFromData: this.handleCreateActorFromData.bind(this),
      addActorItems: this.handleAddActorItems.bind(this),
      removeActorItems: this.handleRemoveActorItems.bind(this),
      createActors: this.handleCreateActors.bind(this),
      updateActors: this.handleUpdateActors.bind(this),
      deleteActors: this.handleDeleteActors.bind(this),
      updateActorItems: this.handleUpdateActorItems.bind(this),
      deleteActorItems: this.handleDeleteActorItems.bind(this),
    };
  }

  // ===== PHASE 2: WRITE OPERATION HANDLERS =====

  /**
   * Handle actor creation from specific compendium entry
   */
  private async handleCreateActorFromCompendium(data: {
    packId: string;
    itemId: string;
    customNames?: string[] | undefined;
    quantity?: number | undefined;
    addToScene?: boolean | undefined;
    placement?:
      | {
          type: 'random' | 'grid' | 'center' | 'coordinates';
          coordinates?: { x: number; y: number }[];
        }
      | undefined;
  }): Promise<any> {
    try {
      // SECURITY: Silent GM validation
      const gmCheck = validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      validateFoundryState();

      // Clean interface - direct pack/item reference only
      const requestData: any = {
        packId: data.packId,
        itemId: data.itemId,
        customNames: data.customNames || [],
        quantity: data.quantity || 1,
        addToScene: data.addToScene || false,
      };

      if (data.placement) {
        requestData.placement = data.placement;
      }

      return await this.dataAccess.actors.createActorFromCompendiumEntry(requestData);
    } catch (error) {
      throw new Error(
        `Failed to create actor from compendium: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

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

  private async handleCreateActors(data: {
    actors: Array<{
      name: string;
      type: string;
      img?: string;
      system?: Record<string, any>;
    }>;
    folder?: string;
  }): Promise<any> {
    const gmCheck = validateGMAccess();
    if (!gmCheck.allowed) return { error: 'Access denied', success: false };
    validateFoundryState();
    if (!Array.isArray(data?.actors) || data.actors.length === 0) {
      throw new Error('actors array is required and must contain at least one entry');
    }
    return this.dataAccess.actors.createActors(data);
  }

  private async handleUpdateActors(data: {
    updates: Array<{
      id: string;
      name?: string;
      img?: string;
      system?: Record<string, any>;
    }>;
  }): Promise<any> {
    const gmCheck = validateGMAccess();
    if (!gmCheck.allowed) return { error: 'Access denied', success: false };
    validateFoundryState();
    if (!Array.isArray(data?.updates) || data.updates.length === 0) {
      throw new Error('updates array is required');
    }
    return this.dataAccess.actors.updateActors(data.updates);
  }

  private async handleDeleteActors(data: { ids: string[] }): Promise<any> {
    const gmCheck = validateGMAccess();
    if (!gmCheck.allowed) return { error: 'Access denied', success: false };
    validateFoundryState();
    if (!Array.isArray(data?.ids) || data.ids.length === 0) {
      throw new Error('ids array is required');
    }
    return this.dataAccess.actors.deleteActors(data.ids);
  }

  private async handleUpdateActorItems(data: {
    actorIdentifier: string;
    itemUpdates: Array<{ id: string; name?: string; img?: string; system?: Record<string, any> }>;
  }): Promise<any> {
    const gmCheck = validateGMAccess();
    if (!gmCheck.allowed) return { error: 'Access denied', success: false };
    validateFoundryState();
    return this.dataAccess.actors.updateActorItems(data.actorIdentifier, data.itemUpdates);
  }

  private async handleDeleteActorItems(data: {
    actorIdentifier: string;
    itemIds: string[];
  }): Promise<any> {
    const gmCheck = validateGMAccess();
    if (!gmCheck.allowed) return { error: 'Access denied', success: false };
    validateFoundryState();
    return this.dataAccess.actors.deleteActorItems(data.actorIdentifier, data.itemIds);
  }
}
