import { validateFoundryState } from '../services/support.js';
import type { FoundryDataAccess } from '../data-access.js';
import { validateGMAccess } from './gm-access.js';
import type { QueryGroup, QueryHandler } from './query-registry.js';

export class TokenQueries implements QueryGroup {
  constructor(private readonly dataAccess: FoundryDataAccess) {}

  routes(): Record<string, QueryHandler> {
    return {
      moveToken: this.handleMoveToken.bind(this),
      updateToken: this.handleUpdateToken.bind(this),
      deleteTokens: this.handleDeleteTokens.bind(this),
      getTokenDetails: this.handleGetTokenDetails.bind(this),
      toggleTokenCondition: this.handleToggleTokenCondition.bind(this),
      getAvailableConditions: this.handleGetAvailableConditions.bind(this),
      'move-token': this.handleMoveToken.bind(this),
      'update-token': this.handleUpdateToken.bind(this),
      'delete-tokens': this.handleDeleteTokens.bind(this),
      'get-token-details': this.handleGetTokenDetails.bind(this),
      'toggle-token-condition': this.handleToggleTokenCondition.bind(this),
      'get-available-conditions': this.handleGetAvailableConditions.bind(this),
    };
  }

  // ===== PHASE 7: TOKEN MANIPULATION HANDLERS =====

  /**
   * Handle move token request
   */
  private async handleMoveToken(data: {
    tokenId: string;
    x: number;
    y: number;
    animate?: boolean;
  }): Promise<any> {
    try {
      // SECURITY: Silent GM validation
      const gmCheck = validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      validateFoundryState();

      if (!data.tokenId) {
        throw new Error('tokenId is required');
      }
      if (typeof data.x !== 'number' || typeof data.y !== 'number') {
        throw new Error('x and y coordinates are required and must be numbers');
      }

      return await this.dataAccess.tokens.moveToken(data);
    } catch (error) {
      throw new Error(
        `Failed to move token: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Handle update token request
   */
  private async handleUpdateToken(data: {
    tokenId: string;
    updates: Record<string, any>;
  }): Promise<any> {
    try {
      // SECURITY: Silent GM validation
      const gmCheck = validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      validateFoundryState();

      if (!data.tokenId) {
        throw new Error('tokenId is required');
      }
      if (!data.updates || typeof data.updates !== 'object') {
        throw new Error('updates object is required');
      }

      return await this.dataAccess.tokens.updateToken(data);
    } catch (error) {
      throw new Error(
        `Failed to update token: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Handle delete tokens request
   */
  private async handleDeleteTokens(data: { tokenIds: string[] }): Promise<any> {
    try {
      // SECURITY: Silent GM validation
      const gmCheck = validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      validateFoundryState();

      if (!data.tokenIds || !Array.isArray(data.tokenIds) || data.tokenIds.length === 0) {
        throw new Error('tokenIds array is required and must not be empty');
      }

      return await this.dataAccess.tokens.deleteTokens(data);
    } catch (error) {
      throw new Error(
        `Failed to delete tokens: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Handle get token details request
   */
  private async handleGetTokenDetails(data: { tokenId: string }): Promise<any> {
    try {
      // SECURITY: Silent GM validation
      const gmCheck = validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      validateFoundryState();

      if (!data.tokenId) {
        throw new Error('tokenId is required');
      }

      return await this.dataAccess.tokens.getTokenDetails(data);
    } catch (error) {
      throw new Error(
        `Failed to get token details: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Handle toggle token condition request
   */
  private async handleToggleTokenCondition(data: {
    tokenId: string;
    conditionId: string;
    active: boolean;
  }): Promise<any> {
    try {
      // SECURITY: Silent GM validation
      const gmCheck = validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      validateFoundryState();

      if (!data.tokenId) {
        throw new Error('tokenId is required');
      }
      if (!data.conditionId) {
        throw new Error('conditionId is required');
      }
      if (typeof data.active !== 'boolean') {
        throw new Error('active must be a boolean');
      }

      return await this.dataAccess.tokens.toggleTokenCondition(data);
    } catch (error) {
      throw new Error(
        `Failed to toggle token condition: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Handle get available conditions request
   */
  private async handleGetAvailableConditions(): Promise<any> {
    try {
      // SECURITY: Silent GM validation
      const gmCheck = validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      validateFoundryState();

      return await this.dataAccess.tokens.getAvailableConditions();
    } catch (error) {
      throw new Error(
        `Failed to get available conditions: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}
