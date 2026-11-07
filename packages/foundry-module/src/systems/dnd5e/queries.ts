import { validateFoundryState } from '../../services/support.js';
import type { FoundryDataAccess } from '../../data-access.js';
import { validateGMAccess } from '../../queries/gm-access.js';
import type { QueryGroup, QueryHandler } from '../../queries/query-registry.js';

export class Dnd5eQueries implements QueryGroup {
  constructor(private readonly dataAccess: FoundryDataAccess) {}

  routes(): Record<string, QueryHandler> {
    return {
      addSaveFeatureToActor: this.handleAddSaveFeatureToActor.bind(this),
      createNpcActor: this.handleCreateNpcActor.bind(this),
      addAttackToActor: this.handleAddAttackToActor.bind(this),
      addAuraToActor: this.handleAddAuraToActor.bind(this),
      addPassiveFeatureToActor: this.handleAddPassiveFeatureToActor.bind(this),
      addAttackWithSaveToActor: this.handleAddAttackWithSaveToActor.bind(this),
      setActorSpellcasting: this.handleSetActorSpellcasting.bind(this),
      addSpellsToActor: this.handleAddSpellsToActor.bind(this),
      addFeaturesFromCompendium: this.handleAddFeaturesFromCompendium.bind(this),
    };
  }

  // ===== D&D 5E HANDLERS =====

  /**
   * Handle add save feature to actor request (D&D 5e only)
   */
  private async handleAddSaveFeatureToActor(data: any): Promise<any> {
    try {
      // SECURITY: Silent GM validation
      const gmCheck = validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      validateFoundryState();

      if (!data.actorIdentifier) {
        throw new Error('actorIdentifier is required');
      }
      if (!data.featureName) {
        throw new Error('featureName is required');
      }

      return await this.dataAccess.dnd5e.addSaveFeatureToActor(data);
    } catch (error) {
      throw new Error(
        `Failed to add save feature to actor: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Handle create NPC actor request (D&D 5e only)
   */
  private async handleCreateNpcActor(data: any): Promise<any> {
    try {
      // SECURITY: Silent GM validation
      const gmCheck = validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      validateFoundryState();

      if (!data.name) {
        throw new Error('name is required');
      }
      if (data.cr === undefined || data.cr === null) {
        throw new Error('cr is required');
      }
      if (!data.creatureType) {
        throw new Error('creatureType is required');
      }
      if (!data.size) {
        throw new Error('size is required');
      }
      if (!data.abilities || typeof data.abilities !== 'object') {
        throw new Error('abilities is required and must be an object');
      }
      if (data.hpAverage === undefined || data.hpAverage === null) {
        throw new Error('hpAverage is required');
      }
      if (!data.hpFormula) {
        throw new Error('hpFormula is required');
      }
      if (!data.acMode) {
        throw new Error('acMode is required');
      }

      return await this.dataAccess.dnd5e.createNpcActor(data);
    } catch (error) {
      throw new Error(
        `Failed to create NPC actor: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Handle add attack feature to actor request (D&D 5e only)
   */
  private async handleAddAttackToActor(data: any): Promise<any> {
    try {
      // SECURITY: Silent GM validation
      const gmCheck = validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      validateFoundryState();

      if (!data.actorIdentifier) {
        throw new Error('actorIdentifier is required');
      }
      if (!data.featureName) {
        throw new Error('featureName is required');
      }
      if (!data.attackType) {
        throw new Error('attackType is required');
      }
      if (!Array.isArray(data.damageParts) || data.damageParts.length === 0) {
        throw new Error('damageParts is required and must contain at least one element');
      }

      return await this.dataAccess.dnd5e.addAttackToActor(data);
    } catch (error) {
      throw new Error(
        `Failed to add attack to actor: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Handle add aura feature to actor request (D&D 5e only)
   */
  private async handleAddAuraToActor(data: any): Promise<any> {
    try {
      // SECURITY: Silent GM validation
      const gmCheck = validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      validateFoundryState();

      if (!data.actorIdentifier) {
        throw new Error('actorIdentifier is required');
      }
      if (!data.featureName) {
        throw new Error('featureName is required');
      }
      if (!Array.isArray(data.damageParts) || data.damageParts.length === 0) {
        throw new Error('damageParts is required and must contain at least one element');
      }
      if (!data.areaType) {
        throw new Error('areaType is required');
      }
      if (data.areaSize === undefined || data.areaSize === null) {
        throw new Error('areaSize is required');
      }

      return await this.dataAccess.dnd5e.addAuraToActor(data);
    } catch (error) {
      throw new Error(
        `Failed to add aura to actor: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Handle add passive feature to actor request (D&D 5e only)
   */
  private async handleAddPassiveFeatureToActor(data: any): Promise<any> {
    try {
      const gmCheck = validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      validateFoundryState();

      if (!data.actorIdentifier) {
        throw new Error('actorIdentifier is required');
      }
      if (!data.featureName) {
        throw new Error('featureName is required');
      }

      return await this.dataAccess.dnd5e.addPassiveFeatureToActor(data);
    } catch (error) {
      throw new Error(
        `Failed to add passive feature to actor: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Handle add attack+save feature to actor request (D&D 5e only)
   */
  private async handleAddAttackWithSaveToActor(data: any): Promise<any> {
    try {
      const gmCheck = validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      validateFoundryState();

      if (!data.actorIdentifier) throw new Error('actorIdentifier is required');
      if (!data.featureName) throw new Error('featureName is required');
      if (!data.attackType) throw new Error('attackType is required');
      if (!Array.isArray(data.damageParts) || data.damageParts.length === 0) {
        throw new Error('damageParts is required and must contain at least one element');
      }
      if (!data.saveAbility) throw new Error('saveAbility is required');
      if (!data.saveDC) throw new Error('saveDC is required');
      if (!Array.isArray(data.saveDamageParts) || data.saveDamageParts.length === 0) {
        throw new Error('saveDamageParts is required and must contain at least one element');
      }

      return await this.dataAccess.dnd5e.addAttackWithSaveToActor(data);
    } catch (error) {
      throw new Error(
        `Failed to add attack+save to actor: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private async handleSetActorSpellcasting(data: any): Promise<any> {
    try {
      if (!data.actorIdentifier) {
        throw new Error('actorIdentifier is required');
      }
      if (!data.spellcastingClass) {
        throw new Error('spellcastingClass is required');
      }
      if (
        typeof data.spellcastingLevel !== 'number' ||
        data.spellcastingLevel < 1 ||
        data.spellcastingLevel > 20
      ) {
        throw new Error('spellcastingLevel must be a number between 1 and 20');
      }
      if (!data.effectiveAbility) {
        throw new Error('effectiveAbility is required');
      }

      return await this.dataAccess.dnd5e.setActorSpellcasting(data);
    } catch (error) {
      throw new Error(
        `Failed to set actor spellcasting: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private async handleAddSpellsToActor(data: any): Promise<any> {
    try {
      if (!data.actorIdentifier) {
        throw new Error('actorIdentifier is required');
      }
      if (!Array.isArray(data.spellNames) || data.spellNames.length === 0) {
        throw new Error('spellNames is required and must contain at least one element');
      }
      if (data.spellNames.length > 50) {
        throw new Error('spellNames cannot contain more than 50 elements');
      }

      return await this.dataAccess.dnd5e.addSpellsToActor(data);
    } catch (error) {
      throw new Error(
        `Failed to add spells to actor: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private async handleAddFeaturesFromCompendium(data: any): Promise<any> {
    try {
      if (!data.actorIdentifier) {
        throw new Error('actorIdentifier is required');
      }
      if (!Array.isArray(data.featureNames) || data.featureNames.length === 0) {
        throw new Error('featureNames is required and must contain at least one element');
      }
      if (data.featureNames.length > 50) {
        throw new Error('featureNames cannot contain more than 50 elements');
      }

      return await this.dataAccess.dnd5e.addFeaturesFromCompendium(data);
    } catch (error) {
      throw new Error(
        `Failed to add features from compendium: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}
