import type { ItemTargetingResult } from './types.js';
import { sanitizeData, validateFoundryState, auditLog } from './support.js';
import type { FoundryDataAccess } from '../data-access.js';

export class ItemService {
  constructor(private readonly access: FoundryDataAccess) {}

  /**
   * List world-level Item documents from the Items sidebar.
   * Optionally filters by type, folder (name or id), or a case-insensitive name substring.
   */
  async listWorldItems(params: { type?: string; folder?: string; nameFilter?: string }): Promise<
    Array<{
      id: string;
      name: string;
      type: string;
      img?: string;
      folderId: string | null;
      folderName: string | null;
    }>
  > {
    validateFoundryState();

    const { type, folder, nameFilter } = params;
    const nameLower = nameFilter ? nameFilter.toLowerCase() : null;

    // Resolve folder filter to an id if a name/id was provided
    let folderId: string | null = null;
    if (folder && folder.trim().length > 0) {
      const folderTrimmed = folder.trim();
      const folderDoc =
        (game as any).folders?.find(
          (f: any) => f.type === 'Item' && (f.name === folderTrimmed || f.id === folderTrimmed)
        ) ?? null;
      if (!folderDoc) {
        return [];
      }
      folderId = folderDoc.id;
    }

    const result: Array<{
      id: string;
      name: string;
      type: string;
      img?: string;
      folderId: string | null;
      folderName: string | null;
    }> = [];

    for (const item of (game as any).items) {
      if (type && item.type !== type) continue;
      if (folderId && item.folder?.id !== folderId) continue;
      if (nameLower && !(item.name ?? '').toLowerCase().includes(nameLower)) continue;

      result.push({
        id: item.id ?? '',
        name: item.name ?? '',
        type: item.type,
        ...(item.img ? { img: item.img } : {}),
        folderId: item.folder?.id ?? null,
        folderName: item.folder?.name ?? null,
      });
    }

    return result;
  }

  /**
   * Read a single world-level Item in full.
   *
   * `listWorldItems` returns index-level fields only, so there was no way to
   * read back an item a GM had built in the sidebar: the bridge could create
   * and update world items but never see their description or system data
   * (#116). Resolves by id first, then by exact name, and refuses an ambiguous
   * name rather than guessing which item was meant.
   *
   * Reads through `toObject()` rather than the live `system`, so Map-backed
   * fields (dnd5e Activities) serialize as their stored source instead of
   * collapsing to `{}`.
   */
  async getWorldItem(params: { itemIdentifier: string }): Promise<{
    id: string;
    name: string;
    type: string;
    img?: string;
    folderId: string | null;
    folderName: string | null;
    system: Record<string, any>;
    fullData: Record<string, any>;
  }> {
    validateFoundryState();

    const identifier = (params?.itemIdentifier ?? '').trim();
    if (!identifier) {
      throw new Error('itemIdentifier is required');
    }

    const collection = (game as any).items;
    let item = collection?.get?.(identifier) ?? null;

    if (!item) {
      const lowered = identifier.toLowerCase();
      const all: any[] = collection?.contents ?? Array.from(collection ?? []);
      const matches = all.filter(
        (candidate: any) => (candidate?.name ?? '').toLowerCase() === lowered
      );
      if (matches.length > 1) {
        throw new Error(
          `Multiple world items are named "${identifier}". Pass an id instead: ` +
            matches.map((candidate: any) => candidate.id).join(', ')
        );
      }
      item = matches[0] ?? null;
    }

    if (!item) {
      throw new Error(`World item not found: ${identifier}`);
    }

    const documentData = (item.toObject?.() ?? {}) as Record<string, any>;
    const system = sanitizeData(documentData.system ?? {});
    const fullData = sanitizeData(documentData);

    // The sanitizer strips `advancement`, so restore it from source, as
    // getCompendiumDocumentFull does.
    if (Object.prototype.hasOwnProperty.call(documentData.system ?? {}, 'advancement')) {
      const advancement = sanitizeData(documentData.system.advancement);
      system.advancement = advancement;
      fullData.system ??= {};
      fullData.system.advancement = advancement;
    }

    return {
      id: item.id ?? '',
      name: item.name ?? '',
      type: item.type,
      ...(item.img ? { img: item.img } : {}),
      folderId: item.folder?.id ?? null,
      folderName: item.folder?.name ?? null,
      system,
      fullData,
    };
  }

  /**
   * Update one or more existing world-level Item documents.
   *
   * Each entry must supply an `id` plus at least one field to change (name,
   * img, system, folder). Uses Item.updateDocuments() for a single batched
   * write. Folder may be supplied as a name or id; if a name is given that
   * does not exist, it is created automatically (same behaviour as
   * createWorldItems).
   */
  async updateWorldItems(params: {
    updates: Array<{
      id: string;
      name?: string;
      img?: string;
      system?: Record<string, any>;
      folder?: string;
    }>;
  }): Promise<{
    updated: Array<{ id: string; name: string; type: string }>;
  }> {
    validateFoundryState();

    const { updates } = params;

    if (!Array.isArray(updates) || updates.length === 0) {
      throw new Error('updates array is required and must contain at least one entry');
    }

    // Cache folder resolutions so we only look up / create each folder once
    const folderCache = new Map<string, string>(); // folder param → folder id

    const resolveFolderId = async (folder: string): Promise<string> => {
      if (folderCache.has(folder)) return folderCache.get(folder)!;
      const folderTrimmed = folder.trim();
      let folderDoc =
        (game as any).folders?.find(
          (f: any) => f.type === 'Item' && (f.name === folderTrimmed || f.id === folderTrimmed)
        ) ?? null;
      if (!folderDoc) {
        folderDoc = await (Folder as any).create({
          name: folderTrimmed,
          type: 'Item',
          parent: null,
        });
      }
      folderCache.set(folder, folderDoc.id);
      return folderDoc.id;
    };

    const payload: Array<Record<string, any>> = [];

    for (let idx = 0; idx < updates.length; idx++) {
      const upd = updates[idx];
      if (!upd || typeof upd.id !== 'string' || upd.id.trim().length === 0) {
        throw new Error(`updates[${idx}]: "id" is required and must be a non-empty string`);
      }

      const item = (game as any).items?.get(upd.id);
      if (!item) {
        throw new Error(`updates[${idx}]: Item "${upd.id}" not found in world`);
      }

      const patch: Record<string, any> = { _id: upd.id };
      if (upd.name !== undefined) patch.name = upd.name;
      if (upd.img !== undefined) patch.img = upd.img;
      if (upd.system !== undefined) patch.system = upd.system;
      if (upd.folder !== undefined && upd.folder.trim().length > 0) {
        patch.folder = await resolveFolderId(upd.folder.trim());
      }

      payload.push(patch);
    }

    try {
      const updated = await (Item as any).updateDocuments(payload);

      const result = {
        updated: (updated || []).map((doc: any) => ({
          id: doc.id,
          name: doc.name,
          type: doc.type,
        })),
      };

      auditLog('updateWorldItems', { count: payload.length }, 'success');
      return result;
    } catch (error) {
      auditLog(
        'updateWorldItems',
        { count: payload.length },
        'failure',
        error instanceof Error ? error.message : 'Unknown error'
      );
      throw error;
    }
  }

  /**
   * Create one or more world-level Item documents (Items sidebar, not embedded on an actor).
   *
   * Uses Item.createDocuments() with no parent so items appear in the Foundry
   * Items sidebar and can be dragged onto any actor sheet. Optionally places
   * items inside a named/id-resolved folder, creating the folder if necessary.
   */
  async createWorldItems(params: {
    items: Array<{
      name: string;
      type: string;
      img?: string;
      system?: Record<string, any>;
    }>;
    folder?: string;
  }): Promise<{
    folderId: string | null;
    folderName: string | null;
    created: Array<{ id: string; name: string; type: string }>;
  }> {
    validateFoundryState();

    const { items, folder } = params;

    if (!Array.isArray(items) || items.length === 0) {
      throw new Error('items array is required and must contain at least one entry');
    }

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
      if (Array.isArray((it as any).effects)) doc.effects = (it as any).effects;
      if ((it as any).flags && typeof (it as any).flags === 'object') doc.flags = (it as any).flags;
      return doc;
    });

    // Resolve or create the target folder
    let folderDoc: any = null;
    if (folder && folder.trim().length > 0) {
      const folderTrimmed = folder.trim();
      folderDoc =
        (game as any).folders?.find(
          (f: any) => f.type === 'Item' && (f.name === folderTrimmed || f.id === folderTrimmed)
        ) ?? null;

      if (!folderDoc) {
        folderDoc = await (Folder as any).create({
          name: folderTrimmed,
          type: 'Item',
          parent: null,
        });
      }

      for (const doc of payload) {
        doc.folder = folderDoc.id;
      }
    }

    try {
      const created = await (Item as any).createDocuments(payload);

      const result = {
        folderId: folderDoc ? folderDoc.id : null,
        folderName: folderDoc ? folderDoc.name : null,
        created: (created || []).map((doc: any) => ({
          id: doc.id,
          name: doc.name,
          type: doc.type,
        })),
      };

      auditLog('createWorldItems', { folder: folder ?? null, count: payload.length }, 'success');
      return result;
    } catch (error) {
      auditLog(
        'createWorldItems',
        { folder: folder ?? null, count: payload.length },
        'failure',
        error instanceof Error ? error.message : 'Unknown error'
      );
      throw error;
    }
  }

  /**
   * Get system-specific enum/schema information for the current game system.
   * Returns valid values for enumerated fields so the LLM can use correct keys
   * when creating or updating items/actors (e.g. weapon.traits in mgt2e).
   */
  getSystemSchema(): Record<string, any> {
    const systemId = (game as any).system?.id ?? 'unknown';

    if (systemId !== 'mgt2e') {
      return {
        system: systemId,
        message: 'No enum schema available for this system',
      };
    }

    const mgt2Config = (CONFIG as any).MGT2;
    if (!mgt2Config) {
      return { system: 'mgt2e', message: 'CONFIG.MGT2 not found — system may not be fully loaded' };
    }

    // ── Weapon traits from live CONFIG.MGT2.WEAPONS.traits ───────────────────
    const weaponTraitsRaw = mgt2Config.WEAPONS?.traits ?? {};
    const traitsPersonal: string[] = [];
    const traitsSpacecraft: string[] = [];
    const traitsAny: string[] = [];
    const traitsWithValue: string[] = [];

    for (const [key, val] of Object.entries(weaponTraitsRaw)) {
      const v = val as any;
      const scale: string = v.scale ?? 'any';
      if (scale === 'traveller' || scale === 'vehicle') traitsPersonal.push(key);
      else if (scale === 'spacecraft') traitsSpacecraft.push(key);
      else traitsAny.push(key); // no scale restriction
      if (v.value !== undefined) traitsWithValue.push(key);
    }

    return {
      system: 'mgt2e',
      description:
        'Enum reference for mgt2e item and actor fields. Use these exact keys — wrong values are silently ignored by the system.',
      items: {
        weapon: {
          'weapon.traits': {
            description:
              'Comma-separated string of trait keys. Traits with numeric values use "key N" (e.g. "ap 5, auto 3, stun"). Conflicts: bulky/veryBulky, dangerous/veryDangerous, ap/loPen.',
            traits_personal_scale: traitsPersonal.sort(),
            traits_spacecraft_scale: traitsSpacecraft.sort(),
            traits_any_scale: traitsAny.sort(),
            traits_requiring_numeric_value: traitsWithValue.sort(),
            example: 'ap 5, auto 3, scope, stun',
          },
          'weapon.scale': ['traveller', 'vehicle', 'spacecraft'],
          'weapon.characteristic': ['STR', 'DEX', 'END', 'INT', 'EDU', 'SOC'],
          'weapon.damageType': [
            'standard',
            'fire',
            'cutting',
            'energy',
            'laser',
            'plasma',
            'meson',
            'nuclear',
          ],
          'weapon.skill':
            'Format: "skillKey.specialityKey" (e.g. "guncombat.slug", "melee.blade", "heavyweapons.portable")',
        },
        armour: {
          'armour.form': ['standard', 'layered', 'stackable', 'natural'],
          note: 'stackable: stacks with other stackable armour. layered: can layer under others. natural: creature skin, always worn.',
        },
        hardware: {
          'hardware.system': [
            'general',
            'power',
            'armour',
            'fuel',
            'drive',
            'bridge',
            'sensor',
            'computer',
            'weapon',
            'defence',
            'stateroom',
            'common',
            'cargo',
          ],
          spacecraft_sheet_sections: {
            'Componentes (coreItems)': ['power', 'armour', 'fuel', 'drive'],
            'Puente (bridgeItems)': ['bridge', 'sensor', 'computer'],
            'Armas (weaponItems)': ['weapon', 'defence'],
            'Habitabilidad (livingItems)': ['stateroom', 'common'],
            'Carga (cargoItems)': ['cargo'],
            'General (generalItems)': ['general'],
          },
        },
        software: {
          'software.class': ['personal', 'ship'],
          'software.type': ['generic', 'interface', 'bonus'],
          note: 'class determines which SOFTWARE_EFFECTS apply. type=bonus enables skill/char bonuses.',
        },
        associate: {
          'associate.relationship': ['contact', 'ally', 'rival', 'enemy'],
        },
        base: {
          status: ['equipped', 'carried'],
          note: 'status is set from MgT2Item.EQUIPPED / MgT2Item.CARRIED constants.',
        },
        actor: {
          'weapon.scale_hint':
            'When adding a weapon to a spacecraft actor, set weapon.scale="spacecraft" to show in the ship weapons section.',
        },
      },
    };
  }

  /**
   * Resolve and apply requested targets without preventing the item workflow on failure.
   */

  private async applyItemTargets(
    actor: any,
    targets: string[] | undefined
  ): Promise<{ targeting: ItemTargetingResult; warnings: string[] }> {
    const targeting: ItemTargetingResult = {
      status: 'not-requested',
      requested: targets ? [...targets] : [],
      applied: [],
      unresolved: [],
      failed: [],
    };
    const warnings: string[] = [];

    if (!targets || targets.length === 0) {
      return { targeting, warnings };
    }

    targeting.status = 'failed';

    try {
      const currentCanvas = (globalThis as any).canvas;
      const scene = currentCanvas?.scene ?? (game.scenes as any)?.active;
      if (!scene) {
        targeting.unresolved.push(...targets);
        warnings.push('No active canvas scene is available to resolve the requested targets.');
        return { targeting, warnings };
      }

      const canvasTokens = Array.from((currentCanvas?.tokens?.placeables ?? []) as any[]);
      const controlledTokens = Array.from((currentCanvas?.tokens?.controlled ?? []) as any[]);
      const sceneTokenObjects = Array.from(((scene as any).tokens ?? []) as any[])
        .map((tokenDocument: any) => tokenDocument?.object)
        .filter(Boolean);

      const tokenId = (token: any): string =>
        String(token?.id ?? token?.document?.id ?? token?.document?._id ?? '');
      const tokenName = (token: any): string =>
        String(token?.name ?? token?.document?.name ?? token?.actor?.name ?? 'Unknown Token');
      const actingActorId = String(actor?.id ?? '');
      const tokenRepresentsActor = (token: any): boolean =>
        token?.actor === actor ||
        (actingActorId !== '' &&
          [token?.actor?.id, token?.document?.actorId, token?.actorId].some(
            candidateId => String(candidateId ?? '') === actingActorId
          ));
      const sortTokens = (tokensToSort: any[]): any[] =>
        [...tokensToSort].sort((a, b) => {
          const idComparison = tokenId(a).localeCompare(tokenId(b));
          return idComparison !== 0 ? idComparison : tokenName(a).localeCompare(tokenName(b));
        });

      const availableTokens: any[] = [];
      const seenTokens = new Set<any>();
      for (const token of [...canvasTokens, ...controlledTokens, ...sceneTokenObjects]) {
        const identity = tokenId(token) || token;
        if (!token || seenTokens.has(identity)) continue;
        seenTokens.add(identity);
        availableTokens.push(token);
      }

      const orderedTokens = sortTokens(availableTokens);
      const orderedControlledTokens = sortTokens(controlledTokens);
      const resolvedTargets: Array<{
        identifier: string;
        token: any;
        tokenId: string;
        tokenName: string;
      }> = [];

      for (const identifier of targets) {
        const normalizedIdentifier = identifier.toLowerCase();
        let token: any;

        if (normalizedIdentifier === 'self') {
          token =
            orderedControlledTokens.find(tokenRepresentsActor) ??
            orderedTokens.find(tokenRepresentsActor);
        } else {
          token = orderedTokens.find(candidate => {
            const candidateName = tokenName(candidate).toLowerCase();
            const candidateActorName = String(candidate?.actor?.name ?? '').toLowerCase();
            return (
              tokenId(candidate) === identifier ||
              candidateName === normalizedIdentifier ||
              candidateActorName === normalizedIdentifier
            );
          });
        }

        if (!token) {
          targeting.unresolved.push(identifier);
          warnings.push(`Target "${identifier}" was not found on the current canvas.`);
          continue;
        }

        resolvedTargets.push({
          identifier,
          token,
          tokenId: tokenId(token) || identifier,
          tokenName: tokenName(token),
        });
      }

      let hasAppliedTarget = false;
      for (const resolvedTarget of resolvedTargets) {
        try {
          if (typeof resolvedTarget.token?.setTarget !== 'function') {
            throw new Error('Token does not expose the public setTarget API');
          }

          await resolvedTarget.token.setTarget(true, {
            releaseOthers: !hasAppliedTarget,
          });
          targeting.applied.push({
            identifier: resolvedTarget.identifier,
            tokenId: resolvedTarget.tokenId,
            tokenName: resolvedTarget.tokenName,
          });
          hasAppliedTarget = true;
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown targeting error';
          targeting.failed.push({
            identifier: resolvedTarget.identifier,
            tokenId: resolvedTarget.tokenId,
            tokenName: resolvedTarget.tokenName,
            error: message,
          });
          warnings.push(`Failed to target "${resolvedTarget.identifier}": ${message}`);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown targeting error';
      warnings.push(`Target setup failed: ${message}`);
      for (const identifier of targets) {
        if (
          !targeting.applied.some(target => target.identifier === identifier) &&
          !targeting.unresolved.includes(identifier) &&
          !targeting.failed.some(target => target.identifier === identifier)
        ) {
          targeting.failed.push({ identifier, error: message });
        }
      }
    }

    if (
      targeting.applied.length === targets.length &&
      targeting.unresolved.length === 0 &&
      targeting.failed.length === 0
    ) {
      targeting.status = 'applied';
    } else if (targeting.applied.length > 0) {
      targeting.status = 'partial';
    } else {
      targeting.status = 'failed';
    }

    return { targeting, warnings };
  }

  /**
   * Use an item on a character (cast spell, use ability, consume item, etc.)
   * This triggers the item's default use behavior in Foundry VTT
   */
  async useItem(params: {
    actorIdentifier: string;
    itemIdentifier: string;
    targets?: string[] | undefined; // Target character/token names or IDs. "self" targets the caster.
    options?:
      | {
          consume?: boolean | undefined; // Whether to consume charges/uses
          configureDialog?: boolean | undefined; // Whether to show configuration dialog
          skipDialog?: boolean | undefined; // Skip confirmation dialogs (default: true for MCP)
          spellLevel?: number | undefined; // For spells: cast at higher level
          versatile?: boolean | undefined; // For versatile weapons: use versatile damage
        }
      | undefined;
  }): Promise<{
    success: boolean;
    status?: string;
    message: string;
    itemName?: string;
    actorName?: string;
    targets?: string[];
    targeting: ItemTargetingResult;
    warnings?: string[];
    requiresGMInteraction?: boolean;
  }> {
    validateFoundryState();

    const { actorIdentifier, itemIdentifier, targets, options = {} } = params;

    // Find the actor
    const actor = this.access.characters.findActorByIdentifier(actorIdentifier);
    if (!actor) {
      throw new Error(`Actor not found: ${actorIdentifier}`);
    }

    // Find the item on the actor
    const item = actor.items.find(
      (i: any) => i.id === itemIdentifier || i.name.toLowerCase() === itemIdentifier.toLowerCase()
    );

    if (!item) {
      throw new Error(`Item "${itemIdentifier}" not found on actor "${actor.name}"`);
    }

    const itemAny = item;
    const systemId = (game.system as any).id;

    const { targeting, warnings } = await this.applyItemTargets(actor, targets);
    const resolvedTargetNames = targeting.applied.map(target => target.tokenName);

    try {
      // For items that may show dialogs (spells with choices, etc.),
      // we fire-and-forget to avoid timeout issues. The GM will interact
      // with the dialog in Foundry, and the result appears in chat.

      // Check if item has a use() method (common in D&D 5e, PF2e)
      if (typeof itemAny.use === 'function') {
        // D&D 5e and similar systems
        // Only pass options that D&D 5e's item.use() expects
        const useOptions: Record<string, any> = {
          createMessage: true,
        };

        // D&D 5e specific options
        if (systemId === 'dnd5e') {
          useOptions.consumeResource = options.consume ?? true;
          useOptions.consumeSpellSlot = options.consume ?? true;
          useOptions.consumeUsage = options.consume ?? true;
          // Always show dialog so GM can make choices
          useOptions.configureDialog = true;
        }

        // Spell level for upcasting
        if (options.spellLevel !== undefined) {
          useOptions.slotLevel = options.spellLevel; // D&D 5e
          useOptions.level = options.spellLevel; // generic
        }

        // Fire and forget - don't await, as dialogs block the promise
        itemAny.use(useOptions).catch((err: Error) => {
          console.error(`[foundry-mcp-bridge] Error using item ${item.name}:`, err);
        });
      } else if (typeof itemAny.toChat === 'function') {
        // PF2e and some other systems use toChat
        if (typeof itemAny.toMessage === 'function') {
          itemAny.toMessage(undefined, { create: true }).catch((err: Error) => {
            console.error(`[foundry-mcp-bridge] Error using item ${item.name}:`, err);
          });
        } else {
          itemAny.toChat().catch((err: Error) => {
            console.error(`[foundry-mcp-bridge] Error using item ${item.name}:`, err);
          });
        }
      } else if (typeof itemAny.roll === 'function') {
        // Some items have a roll method
        itemAny.roll().catch((err: Error) => {
          console.error(`[foundry-mcp-bridge] Error using item ${item.name}:`, err);
        });
      } else if (systemId === 'dsa5') {
        // DSA5 specific handling
        if (
          item.type === 'spell' ||
          item.type === 'liturgy' ||
          item.type === 'ceremony' ||
          item.type === 'ritual'
        ) {
          if (typeof itemAny.postItem === 'function') {
            itemAny.postItem().catch((err: Error) => {
              console.error(`[foundry-mcp-bridge] Error using item ${item.name}:`, err);
            });
          } else if (typeof itemAny.setupEffect === 'function') {
            itemAny.setupEffect().catch((err: Error) => {
              console.error(`[foundry-mcp-bridge] Error using item ${item.name}:`, err);
            });
          } else {
            // Fallback: create a chat message describing the item
            const chatData = {
              user: game.user?.id,
              speaker: ChatMessage.getSpeaker({ actor }),
              content: `<h3>${item.name}</h3><p>${actor.name} uses ${item.name}.</p>`,
            };
            ChatMessage.create(chatData);
          }
        } else {
          if (typeof itemAny.postItem === 'function') {
            itemAny.postItem().catch((err: Error) => {
              console.error(`[foundry-mcp-bridge] Error using item ${item.name}:`, err);
            });
          }
        }
      } else {
        // Generic fallback: create a chat message
        const chatData = {
          user: game.user?.id,
          speaker: ChatMessage.getSpeaker({ actor }),
          content: `<h3>${item.name}</h3><p>${actor.name} uses ${item.name}.</p>`,
        };
        ChatMessage.create(chatData);
      }

      auditLog(
        'useItem',
        {
          actorId: actor.id,
          itemId: item.id,
          itemName: item.name,
          targets: resolvedTargetNames,
          targetingStatus: targeting.status,
          targetingWarnings: warnings,
        },
        'success'
      );

      const targetInfo =
        resolvedTargetNames.length > 0 ? ` targeting ${resolvedTargetNames.join(', ')}` : '';
      const targetingWarningInfo =
        warnings.length > 0 ? ` Targeting warning: ${warnings.join(' ')}` : '';

      const result: {
        success: boolean;
        status?: string;
        message: string;
        itemName?: string;
        actorName?: string;
        targets?: string[];
        targeting: ItemTargetingResult;
        warnings?: string[];
        requiresGMInteraction?: boolean;
      } = {
        success: true,
        status: 'initiated',
        message: `Item use initiated for ${actor.name} using ${item.name}${targetInfo}.${targetingWarningInfo} If a dialog appeared in Foundry VTT, the GM should select options and confirm. The result will appear in chat.`,
        itemName: item.name,
        actorName: actor.name,
        targeting,
        requiresGMInteraction: true,
      };

      if (resolvedTargetNames.length > 0) {
        result.targets = resolvedTargetNames;
      }
      if (warnings.length > 0) {
        result.warnings = warnings;
      }

      return result;
    } catch (error) {
      auditLog(
        'useItem',
        {
          actorId: actor.id,
          itemId: item.id,
        },
        'failure',
        error instanceof Error ? error.message : 'Unknown error'
      );

      throw new Error(
        `Failed to use item "${item.name}": ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}
