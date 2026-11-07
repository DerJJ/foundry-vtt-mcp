import { validateFoundryState } from '../services/support.js';
import type { FoundryDataAccess } from '../data-access.js';
import { validateGMAccess } from './gm-access.js';
import type { QueryGroup, QueryHandler } from './query-registry.js';

export class CompendiumQueries implements QueryGroup {
  constructor(private readonly dataAccess: FoundryDataAccess) {}

  routes(): Record<string, QueryHandler> {
    return {
      searchCompendium: this.handleSearchCompendium.bind(this),
      listCreaturesByCriteria: this.handleListCreaturesByCriteria.bind(this),
      getAvailablePacks: this.handleGetAvailablePacks.bind(this),
      getPackIndex: this.handleGetPackIndex.bind(this),
      getCompendiumDocumentFull: this.handleGetCompendiumDocumentFull.bind(this),
      getEnhancedCreatureIndex: this.handleGetEnhancedCreatureIndex.bind(this),
    };
  }

  /**
   * Handle compendium search request
   */
  private async handleSearchCompendium(data: {
    query: string;
    packType?: string;
    filters?: {
      challengeRating?: number | { min?: number; max?: number };
      creatureType?: string;
      size?: string;
      alignment?: string;
      hasLegendaryActions?: boolean;
      spellcaster?: boolean;
    };
  }): Promise<any> {
    try {
      // SECURITY: Silent GM validation
      const gmCheck = validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      validateFoundryState();

      // Add better parameter validation
      if (!data || typeof data !== 'object') {
        throw new Error('Invalid data parameter structure');
      }

      if (!data.query || typeof data.query !== 'string') {
        throw new Error('query parameter is required and must be a string');
      }

      return await this.dataAccess.compendium.searchCompendium(
        data.query,
        data.packType,
        data.filters
      );
    } catch (error) {
      throw new Error(
        `Failed to search compendium: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Handle list creatures by criteria request
   */
  private async handleListCreaturesByCriteria(data: {
    challengeRating?: number | { min?: number; max?: number };
    creatureType?: string;
    size?: string;
    hasSpells?: boolean;
    hasLegendaryActions?: boolean;
    limit?: number;
  }): Promise<any> {
    try {
      // SECURITY: Silent GM validation
      const gmCheck = validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      validateFoundryState();

      const result = await this.dataAccess.compendium.listCreaturesByCriteria(data);

      // Handle the new format with search summary
      return {
        response: result,
      };
    } catch (error) {
      throw new Error(
        `Failed to list creatures by criteria: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Handle get available packs request
   */
  private async handleGetAvailablePacks(): Promise<any> {
    try {
      // SECURITY: Silent GM validation
      const gmCheck = validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      validateFoundryState();
      return await this.dataAccess.compendium.getAvailablePacks();
    } catch (error) {
      throw new Error(
        `Failed to get available packs: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Handle get pack index request. Returns a compendium pack's index entries,
   * optionally including extra system fields (e.g. dsa5 species/career) so callers
   * can filter without loading every full document. Used by list-dsa5-archetypes.
   */
  private async handleGetPackIndex(data: { packId: string; fields?: string[] }): Promise<any> {
    try {
      // SECURITY: Silent GM validation
      const gmCheck = validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      validateFoundryState();
      if (!data?.packId) {
        throw new Error('packId is required');
      }
      return await this.dataAccess.compendium.getPackIndex(data.packId, data.fields);
    } catch (error) {
      throw new Error(
        `Failed to get pack index: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Handle get compendium document full request
   */
  private async handleGetCompendiumDocumentFull(data: {
    packId: string;
    documentId: string;
  }): Promise<any> {
    try {
      // SECURITY: Silent GM validation
      const gmCheck = validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      validateFoundryState();

      if (!data.packId) {
        throw new Error('packId is required');
      }

      if (!data.documentId) {
        throw new Error('documentId is required');
      }

      return await this.dataAccess.compendium.getCompendiumDocumentFull(
        data.packId,
        data.documentId
      );
    } catch (error) {
      throw new Error(
        `Failed to get compendium document: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Handle get enhanced creature index request
   */
  async handleGetEnhancedCreatureIndex(): Promise<any> {
    try {
      // SECURITY: Silent GM validation
      const gmCheck = validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      validateFoundryState();

      return await this.dataAccess.compendium.getEnhancedCreatureIndex();
    } catch (error) {
      throw new Error(
        `Failed to get enhanced creature index: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}
