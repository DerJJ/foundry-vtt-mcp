import { validateFoundryState } from './support.js';

export class EffectService {
  /**
   * Create, update, or delete an ActiveEffect on an Actor or one of its embedded Items.
   */
  async manageEffects(data: {
    action: 'create' | 'update' | 'delete';
    actorIdentifier: string;
    parentType: 'actor' | 'item';
    parentItemIdentifier?: string;
    effectId?: string;
    effectData?: Record<string, any>;
  }): Promise<any> {
    validateFoundryState();

    if (!['create', 'update', 'delete'].includes(data.action)) {
      throw new Error(`Unsupported effect action: ${data.action}`);
    }
    if (!['actor', 'item'].includes(data.parentType)) {
      throw new Error(`Unsupported effect parentType: ${data.parentType}`);
    }

    const actor =
      game.actors?.get(data.actorIdentifier) ??
      game.actors?.find(
        (candidate: any) => candidate.name?.toLowerCase() === data.actorIdentifier.toLowerCase()
      );
    if (!actor) {
      throw new Error(`Actor not found: ${data.actorIdentifier}`);
    }

    let parent: any = actor;
    let parentItem: any;
    if (data.parentType === 'item') {
      if (!data.parentItemIdentifier) {
        throw new Error('parentItemIdentifier is required when parentType is "item"');
      }
      parentItem =
        actor.items?.get(data.parentItemIdentifier) ??
        actor.items?.find(
          (item: any) => item.name?.toLowerCase() === data.parentItemIdentifier!.toLowerCase()
        );
      if (!parentItem) {
        throw new Error(`Item not found on actor "${actor.name}": ${data.parentItemIdentifier}`);
      }
      parent = parentItem;
    }

    const parentMetadata =
      data.parentType === 'item'
        ? { scope: 'item', parentItemId: parentItem.id, parentItemName: parentItem.name }
        : { scope: 'actor' };
    // ActiveEffect#toObject() is already plain data. Avoid sanitizeData here because
    // an effect change's `key` field is meaningful gameplay data, not a credential.
    const serializeEffect = (effect: any): Record<string, any> =>
      (effect?.toObject?.() ?? effect?._source ?? {}) as Record<string, any>;
    const getEffect = (effectId: string): any =>
      parent.effects?.get?.(effectId) ??
      parent.effects?.contents?.find((effect: any) => effect.id === effectId) ??
      (Array.isArray(parent.effects)
        ? parent.effects.find((effect: any) => effect.id === effectId)
        : undefined);

    if (data.action === 'create') {
      if (
        !data.effectData ||
        typeof data.effectData.name !== 'string' ||
        data.effectData.name.trim().length === 0
      ) {
        throw new Error('effectData.name is required for create and must be a non-empty string');
      }

      const created = await parent.createEmbeddedDocuments('ActiveEffect', [data.effectData]);
      const effect = created?.[0];
      if (!effect) {
        throw new Error('Foundry failed to create the ActiveEffect');
      }

      return {
        success: true,
        action: 'create',
        entityType: 'effect',
        effect: serializeEffect(effect),
        ...parentMetadata,
      };
    }

    if (!data.effectId) {
      throw new Error(`effectId is required for ${data.action}`);
    }

    const existingEffect = getEffect(data.effectId);
    if (!existingEffect) {
      const parentDescription =
        data.parentType === 'item'
          ? `Item "${parentItem.name}" on actor "${actor.name}"`
          : `actor "${actor.name}"`;
      throw new Error(`ActiveEffect ${data.effectId} not found on ${parentDescription}`);
    }

    if (data.action === 'update') {
      if (!data.effectData || Object.keys(data.effectData).length === 0) {
        throw new Error('effectData is required for update and must contain at least one field');
      }
      for (const idField of ['_id', 'id'] as const) {
        if (
          Object.prototype.hasOwnProperty.call(data.effectData, idField) &&
          data.effectData[idField] !== data.effectId
        ) {
          throw new Error(`effectData.${idField} must match effectId when provided`);
        }
      }

      const updated = await parent.updateEmbeddedDocuments('ActiveEffect', [
        { _id: data.effectId, ...data.effectData },
      ]);
      const effect = updated?.[0] ?? getEffect(data.effectId);
      if (!effect) {
        throw new Error(`Foundry failed to return updated ActiveEffect ${data.effectId}`);
      }

      return {
        success: true,
        action: 'update',
        entityType: 'effect',
        effect: serializeEffect(effect),
        ...parentMetadata,
      };
    }

    const effectName = existingEffect.name || existingEffect.label || 'Unknown Effect';
    await parent.deleteEmbeddedDocuments('ActiveEffect', [data.effectId]);
    return {
      success: true,
      action: 'delete',
      entityType: 'effect',
      effectId: data.effectId,
      effectName,
      ...parentMetadata,
    };
  }
}
