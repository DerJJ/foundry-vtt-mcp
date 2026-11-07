import { MODULE_ID, ERROR_MESSAGES } from '../constants.js';
import { permissionManager } from '../permissions.js';
import { transactionManager } from '../transaction-manager.js';
import type {
  ActorCreationRequest,
  ActorCreationResult,
  CreatedActorInfo,
  CompendiumEntryFull,
} from './types.js';
import { validateFoundryState, auditLog } from './support.js';
import type { FoundryDataAccess } from '../data-access.js';

export class ActorService {
  constructor(private readonly access: FoundryDataAccess) {}

  /**
   * Create actors from compendium entries with custom names
   */
  async createActorFromCompendium(request: ActorCreationRequest): Promise<ActorCreationResult> {
    validateFoundryState();

    // Use new permission system
    const permissionCheck = permissionManager.checkWritePermission('createActor', {
      quantity: request.quantity || 1,
    });

    if (!permissionCheck.allowed) {
      throw new Error(`${ERROR_MESSAGES.ACCESS_DENIED}: ${permissionCheck.reason}`);
    }

    // Audit the permission check
    permissionManager.auditPermissionCheck('createActor', permissionCheck, request);

    const maxActors = game.settings.get(MODULE_ID, 'maxActorsPerRequest') as number;
    const quantity = Math.min(request.quantity || 1, maxActors);

    // Start transaction for rollback capability
    const transactionId = transactionManager.startTransaction(
      `Create ${quantity} actor(s) from compendium: ${request.creatureType}`
    );

    try {
      // Find matching compendium entry
      const compendiumEntry = await this.access.compendium.findBestCompendiumMatch(
        request.creatureType,
        request.packPreference
      );
      if (!compendiumEntry) {
        throw new Error(`No compendium entry found for "${request.creatureType}"`);
      }

      // Get full compendium document
      const sourceDoc = await this.access.compendium.getCompendiumDocumentFull(
        compendiumEntry.pack,
        compendiumEntry.id
      );

      const createdActors: CreatedActorInfo[] = [];
      const errors: string[] = [];

      // Create actors with custom names
      for (let i = 0; i < quantity; i++) {
        try {
          const customName =
            request.customNames?.[i] ||
            (quantity > 1 ? `${sourceDoc.name} ${i + 1}` : sourceDoc.name);

          const newActor = await this.createActorFromSource(sourceDoc, customName);

          // Track actor creation for rollback
          transactionManager.addAction(
            transactionId,
            transactionManager.createActorCreationAction(newActor.id)
          );

          createdActors.push({
            id: newActor.id,
            name: newActor.name,
            originalName: sourceDoc.name,
            type: newActor.type,
            sourcePackId: compendiumEntry.pack,
            sourcePackLabel: compendiumEntry.packLabel,
            img: newActor.img,
          });
        } catch (error) {
          errors.push(
            `Failed to create actor ${i + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
        }
      }

      let tokensPlaced = 0;

      // Add to scene if requested and permission allows
      if (request.addToScene && createdActors.length > 0) {
        try {
          const scenePermissionCheck = permissionManager.checkWritePermission('modifyScene', {
            targetIds: createdActors.map(a => a.id),
          });

          if (!scenePermissionCheck.allowed) {
            errors.push(`Cannot add to scene: ${scenePermissionCheck.reason}`);
          } else {
            const tokenResult = await this.access.world.addActorsToScene(
              {
                actorIds: createdActors.map(a => a.id),
                placement: 'random',
                hidden: false,
              },
              transactionId
            );
            tokensPlaced = tokenResult.tokensCreated;
          }
        } catch (error) {
          errors.push(
            `Failed to add actors to scene: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
        }
      }

      // If we had partial failure, decide whether to rollback
      if (errors.length > 0 && createdActors.length < quantity) {
        // Rollback if we failed to create more than half the requested actors
        if (createdActors.length < quantity / 2) {
          console.warn(
            `[${MODULE_ID}] Rolling back due to significant failures (${createdActors.length}/${quantity} created)`
          );
          await transactionManager.rollbackTransaction(transactionId);
          throw new Error(`Actor creation failed: ${errors.join(', ')}`);
        }
      }

      // Commit transaction
      transactionManager.commitTransaction(transactionId);

      const result: ActorCreationResult = {
        success: createdActors.length > 0,
        actors: createdActors,
        ...(errors.length > 0 ? { errors } : {}),
        tokensPlaced,
        totalRequested: quantity,
        totalCreated: createdActors.length,
      };

      auditLog('createActorFromCompendium', request, 'success');
      return result;
    } catch (error) {
      // Rollback on complete failure
      try {
        await transactionManager.rollbackTransaction(transactionId);
      } catch (rollbackError) {
        console.error(`[${MODULE_ID}] Failed to rollback transaction:`, rollbackError);
      }

      auditLog(
        'createActorFromCompendium',
        request,
        'failure',
        error instanceof Error ? error.message : 'Unknown error'
      );
      throw error;
    }
  }

  /**
   * Create actor from specific compendium entry using pack/item IDs
   */
  async createActorFromCompendiumEntry(request: {
    packId: string;
    itemId: string;
    customNames: string[];
    quantity?: number;
    addToScene?: boolean;
    placement?: {
      type: 'random' | 'grid' | 'center' | 'coordinates';
      coordinates?: { x: number; y: number }[];
    };
  }): Promise<ActorCreationResult> {
    validateFoundryState();

    try {
      const { packId, itemId, customNames, quantity = 1, addToScene = false, placement } = request;

      // Validate inputs
      if (!packId || !itemId) {
        throw new Error('Both packId and itemId are required');
      }

      // Get the pack
      const pack = game.packs.get(packId);
      if (!pack) {
        throw new Error(`Compendium pack "${packId}" not found`);
      }

      // Get the specific document
      const sourceDocument = await pack.getDocument(itemId);
      if (!sourceDocument) {
        throw new Error(`Document "${itemId}" not found in pack "${packId}"`);
      }

      // Validate that the document is an Actor (supports character, npc, creature, etc.)
      if (sourceDocument.documentName !== 'Actor') {
        throw new Error(
          `Document "${itemId}" is not an Actor (documentName: ${sourceDocument.documentName}, type: ${sourceDocument.type})`
        );
      }

      // Validate actor type - support all common actor types including DSA5 creatures
      // and Cosmere RPG adversaries.
      const validActorTypes = ['character', 'npc', 'creature', 'adversary'];
      if (!validActorTypes.includes(sourceDocument.type)) {
        throw new Error(
          `Document "${itemId}" has unsupported actor type: ${sourceDocument.type}. Supported types: ${validActorTypes.join(', ')}`
        );
      }

      const sourceActor = sourceDocument as Actor;

      // Prepare custom names
      const names = customNames.length > 0 ? customNames : [`${sourceActor.name} Copy`];
      const finalQuantity = Math.min(quantity, names.length);

      const createdActors: any[] = [];
      const errors: string[] = [];

      // Create actors
      for (let i = 0; i < finalQuantity; i++) {
        try {
          const customName = names[i] || `${sourceActor.name} ${i + 1}`;

          // Create actor data with full system, items, and effects
          const sourceData = sourceActor.toObject() as any;
          const actorData = {
            name: customName,
            type: sourceData.type,
            img: sourceData.img,
            system: sourceData.system || sourceData.data || {},
            items: sourceData.items || [],
            effects: sourceData.effects || [],
            folder: null, // Don't inherit folder
            prototypeToken: sourceData.prototypeToken, // Include prototype token
          };

          // Fix remote image URLs - normalize to local paths
          if (actorData.prototypeToken?.texture?.src?.startsWith('http')) {
            actorData.prototypeToken.texture.src = null; // Clear remote URL
          }

          // Organize created actors in a folder - use "Foundry MCP Creatures" for generic monsters
          const folderId = await this.getOrCreateFolder('Foundry MCP Creatures', 'Actor');
          if (folderId) {
            (actorData as any).folder = folderId;
          }

          // Create the actor
          const newActor = await Actor.create(actorData);
          if (!newActor) {
            throw new Error(`Failed to create actor "${customName}"`);
          }

          createdActors.push({
            id: newActor.id,
            name: newActor.name,
            originalName: sourceActor.name,
            sourcePackLabel: pack.metadata.label,
          });
        } catch (error) {
          const errorMsg = `Failed to create actor ${i + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`;
          errors.push(errorMsg);
          console.error(`[${MODULE_ID}] ${errorMsg}`, error);
        }
      }

      // Add to scene if requested
      let tokensPlaced = 0;
      if (addToScene && createdActors.length > 0) {
        try {
          const sceneResult = await this.access.world.addActorsToScene({
            actorIds: createdActors.map(a => a.id),
            placement: placement?.type || 'grid',
            hidden: false,
            ...(placement?.coordinates && { coordinates: placement.coordinates }),
          });
          tokensPlaced = sceneResult.success ? sceneResult.tokensCreated : 0;
        } catch (error) {
          errors.push(
            `Failed to add actors to scene: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
        }
      }

      const result: ActorCreationResult = {
        success: createdActors.length > 0,
        totalCreated: createdActors.length,
        totalRequested: finalQuantity,
        actors: createdActors,
        tokensPlaced,
        errors: errors.length > 0 ? errors : undefined,
      };

      auditLog('createActorFromCompendiumEntry', request, 'success');
      return result;
    } catch (error) {
      console.error(`[${MODULE_ID}] Failed to create actor from compendium entry`, error);
      auditLog(
        'createActorFromCompendiumEntry',
        request,
        'failure',
        error instanceof Error ? error.message : 'Unknown error'
      );
      throw error;
    }
  }

  /**
   * Add one or more freshly-authored Item documents to an existing Actor.
   *
   * Unlike `createActorFromCompendium*`, the items here are constructed from
   * caller-supplied data — no compendium lookup. This is the path used to
   * push planner-authored content (talents, actions, powers, custom gear)
   * onto a PC or NPC sheet.
   *
   * Validation is intentionally light: name + type are required, and the
   * type is checked against the active system's declared Item document
   * types when available. Everything else (system schema validation,
   * required sub-fields) is delegated to Foundry's DataModel layer, which
   * will fill defaults or throw a meaningful error.
   */
  async addActorItems(params: {
    actorIdentifier: string;
    items: Array<{
      name: string;
      type: string;
      img?: string;
      system?: Record<string, any>;
    }>;
  }): Promise<{
    actorId: string;
    actorName: string;
    created: Array<{ id: string; name: string; type: string }>;
  }> {
    validateFoundryState();

    const { actorIdentifier, items } = params;

    if (!actorIdentifier) {
      throw new Error('actorIdentifier is required');
    }
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error('items array is required and must contain at least one entry');
    }

    const actor = this.access.characters.findActorByIdentifier(actorIdentifier);
    if (!actor) {
      throw new Error(`Actor not found: ${actorIdentifier}`);
    }

    // Discover the active system's declared Item types so we can give a
    // useful error before sending the doc to Foundry's DataModel layer.
    const itemDocTypes = (game as any).system?.documentTypes?.Item;
    const validTypes: string[] | null =
      itemDocTypes && typeof itemDocTypes === 'object' ? Object.keys(itemDocTypes) : null;

    const payload = items.map((it, idx) => {
      if (!it || typeof it.name !== 'string' || it.name.trim().length === 0) {
        throw new Error(`items[${idx}]: "name" is required and must be a non-empty string`);
      }
      if (typeof it.type !== 'string' || it.type.trim().length === 0) {
        throw new Error(`items[${idx}] ("${it.name}"): "type" is required`);
      }
      if (validTypes && !validTypes.includes(it.type)) {
        throw new Error(
          `items[${idx}] ("${it.name}"): unknown type "${it.type}" for system "${(game.system as any)?.id}". ` +
            `Valid Item types: ${validTypes.join(', ')}`
        );
      }

      const doc: Record<string, any> = { name: it.name, type: it.type };
      if (it.img) doc.img = it.img;
      if (it.system && typeof it.system === 'object') doc.system = it.system;
      return doc;
    });

    try {
      const created = await actor.createEmbeddedDocuments('Item', payload);

      const result = {
        actorId: actor.id,
        actorName: actor.name,
        created: (created || []).map((doc: any) => ({
          id: doc.id,
          name: doc.name,
          type: doc.type,
        })),
      };

      auditLog(
        'addActorItems',
        { actorIdentifier, actorId: actor.id, count: payload.length },
        'success'
      );
      return result;
    } catch (error) {
      auditLog(
        'addActorItems',
        { actorIdentifier, actorId: actor.id, count: payload.length },
        'failure',
        error instanceof Error ? error.message : 'Unknown error'
      );
      throw error;
    }
  }

  async createActorFromData(request: {
    actorData: Record<string, unknown>;
    addToScene?: boolean;
    updateExisting?: boolean;
    existingActorIdentifier?: string;
    preserveItemTypes?: string[];
    placement?: {
      type: 'random' | 'grid' | 'center' | 'coordinates';
      coordinates?: { x: number; y: number }[];
    };
  }): Promise<{
    success: boolean;
    actor?: { id: string; name: string; type: string };
    updatedExisting?: boolean;
    tokensPlaced?: number;
    errors?: string[];
  }> {
    validateFoundryState();

    const permissionCheck = permissionManager.checkWritePermission('createActor', { quantity: 1 });
    if (!permissionCheck.allowed) {
      throw new Error(`${ERROR_MESSAGES.ACCESS_DENIED}: ${permissionCheck.reason}`);
    }
    permissionManager.auditPermissionCheck('createActor', permissionCheck, request);

    try {
      const actorData = foundry.utils.deepClone(request.actorData) as any;

      delete actorData._id;
      delete actorData.sort;

      if (!actorData.name || typeof actorData.name !== 'string') {
        throw new Error('actorData.name is required and must be a string');
      }
      if (!actorData.type || typeof actorData.type !== 'string') {
        actorData.type = 'character';
      }
      if (!actorData.system || typeof actorData.system !== 'object') {
        actorData.system = {};
      }

      if (Array.isArray(actorData.items)) {
        actorData.items = actorData.items
          .filter((item: any) => item && typeof item === 'object')
          .map((item: any) => {
            const clonedItem = foundry.utils.deepClone(item);
            delete clonedItem._id;
            delete clonedItem.folder;
            delete clonedItem.sort;
            return clonedItem;
          });
      } else {
        actorData.items = [];
      }

      if (Array.isArray(actorData.effects)) {
        actorData.effects = actorData.effects
          .filter((effect: any) => effect && typeof effect === 'object')
          .map((effect: any) => {
            const clonedEffect = foundry.utils.deepClone(effect);
            delete clonedEffect._id;
            delete clonedEffect.folder;
            delete clonedEffect.sort;
            return clonedEffect;
          });
      } else {
        actorData.effects = [];
      }

      if (actorData.prototypeToken?.texture?.src?.startsWith('http')) {
        actorData.prototypeToken.texture.src = null;
      }

      if (!actorData.folder) {
        const folderId = await this.getOrCreateFolder('Foundry MCP Imported Actors', 'Actor');
        if (folderId) {
          actorData.folder = folderId;
        }
      }

      const incomingItems = actorData.items;
      const incomingEffects = actorData.effects;
      delete actorData.items;
      delete actorData.effects;

      const existingActor =
        request.updateExisting && request.existingActorIdentifier
          ? this.access.characters.findActorByIdentifier(request.existingActorIdentifier)
          : undefined;
      const updatedExisting = Boolean(existingActor);
      let resultActor: any;

      if (existingActor) {
        await existingActor.update(actorData);

        const preservedTypes = new Set(request.preserveItemTypes ?? []);
        const existingItemsByKey = new Map<string, any[]>();
        for (const item of Array.from<any>(existingActor.items || [])) {
          if (preservedTypes.has(item.type)) continue;
          const key = `${item.type}::${String(item.name).toLowerCase()}`;
          const items = existingItemsByKey.get(key) ?? [];
          items.push(item);
          existingItemsByKey.set(key, items);
        }

        const itemUpdates: any[] = [];
        const itemsToCreate: any[] = [];
        for (const item of Array.isArray(incomingItems) ? incomingItems : []) {
          if (preservedTypes.has(item.type)) continue;
          const key = `${item.type}::${String(item.name).toLowerCase()}`;
          const matchingItem = existingItemsByKey.get(key)?.shift();
          if (matchingItem) itemUpdates.push({ ...item, _id: matchingItem.id });
          else itemsToCreate.push(item);
        }

        if (itemUpdates.length > 0) {
          await existingActor.updateEmbeddedDocuments('Item', itemUpdates);
        }
        if (itemsToCreate.length > 0) {
          await existingActor.createEmbeddedDocuments('Item', itemsToCreate);
        }

        const existingEffectsByKey = new Map<string, any[]>();
        for (const effect of Array.from<any>(existingActor.effects || [])) {
          const key = `${effect.type}::${String(effect.name).toLowerCase()}`;
          const effects = existingEffectsByKey.get(key) ?? [];
          effects.push(effect);
          existingEffectsByKey.set(key, effects);
        }

        const effectUpdates: any[] = [];
        const effectsToCreate: any[] = [];
        for (const effect of Array.isArray(incomingEffects) ? incomingEffects : []) {
          const key = `${effect.type}::${String(effect.name).toLowerCase()}`;
          const matchingEffect = existingEffectsByKey.get(key)?.shift();
          if (matchingEffect) effectUpdates.push({ ...effect, _id: matchingEffect.id });
          else effectsToCreate.push(effect);
        }

        if (effectUpdates.length > 0) {
          await existingActor.updateEmbeddedDocuments('ActiveEffect', effectUpdates);
        }
        if (effectsToCreate.length > 0) {
          await existingActor.createEmbeddedDocuments('ActiveEffect', effectsToCreate);
        }
        resultActor = existingActor;
      } else {
        resultActor = await Actor.create(actorData as any);
        if (!resultActor) {
          throw new Error(`Failed to create actor "${actorData.name}"`);
        }

        if (Array.isArray(incomingItems) && incomingItems.length > 0) {
          await resultActor.createEmbeddedDocuments('Item', incomingItems as any[]);
        }
        if (Array.isArray(incomingEffects) && incomingEffects.length > 0) {
          await resultActor.createEmbeddedDocuments('ActiveEffect', incomingEffects as any[]);
        }
      }

      let tokensPlaced = 0;
      if (request.addToScene) {
        const scene = (game.scenes as any).active;
        if (scene) {
          const placement = request.placement || { type: 'center' };
          const position = this.access.world.calculateTokenPosition(placement.type, scene, 0);
          const tokenData = {
            actorId: resultActor.id,
            x: position.x,
            y: position.y,
          };
          await scene.createEmbeddedDocuments('Token', [tokenData], {});
          tokensPlaced = 1;
        }
      }

      return {
        success: true,
        actor: {
          id: resultActor.id as string,
          name: resultActor.name as string,
          type: resultActor.type,
        },
        updatedExisting,
        tokensPlaced,
      };
    } catch (error) {
      auditLog(
        'createActorFromData',
        request,
        'failure',
        error instanceof Error ? error.message : 'Unknown error'
      );
      throw error;
    }
  }

  /**
   * Remove embedded Items from an existing Actor.
   *
   * Items can be named by id (exact, reliable) and/or by name (case-insensitive,
   * optionally constrained to a `type` to disambiguate). Names that match nothing
   * are reported back rather than silently ignored. This is the counterpart to
   * `addActorItems` — useful for clearing stray items added with the wrong type.
   */
  async removeActorItems(params: {
    actorIdentifier: string;
    itemIds?: string[];
    itemNames?: string[];
    type?: string;
  }): Promise<{
    actorId: string;
    actorName: string;
    removed: Array<{ id: string; name: string; type: string }>;
    notFound: string[];
  }> {
    validateFoundryState();

    const { actorIdentifier, itemIds, itemNames, type } = params;

    if (!actorIdentifier) {
      throw new Error('actorIdentifier is required');
    }
    const hasIds = Array.isArray(itemIds) && itemIds.length > 0;
    const hasNames = Array.isArray(itemNames) && itemNames.length > 0;
    if (!hasIds && !hasNames) {
      throw new Error('Provide itemIds and/or itemNames identifying the items to remove');
    }

    const actor = this.access.characters.findActorByIdentifier(actorIdentifier);
    if (!actor) {
      throw new Error(`Actor not found: ${actorIdentifier}`);
    }

    const typeLower = type?.toLowerCase();
    const toDelete = new Map<string, any>(); // id -> item (dedupes overlap)
    const notFound: string[] = [];

    if (hasIds) {
      for (const id of itemIds) {
        const item = actor.items.get(id);
        if (item) toDelete.set(item.id, item);
        else notFound.push(id);
      }
    }
    if (hasNames) {
      for (const name of itemNames) {
        const nameLower = name.toLowerCase();
        const item = actor.items.find(
          (i: any) => i.name?.toLowerCase() === nameLower && (!typeLower || i.type === typeLower)
        );
        if (item) toDelete.set(item.id, item);
        else notFound.push(name);
      }
    }

    if (toDelete.size === 0) {
      return { actorId: actor.id, actorName: actor.name, removed: [], notFound };
    }

    const removed = Array.from(toDelete.values()).map((i: any) => ({
      id: i.id,
      name: i.name,
      type: i.type,
    }));

    try {
      await actor.deleteEmbeddedDocuments(
        'Item',
        removed.map(r => r.id)
      );
      auditLog(
        'removeActorItems',
        { actorIdentifier, actorId: actor.id, count: removed.length },
        'success'
      );
      return { actorId: actor.id, actorName: actor.name, removed, notFound };
    } catch (error) {
      auditLog(
        'removeActorItems',
        { actorIdentifier, actorId: actor.id, count: removed.length },
        'failure',
        error instanceof Error ? error.message : 'Unknown error'
      );
      throw error;
    }
  }

  /**
   * Create actor from source document with custom name
   */
  private async createActorFromSource(
    sourceDoc: CompendiumEntryFull,
    customName: string
  ): Promise<any> {
    try {
      // Clone the source data
      const actorData = foundry.utils.deepClone(sourceDoc.fullData) as any;

      // Apply customizations
      actorData.name = customName;

      // Fix only token texture - leave portrait (actor.img) alone
      if (actorData.prototypeToken?.texture?.src?.startsWith('http')) {
        console.error(
          `[${MODULE_ID}] Removing remote token texture URL: ${actorData.prototypeToken.texture.src}`
        );
        actorData.prototypeToken.texture.src = null; // Let Foundry use fallback
      }

      // Remove source-specific identifiers
      delete actorData._id;
      delete actorData.folder;
      delete actorData.sort;

      // Ensure required fields are present
      if (!actorData.name) actorData.name = customName;
      if (!actorData.type) actorData.type = sourceDoc.type || 'npc';

      // Organize created actors in a folder - use "Foundry MCP Creatures" for generic monsters
      const folderId = await this.getOrCreateFolder('Foundry MCP Creatures', 'Actor');
      if (folderId) {
        actorData.folder = folderId;
      }

      // Create the new actor
      const createdDocs = await Actor.createDocuments([actorData]);
      if (!createdDocs || createdDocs.length === 0) {
        throw new Error('Failed to create actor document');
      }

      return createdDocs[0];
    } catch (error) {
      console.error(`[${MODULE_ID}] Actor creation failed:`, error);
      throw error;
    }
  }

  /**
   * Get or create a folder for organizing MCP-generated content
   */
  async getOrCreateFolder(
    folderName: string,
    type: 'Actor' | 'JournalEntry'
  ): Promise<string | null> {
    try {
      // Look for existing folder
      const existingFolder = game.folders?.find(
        (f: any) => f.name === folderName && f.type === type
      );

      if (existingFolder) {
        return existingFolder.id;
      }

      // Create appropriate descriptions
      let description = '';
      if (type === 'Actor') {
        if (folderName === 'Foundry MCP Creatures') {
          description = 'Creatures and monsters created via Foundry MCP Bridge';
        } else {
          description = `NPCs and creatures related to: ${folderName}`;
        }
      } else {
        description = `Quest and content for: ${folderName}`;
      }

      // Create new folder
      const folderData = {
        name: folderName,
        type,
        description,
        color: type === 'Actor' ? '#4a90e2' : '#f39c12', // Blue for actors, orange for journals
        sort: 0,
        parent: null,
        flags: {
          'foundry-mcp-bridge': {
            mcpGenerated: true,
            createdAt: new Date().toISOString(),
            questContext: type === 'JournalEntry' ? folderName : undefined,
          },
        },
      };

      const folder = await Folder.create(folderData);
      return folder?.id || null;
    } catch (error) {
      console.warn(`[${MODULE_ID}] Failed to create folder "${folderName}":`, error);
      // Return null so items are created without folders rather than failing
      return null;
    }
  }

  // ─── Generic actor CRUD ─────────────────────────────────────────────────────

  /**
   * Create one or more actors of any type with arbitrary system data.
   * Works for any Foundry game system — types and system fields are not validated here.
   */
  async createActors(params: {
    actors: Array<{
      name: string;
      type: string;
      img?: string;
      system?: Record<string, any>;
    }>;
    folder?: string;
  }): Promise<{ created: Array<{ id: string; name: string; type: string }>; total: number }> {
    const folderName = params.folder ?? 'Foundry MCP Actors';
    const folderId = await this.getOrCreateFolder(folderName, 'Actor');

    const gameSystemId = (game as any).system?.id ?? '';

    const docs = params.actors.map(a => {
      const doc: Record<string, any> = { name: a.name, type: a.type };
      if (a.img) doc.img = a.img;

      // Merge system data, adding safe defaults for systems that require certain
      // fields to exist during data preparation (avoids non-fatal init errors).
      let systemData: Record<string, any> = a.system ?? {};

      if (gameSystemId === 'mgt2e') {
        // mgt2e's _prepareCreatureData iterates skills.specialities —
        // ensure skills is at least an empty object to prevent a TypeError.
        if (!systemData.skills) {
          systemData = { skills: {}, ...systemData };
        }
        // Normalize skill keys to canonical lowercase (e.g. gunCombat → guncombat)
        // to prevent duplicate entries that the localization system cannot resolve.
        systemData = this.normalizeMGT2eSkillKeys(systemData);

        // ── mgt2e traveller/npc convenience handling ────────────────────────
        // When creating a traveller or npc, accept the same shorthand inputs
        // as the (now-removed) create-mgt2e-traveller tool:
        //   • Skills shorthand: { pilot: 2 } → { pilot: { value:2, trained:true } }
        //   • Skill full object: { pilot: { value:0, trained:true, specialities:{...} } }
        //   • Characteristics: lowercase keys (str/dex/…) normalised to uppercase +
        //     show:true so they appear on the sheet; hits auto-calculated if omitted
        //   • Details → sophont: { details: { career, species, … } } remapped to
        //     system.sophont (system.details does not exist in mgt2e)
        if (a.type === 'traveller' || a.type === 'npc') {
          // 1. Skills: add id, auto-populate specialities, set parent value.
          //    normalizeMGT2eSkillKeys already normalised keys and expanded number shorthands
          //    to {value, trained}; this step adds the createActors-only extras.
          const MGT2E_SKILL_SPECS: Record<string, string[]> = {
            animals: ['handling', 'veterinary', 'training'],
            art: ['performer', 'holography', 'instrument', 'visualMedia', 'write'],
            athletics: ['dexterity', 'endurance', 'strength'],
            drive: ['hovercraft', 'mole', 'track', 'walker', 'wheel'],
            electronics: ['comms', 'computers', 'remoteOps', 'sensors'],
            engineer: ['mDrive', 'jDrive', 'lifeSupport', 'power'],
            flyer: ['airship', 'grav', 'ornithopter', 'rotor', 'wing'],
            gunner: ['turret', 'ortillery', 'screen', 'capital'],
            guncombat: ['archaic', 'energy', 'slug'],
            heavyweapons: ['artillery', 'portable', 'vehicle'],
            melee: ['unarmed', 'blade', 'bludgeon', 'natural'],
            pilot: ['smallCraft', 'spacecraft', 'capitalShips'],
            seafarer: ['oceanShips', 'personal', 'sail', 'submarine'],
            tactics: ['military', 'naval'],
          };
          if (systemData.skills && typeof systemData.skills === 'object') {
            const normSkills: Record<string, any> = {};
            for (const [sk, sv] of Object.entries(systemData.skills as Record<string, any>)) {
              const s =
                sv && typeof sv === 'object' ? (sv as any) : { value: sv ?? 0, trained: true };
              normSkills[sk] = { id: sk, value: s.value ?? 0, trained: s.trained ?? true, ...s };
              // Parent value = min of caller-provided active spec values (before auto-populate).
              if (s.specialities && typeof s.specialities === 'object') {
                const activeValues: number[] = [];
                for (const sd of Object.values(s.specialities as Record<string, any>)) {
                  const v = Number((sd as any)?.value ?? 0);
                  if (v > 0) activeValues.push(v);
                }
                if (activeValues.length > 0) normSkills[sk].value = Math.min(...activeValues);
              }
              // Auto-populate missing specialities (additive only).
              const defaultSpecs = MGT2E_SKILL_SPECS[sk];
              if (defaultSpecs) {
                const existing: Record<string, any> = normSkills[sk].specialities ?? {};
                const merged: Record<string, any> = { ...existing };
                for (const specKey of defaultSpecs) {
                  if (!(specKey in merged)) merged[specKey] = { value: 0, trained: false };
                }
                normSkills[sk].specialities = merged;
              }
            }
            systemData = { ...systemData, skills: normSkills };
          }

          // 2. Characteristics: accept lowercase or uppercase keys,
          //    ensure show:true, calculate hits from STR+DEX+END if missing.
          if (systemData.characteristics && typeof systemData.characteristics === 'object') {
            const normChars: Record<string, any> = {};
            let str = 7,
              dex = 7,
              end = 7;
            for (const [k, v] of Object.entries(
              systemData.characteristics as Record<string, any>
            )) {
              const uk = k.toUpperCase();
              let charVal: number;
              if (typeof v === 'number') {
                charVal = v;
                normChars[uk] = { value: charVal, damage: 0, show: true };
              } else if (v && typeof v === 'object') {
                charVal = (v as any).value ?? 7;
                normChars[uk] = { show: true, ...(v as any) };
                if (normChars[uk].damage === undefined) normChars[uk].damage = 0;
              } else {
                charVal = 7;
                normChars[uk] = { value: charVal, damage: 0, show: true };
              }
              if (uk === 'STR') str = charVal;
              if (uk === 'DEX') dex = charVal;
              if (uk === 'END') end = charVal;
            }
            systemData = { ...systemData, characteristics: normChars };
            if (!systemData.hits) {
              const hitsMax = str + dex + end;
              systemData = { ...systemData, hits: { value: hitsMax, max: hitsMax } };
            }
          }

          // 3. Remap system.details → system.sophont (system.details does not exist in mgt2e)
          if (systemData.details && !systemData.sophont) {
            const d = systemData.details as any;
            const sophont: Record<string, any> = {};
            for (const [k, v] of Object.entries(d)) {
              if (k === 'career') {
                sophont.profession = v;
              } else if (k === 'description') {
                systemData = { ...systemData, description: v };
              } else {
                sophont[k] = v;
              }
            }
            if (Object.keys(sophont).length > 0) systemData = { ...systemData, sophont };
            const { details: _removed, ...rest } = systemData;
            systemData = rest;
          }
        }
      }

      // mgt2e software items: the spacecraft sheet reads i.system.software.bandwidth
      // unconditionally — if the software sub-object is missing the sheet crashes.
      // Inject safe defaults when the caller didn't supply them.
      if (a.type === 'software' && gameSystemId === 'mgt2e' && !systemData.software) {
        systemData = {
          software: { class: 'spacecraft', type: 'generic', interface: 'none', bandwidth: 0 },
          ...systemData,
        };
      }

      doc.system = systemData;
      if (folderId) doc.folder = folderId;
      return doc;
    });

    const created = await Actor.createDocuments(docs as any[]);
    if (!created || created.length === 0) {
      throw new Error('Foundry failed to create actor documents');
    }

    return {
      created: (created as any[]).map(a => ({ id: a.id, name: a.name, type: a.type })),
      total: created.length,
    };
  }

  /** Lowercases mgt2e skill keys before createActors processes them. */
  private normalizeMGT2eSkillKeys(system: Record<string, any>): Record<string, any> {
    const result: Record<string, any> = {};
    for (const [key, val] of Object.entries(system)) {
      if (key === 'skills' && val && typeof val === 'object' && !Array.isArray(val)) {
        const normalized: Record<string, any> = {};
        for (const [sk, sv] of Object.entries(val as Record<string, any>)) {
          normalized[sk.toLowerCase()] = sv;
        }
        result['skills'] = normalized;
      } else if (key.startsWith('skills.-=')) {
        result[`skills.-=${key.slice('skills.-='.length).toLowerCase()}`] = val;
      } else if (key.startsWith('skills.')) {
        const rest = key.slice('skills.'.length);
        const dotIdx = rest.indexOf('.');
        const lk =
          dotIdx === -1
            ? rest.toLowerCase()
            : rest.substring(0, dotIdx).toLowerCase() + rest.substring(dotIdx);
        result[`skills.${lk}`] = val;
      } else {
        result[key] = val;
      }
    }
    return result;
  }

  /**
   * Update one or more existing actors by ID.
   * Merges supplied fields into the actor (top-level keys overwrite).
   */
  async updateActors(
    updates: Array<{ id: string; name?: string; img?: string; system?: Record<string, any> }>
  ): Promise<{ updated: Array<{ id: string; name: string }>; total: number }> {
    const updatedActors: Array<{ id: string; name: string }> = [];

    for (const u of updates) {
      const actor = game.actors.get(u.id) as any;
      if (!actor) throw new Error(`Actor not found: ${u.id}`);

      const patch: Record<string, any> = {};
      if (u.name !== undefined) patch.name = u.name;
      if (u.img !== undefined) patch.img = u.img;
      if (u.system !== undefined) {
        // Build a single patch.system nested object so Foundry deep-merges everything
        // in one pass without flat-key vs nested-key conflicts.
        // Dot-notation keys (e.g. "crewed.passengers.-=actorId") are expanded to their
        // nested equivalent — Foundry's mergeObject honours the "-=" deletion operator
        // at any depth in a nested object, just as it does with top-level flat keys.
        const systemPatch: Record<string, any> = {};
        for (const [key, val] of Object.entries(u.system)) {
          if (key.includes('.')) {
            const parts = key.split('.');
            let cur = systemPatch;
            for (let i = 0; i < parts.length - 1; i++) {
              if (!(parts[i] in cur)) cur[parts[i]] = {};
              cur = cur[parts[i]];
            }
            cur[parts[parts.length - 1]] = val;
          } else {
            systemPatch[key] = val;
          }
        }
        patch.system = systemPatch;
      }

      await actor.update(patch);
      updatedActors.push({ id: actor.id, name: u.name ?? actor.name });
    }

    return { updated: updatedActors, total: updatedActors.length };
  }

  /**
   * Update one or more items embedded in an actor.
   */
  async updateActorItems(
    actorIdentifier: string,
    itemUpdates: Array<{ id: string; name?: string; img?: string; system?: Record<string, any> }>
  ): Promise<{ updated: Array<{ id: string; name: string }>; total: number }> {
    const actor =
      (game.actors.get(actorIdentifier) as any) ??
      (game.actors.find(
        (a: any) => a.name?.toLowerCase() === actorIdentifier.toLowerCase()
      ) as any);
    if (!actor) throw new Error(`Actor not found: ${actorIdentifier}`);

    const updated: Array<{ id: string; name: string }> = [];

    for (const u of itemUpdates) {
      const item = actor.items.get(u.id) as any;
      if (!item) throw new Error(`Item ${u.id} not found on actor "${actor.name}"`);

      const patch: Record<string, any> = {};
      if (u.name !== undefined) patch.name = u.name;
      if (u.img !== undefined) patch.img = u.img;
      if (u.system !== undefined) patch.system = u.system;

      await item.update(patch);
      updated.push({ id: item.id, name: u.name ?? item.name });
    }

    return { updated, total: updated.length };
  }

  /**
   * Delete one or more items embedded in an actor.
   */
  async deleteActorItems(
    actorIdentifier: string,
    itemIds: string[]
  ): Promise<{ deleted: string[]; total: number }> {
    const actor =
      (game.actors.get(actorIdentifier) as any) ??
      (game.actors.find(
        (a: any) => a.name?.toLowerCase() === actorIdentifier.toLowerCase()
      ) as any);
    if (!actor) throw new Error(`Actor not found: ${actorIdentifier}`);

    const existing = itemIds.filter(id => actor.items.get(id));
    if (existing.length === 0)
      throw new Error('None of the provided item IDs were found on this actor');

    await actor.deleteEmbeddedDocuments('Item', existing);
    return { deleted: existing, total: existing.length };
  }

  /**
   * Delete one or more actors by ID.
   */
  async deleteActors(ids: string[]): Promise<{ deleted: string[]; total: number }> {
    const existing = ids.filter(id => game.actors.get(id));
    if (existing.length === 0) throw new Error('None of the provided actor IDs were found');

    await Actor.deleteDocuments(existing);
    return { deleted: existing, total: existing.length };
  }
}
