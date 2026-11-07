import { MODULE_ID, ERROR_MESSAGES } from '../constants.js';
import type { CharacterInfo, SpellcastingEntry, SpellInfo } from './types.js';
import { sanitizeData, validateFoundryState, auditLog } from './support.js';

import {
  formatPF2eActionCost,
  extractPF2eSpellSlots,
  extractPF2eSpellTargeting,
} from '../systems/pf2e/spellcasting.js';
import {
  extractDnD5eSpellSlots,
  extractDnD5eSpellTargeting,
} from '../systems/dnd5e/spellcasting.js';
import { extractDSA5SpellTargeting } from '../systems/dsa5/spellcasting.js';

export class CharacterService {
  /**
   * Get character/actor information by name or ID
   */
  async getCharacterInfo(identifier: string): Promise<CharacterInfo> {
    const tokenUuidMatch = /^Scene\.([^.]+)\.Token\.([^.]+)$/.exec(identifier);
    const scenes = Array.from(
      ((game.scenes as any)?.contents ?? game.scenes ?? []) as Iterable<any>
    );
    let actor: Actor | undefined;
    let token: any;
    let scene: any;

    // A full Token UUID is unambiguous and takes precedence over Actor lookup.
    if (tokenUuidMatch) {
      const [, sceneId, tokenId] = tokenUuidMatch;
      const uuidResolver = (globalThis as any).fromUuid;
      const document =
        typeof uuidResolver === 'function'
          ? await uuidResolver(identifier)
          : scenes.find(candidate => candidate.id === sceneId)?.tokens?.get(tokenId);

      if (!document) {
        throw new Error(`Token not found: ${identifier}`);
      }
      if (document.documentName !== 'Token') {
        throw new Error(`UUID does not resolve to a TokenDocument: ${identifier}`);
      }

      token = document;
      scene = document.parent;
      actor = document.actor;
      if (!actor) {
        throw new Error(`Token has no Actor: ${identifier}`);
      }
    }

    // Try to find by ID first, then by name
    if (!actor && identifier.length === 16) {
      // Foundry ID length
      actor = game.actors.get(identifier);
    }

    if (!actor) {
      actor = game.actors.find(a => a.name?.toLowerCase() === identifier.toLowerCase());
    }

    // Bare Token IDs are only safe when unique across all available Scenes.
    if (!actor) {
      const tokenMatches = scenes.flatMap(candidateScene => {
        const candidateToken = candidateScene.tokens?.get(identifier);
        return candidateToken ? [{ token: candidateToken, scene: candidateScene }] : [];
      });

      if (tokenMatches.length > 1) {
        const sceneIds = tokenMatches
          .map(match => match.scene.id)
          .sort()
          .join(', ');
        throw new Error(
          `Token ID "${identifier}" is ambiguous across Scenes (${sceneIds}); use a full Token UUID`
        );
      }

      if (tokenMatches.length === 1) {
        token = tokenMatches[0].token;
        scene = tokenMatches[0].scene;
        actor = token.actor;
        if (!actor) {
          throw new Error(`Token has no Actor: ${identifier}`);
        }
      }
    }

    if (!actor) {
      throw new Error(`${ERROR_MESSAGES.CHARACTER_NOT_FOUND}: ${identifier}`);
    }

    // Build character data structure
    const characterData: CharacterInfo = {
      id: actor.id || '',
      actorId: actor.id || '',
      isToken: !!token,
      ...(token?.id ? { tokenId: token.id } : {}),
      ...(scene?.id ? { sceneId: scene.id } : {}),
      name: actor.name || '',
      type: actor.type,
      ...(actor.img ? { img: actor.img } : {}),
      system: sanitizeData((actor as any).system),
      items: actor.items.map(item => {
        const itemData = item.toObject() as Record<string, any>;
        return {
          id: item.id,
          name: item.name,
          type: item.type,
          ...(item.img ? { img: item.img } : {}),
          system: sanitizeData(itemData.system ?? {}),
          effects: sanitizeData(itemData.effects ?? []),
        };
      }),
      effects: actor.effects.map(effect => {
        const eff = effect;
        const dur = eff.duration;
        const durRaw = eff._source?.duration;
        return {
          id: effect.id,
          name: eff.name || eff.label || 'Unknown Effect',
          ...(eff.icon ? { icon: eff.icon } : {}),
          disabled: eff.disabled,
          ...(dur
            ? {
                duration: {
                  type: dur.units ?? durRaw?.type ?? 'none',
                  duration: dur.seconds ?? durRaw?.duration,
                  remaining: dur.remaining,
                },
              }
            : {}),
        };
      }),
    };

    // Add PF2e-specific data if available
    const actorAny = actor as any;

    // Include actions (PF2e strikes, spells, etc.)
    if (actorAny.system?.actions) {
      characterData.actions = actorAny.system.actions.map((action: any) => ({
        name: action.label || action.name,
        type: action.type,
        ...(action.item ? { itemId: action.item.id } : {}),
        ...(action.variants
          ? {
              variants: action.variants.map((v: any) => ({
                label: v.label,
                ...(v.traits ? { traits: v.traits } : {}),
              })),
            }
          : {}),
        ...(action.ready !== undefined ? { ready: action.ready } : {}),
      }));
    }

    // Include item variants and toggles
    const itemVariants: any[] = [];
    const itemToggles: any[] = [];

    actor.items.forEach(item => {
      const itemAny = item;

      // Extract rule element variants (e.g., weapon variants, stance toggles)
      if (itemAny.system?.rules) {
        itemAny.system.rules.forEach((rule: any, ruleIndex: number) => {
          // Variants (ChoiceSet, RollOption with choices)
          if (rule.key === 'ChoiceSet' || (rule.key === 'RollOption' && rule.choices)) {
            itemVariants.push({
              itemId: item.id,
              itemName: item.name,
              ruleIndex,
              ruleKey: rule.key,
              label: rule.label || rule.prompt,
              ...(rule.selection ? { selected: rule.selection } : {}),
              ...(rule.choices ? { choices: rule.choices } : {}),
            });
          }

          // Toggles (RollOption toggleable, ToggleProperty)
          if ((rule.key === 'RollOption' && rule.toggleable) || rule.key === 'ToggleProperty') {
            itemToggles.push({
              itemId: item.id,
              itemName: item.name,
              ruleIndex,
              ruleKey: rule.key,
              label: rule.label,
              option: rule.option,
              ...(rule.value !== undefined ? { enabled: rule.value } : {}),
              ...(rule.toggleable !== undefined ? { toggleable: rule.toggleable } : {}),
            });
          }
        });
      }

      // Also check for item-level toggles (e.g., equipped, identified)
      if (itemAny.system?.equipped !== undefined) {
        itemToggles.push({
          itemId: item.id,
          itemName: item.name,
          type: 'equipped',
          enabled: itemAny.system.equipped,
        });
      }
    });

    // Add to character data if any found
    if (itemVariants.length > 0) {
      characterData.itemVariants = itemVariants;
    }
    if (itemToggles.length > 0) {
      characterData.itemToggles = itemToggles;
    }

    // Extract spellcasting data (PF2e and D&D 5e)
    const spellcastingEntries = this.extractSpellcastingData(actor);
    if (spellcastingEntries.length > 0) {
      characterData.spellcasting = spellcastingEntries;
    }

    return characterData;
  }

  /**
   * Search within a character's items, spells, actions, and effects
   * More token-efficient than getCharacterInfo when you need specific items
   */
  async searchCharacterItems(params: {
    characterIdentifier: string;
    query?: string | undefined;
    type?: string | undefined;
    category?: string | undefined;
    limit?: number | undefined;
  }): Promise<{
    characterId: string;
    characterName: string;
    query?: string;
    type?: string;
    category?: string;
    matches: Array<{
      id: string;
      name: string;
      type: string;
      description?: string;
      // For spells
      level?: number;
      prepared?: boolean;
      expended?: boolean;
      range?: string;
      target?: string;
      area?: string;
      actionCost?: string;
      traits?: string[];
      // For items
      quantity?: number;
      equipped?: boolean;
      invested?: boolean;
      // For actions
      actionType?: string;
      // For effects
      scope?: 'actor' | 'item';
      parentItemId?: string;
      parentItemName?: string;
    }>;
    totalMatches: number;
  }> {
    validateFoundryState();

    const { characterIdentifier, query, type, category, limit = 20 } = params;

    // Find the actor
    const actor = this.findActorByIdentifier(characterIdentifier);
    if (!actor) {
      throw new Error(`Character not found: ${characterIdentifier}`);
    }

    const actorAny = actor;
    const systemId = (game.system as any).id;
    const matches: Array<any> = [];

    // Normalize search query
    const searchQuery = query?.toLowerCase().trim();
    const searchType = type?.toLowerCase().trim();
    const searchCategory = category?.toLowerCase().trim();

    // Helper to check if text matches query (safely handles non-strings)
    const matchesQuery = (text: unknown): boolean => {
      if (!searchQuery) return true;
      if (typeof text !== 'string') return false;
      return text.toLowerCase().includes(searchQuery);
    };

    // Helper to check if item matches type filter
    const matchesType = (itemType: string): boolean => {
      if (!searchType) return true;
      return itemType.toLowerCase() === searchType;
    };

    // Search items
    for (const item of actor.items) {
      const itemSystem = item.system;

      // Check type filter
      if (!matchesType(item.type)) continue;

      // Check query filter (name or description)
      // Ensure description is a string (could be an object in some systems)
      let description = itemSystem?.description?.value || itemSystem?.description;
      if (typeof description !== 'string') description = '';
      if (!matchesQuery(item.name) && !matchesQuery(description)) continue;

      // Build result based on item type
      const result: any = {
        id: item.id,
        name: item.name,
        type: item.type,
      };

      // Add description (truncated for token efficiency)
      if (description) {
        // Strip HTML and truncate
        const plainText = description.replace(/<[^>]*>/g, '').trim();
        result.description =
          plainText.length > 300 ? `${plainText.substring(0, 300)}...` : plainText;
      }

      // Spell-specific fields
      if (item.type === 'spell') {
        result.level = itemSystem?.level?.value ?? itemSystem?.level ?? itemSystem?.rank ?? 0;
        const itemRaw = item._source?.system;
        result.prepared =
          itemSystem?.prepared ?? itemRaw?.preparation?.prepared ?? itemSystem?.location?.prepared;
        result.expended = itemSystem?.location?.expended;

        // Get targeting info
        if (systemId === 'pf2e') {
          const targeting = extractPF2eSpellTargeting(itemSystem);
          if (targeting.range) result.range = targeting.range;
          if (targeting.target) result.target = targeting.target;
          if (targeting.area) result.area = targeting.area;
          result.actionCost = formatPF2eActionCost(itemSystem?.time?.value);
          result.traits = itemSystem?.traits?.value || [];
        } else if (systemId === 'dnd5e') {
          const targeting = extractDnD5eSpellTargeting(itemSystem);
          if (targeting.range) result.range = targeting.range;
          if (targeting.target) result.target = targeting.target;
          if (targeting.area) result.area = targeting.area;
          result.actionCost = itemSystem?.activation?.type;
        } else if (systemId === 'dsa5') {
          const targeting = extractDSA5SpellTargeting(itemSystem);
          if (targeting.range) result.range = targeting.range;
          if (targeting.target) result.target = targeting.target;
          if (targeting.area) result.area = targeting.area;
          result.actionCost = itemSystem?.castingTime?.value;
        } else if (systemId === 'wfrp4e') {
          // WFRP4e spells use a Casting Number (CN) rather than levels/slots.
          if (itemSystem?.range?.value) result.range = itemSystem.range.value;
          if (itemSystem?.target?.value) result.target = itemSystem.target.value;
          const cn = itemSystem?.cn?.value;
          if (cn !== undefined && cn !== null) result.actionCost = `CN ${cn}`;
        }

        // Category filter for spells
        if (searchCategory) {
          const spellLevel = result.level || 0;
          const isPrepared = result.prepared !== false;
          const isCantrip = spellLevel === 0;
          const isFocus =
            itemSystem?.traits?.value?.includes('focus') || itemSystem?.category?.value === 'focus';

          if (searchCategory === 'cantrip' && !isCantrip) continue;
          if (searchCategory === 'prepared' && !isPrepared) continue;
          if (searchCategory === 'focus' && !isFocus) continue;
        }
      }

      // Equipment-specific fields
      if (['weapon', 'armor', 'equipment', 'consumable', 'backpack', 'loot'].includes(item.type)) {
        result.quantity = itemSystem?.quantity ?? 1;
        result.equipped = itemSystem?.equipped ?? false;
        result.invested = itemSystem?.equipped?.invested ?? itemSystem?.invested ?? undefined;

        // Category filter for equipment
        if (searchCategory) {
          if (searchCategory === 'equipped' && !result.equipped) continue;
          if (searchCategory === 'invested' && !result.invested) continue;
        }
      }

      // WFRP4e equipment fields (British 'armour'; 'trapping' is generic gear)
      if (
        systemId === 'wfrp4e' &&
        ['weapon', 'armour', 'trapping', 'ammunition', 'container'].includes(item.type)
      ) {
        result.quantity = itemSystem?.quantity?.value ?? 1;
        result.equipped = itemSystem?.equipped?.value ?? item.isEquipped ?? false;

        if (searchCategory === 'equipped' && !result.equipped) continue;
      }

      // WFRP4e prayer targeting (divine magic; item type 'prayer')
      if (systemId === 'wfrp4e' && item.type === 'prayer') {
        if (itemSystem?.range?.value) result.range = itemSystem.range.value;
        if (itemSystem?.target?.value) result.target = itemSystem.target.value;
      }

      // Feat/feature fields
      if (['feat', 'feature', 'class', 'ancestry', 'heritage', 'background'].includes(item.type)) {
        if (systemId === 'pf2e') {
          result.traits = itemSystem?.traits?.value || [];
          result.level = itemSystem?.level?.value ?? undefined;
          result.actionCost = formatPF2eActionCost(itemSystem?.actionType?.value);
        }
      }

      // Action fields
      if (item.type === 'action') {
        if (systemId === 'pf2e') {
          result.traits = itemSystem?.traits?.value || [];
          result.actionCost = formatPF2eActionCost(
            itemSystem?.actionType?.value || itemSystem?.actions?.value
          );
        }
      }

      matches.push(result);

      // Stop if we've reached the limit
      if (matches.length >= limit) break;
    }

    // Also search actions if type filter includes 'action' or is empty
    if (!searchType || searchType === 'action') {
      const actions =
        actorAny.system?.actions || actorAny.items?.filter((i: any) => i.type === 'action') || [];
      for (const action of actions) {
        if (matches.length >= limit) break;

        const actionName = action.name || action.label || '';
        if (!matchesQuery(actionName)) continue;

        const result: any = {
          id: action.id || action.slug || actionName,
          name: actionName,
          type: 'action',
          actionType: action.type || action.actionType || 'action',
        };

        if (systemId === 'pf2e') {
          result.traits = action.traits || [];
          result.actionCost = formatPF2eActionCost(action.actionCost?.value || action.actions);
        }

        matches.push(result);
      }
    }

    // Search effects if type filter includes 'effect' or is empty
    if (!searchType || searchType === 'effect') {
      const effects = actor.effects || [];
      for (const effect of effects) {
        if (matches.length >= limit) break;

        const effectAny = effect;
        if (!matchesQuery(effectAny.name || effectAny.label)) continue;
        const effectData = effectAny.toObject?.() ?? effectAny._source ?? effectAny;

        matches.push({
          id: effectAny.id,
          name: effectAny.name || effectAny.label,
          type: 'effect',
          description: effectData.description || undefined,
          scope: 'actor',
        });
      }

      for (const item of actor.items) {
        if (matches.length >= limit) break;

        for (const effect of item.effects || []) {
          if (matches.length >= limit) break;

          const effectAny = effect;
          if (!matchesQuery(effectAny.name || effectAny.label)) continue;
          const effectData = effectAny.toObject?.() ?? effectAny._source ?? effectAny;

          matches.push({
            id: effectAny.id,
            name: effectAny.name || effectAny.label,
            type: 'effect',
            description: effectData.description || undefined,
            scope: 'item',
            parentItemId: item.id,
            parentItemName: item.name,
          });
        }
      }
    }

    auditLog(
      'searchCharacterItems',
      {
        characterId: actor.id,
        query,
        type,
        category,
        matchCount: matches.length,
      },
      'success'
    );

    const result: {
      characterId: string;
      characterName: string;
      query?: string;
      type?: string;
      category?: string;
      matches: any[];
      totalMatches: number;
    } = {
      characterId: actor.id || '',
      characterName: actor.name || '',
      matches,
      totalMatches: matches.length,
    };

    if (query) result.query = query;
    if (type) result.type = type;
    if (category) result.category = category;

    return result;
  }

  /**
   * Extract spellcasting data from an actor (supports PF2e, D&D 5e, DSA5, and WFRP4e)
   */
  private extractSpellcastingData(actor: Actor): SpellcastingEntry[] {
    const entries: SpellcastingEntry[] = [];
    const actorAny = actor as any;
    const systemId = (game.system as any).id;

    // Get all spell items from the actor
    const spellItems = actor.items.filter(item => item.type === 'spell');

    if (systemId === 'pf2e') {
      // PF2e: Extract from spellcastingEntries
      const spellcastingEntries =
        actorAny.spellcasting?.contents ||
        actorAny.items?.filter((i: any) => i.type === 'spellcastingEntry') ||
        [];

      for (const entry of spellcastingEntries) {
        const entryData = entry.system || entry;
        const entrySpells: SpellInfo[] = [];

        // Get spells associated with this entry
        // In PF2e, spells have a location property pointing to their spellcasting entry
        const entryId = entry.id;
        const associatedSpells = spellItems.filter((spell: any) => {
          const spellSystem = spell.system;
          return spellSystem?.location?.value === entryId || spellSystem?.location === entryId;
        });

        for (const spell of associatedSpells) {
          const spellSystem = spell.system as any;
          const targeting = extractPF2eSpellTargeting(spellSystem);
          entrySpells.push({
            id: spell.id || '',
            name: spell.name || '',
            level: spellSystem?.level?.value ?? spellSystem?.rank ?? 0,
            prepared: spellSystem?.location?.prepared ?? true,
            expended: spellSystem?.location?.expended ?? false,
            traits: spellSystem?.traits?.value || [],
            actionCost: formatPF2eActionCost(spellSystem?.time?.value),
            range: targeting.range,
            target: targeting.target,
            area: targeting.area,
          });
        }

        // Also check for spells in the entry's spell collection
        if (entry.spells) {
          for (const [levelKey, levelData] of Object.entries(entry.spells as Record<string, any>)) {
            const spellsAtLevel = levelData?.value || levelData || [];
            if (Array.isArray(spellsAtLevel)) {
              for (const spellRef of spellsAtLevel) {
                // Skip if we already have this spell
                if (entrySpells.some(s => s.id === spellRef.id)) continue;

                const spellItem = actor.items.get(spellRef.id || spellRef);
                if (spellItem) {
                  const spellSystem = spellItem.system as any;
                  const targeting = extractPF2eSpellTargeting(spellSystem);
                  entrySpells.push({
                    id: spellItem.id || '',
                    name: spellItem.name || '',
                    level:
                      parseInt(levelKey.replace('spell', '')) || spellSystem?.level?.value || 0,
                    prepared: spellRef.prepared ?? true,
                    expended: spellRef.expended ?? false,
                    traits: spellSystem?.traits?.value || [],
                    actionCost: formatPF2eActionCost(spellSystem?.time?.value),
                    range: targeting.range,
                    target: targeting.target,
                    area: targeting.area,
                  });
                }
              }
            }
          }
        }

        entries.push({
          id: entry.id || '',
          name: entry.name || 'Spellcasting',
          tradition: entryData?.tradition?.value || entryData?.tradition || undefined,
          type: entryData?.prepared?.value || entryData?.prepared || 'prepared',
          ability: entryData?.ability?.value || entryData?.ability || undefined,
          dc: entryData?.spelldc?.dc || entryData?.dc?.value || undefined,
          attack: entryData?.spelldc?.value || entryData?.attack?.value || undefined,
          slots: extractPF2eSpellSlots(entryData),
          spells: entrySpells.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name)),
        });
      }

      // Also capture focus spells and innate spells that might not be in entries
      const focusSpells = spellItems.filter((spell: any) => {
        const spellSystem = spell.system;
        return (
          spellSystem?.traits?.value?.includes('focus') || spellSystem?.category?.value === 'focus'
        );
      });

      if (focusSpells.length > 0 && !entries.some(e => e.type === 'focus')) {
        entries.push({
          id: 'focus-spells',
          name: 'Focus Spells',
          type: 'focus',
          spells: focusSpells.map((spell: any) => {
            const spellSystem = spell.system;
            const targeting = extractPF2eSpellTargeting(spellSystem);
            return {
              id: spell.id || '',
              name: spell.name || '',
              level: spellSystem?.level?.value || 0,
              traits: spellSystem?.traits?.value || [],
              actionCost: formatPF2eActionCost(spellSystem?.time?.value),
              range: targeting.range,
              target: targeting.target,
              area: targeting.area,
            };
          }),
        });
      }
    } else if (systemId === 'dnd5e') {
      // D&D 5e: Extract from classes with spellcasting
      const classes = actor.items.filter(item => item.type === 'class');
      const spellSlots = actorAny.system?.spells || {};

      // Group spells by their source class or create a general entry
      const spellsByClass: Record<string, SpellInfo[]> = {};

      for (const spell of spellItems) {
        const spellSystem = spell.system as any;
        const spellRaw = (spell as any)._source?.system || spellSystem;
        const sourceItem = spellSystem?.sourceItem;
        const sourceClass =
          (sourceItem
            ? typeof sourceItem === 'string'
              ? sourceItem
              : sourceItem.identifier || sourceItem.id
            : spellRaw?.sourceClass) || 'general';

        if (!spellsByClass[sourceClass]) {
          spellsByClass[sourceClass] = [];
        }

        const targeting = extractDnD5eSpellTargeting(spellSystem);
        spellsByClass[sourceClass].push({
          id: spell.id || '',
          name: spell.name || '',
          level: spellSystem?.level || 0,
          prepared: spellSystem?.prepared ?? spellRaw?.preparation?.prepared ?? true,
          traits: [], // D&D 5e doesn't use traits the same way
          actionCost: spellSystem?.activation?.type || undefined,
          range: targeting.range,
          target: targeting.target,
          area: targeting.area,
        });
      }

      // Create entries for each spellcasting class
      for (const classItem of classes) {
        const classSystem = classItem.system as any;
        if (
          classSystem?.spellcasting?.progression &&
          classSystem.spellcasting.progression !== 'none'
        ) {
          const className = classItem.name || 'Unknown';
          const classSpells =
            spellsByClass[classItem.id || ''] || spellsByClass[className.toLowerCase()] || [];

          entries.push({
            id: classItem.id || '',
            name: `${className} Spellcasting`,
            type: classSystem?.spellcasting?.type || 'prepared',
            ability: classSystem?.spellcasting?.ability || undefined,
            slots: extractDnD5eSpellSlots(spellSlots),
            spells: classSpells.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name)),
          });
        }
      }

      // If no class-based entries found but we have spells, create a general entry
      if (entries.length === 0 && spellItems.length > 0) {
        const allSpells: SpellInfo[] = [];
        for (const spell of spellItems) {
          const spellSystem = spell.system as any;
          const targeting = extractDnD5eSpellTargeting(spellSystem);
          allSpells.push({
            id: spell.id || '',
            name: spell.name || '',
            level: spellSystem?.level || 0,
            prepared: spellSystem?.preparation?.prepared ?? true,
            actionCost: spellSystem?.activation?.type || undefined,
            range: targeting.range,
            target: targeting.target,
            area: targeting.area,
          });
        }

        entries.push({
          id: 'spellcasting',
          name: 'Spellcasting',
          type: 'prepared',
          slots: extractDnD5eSpellSlots(spellSlots),
          spells: allSpells.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name)),
        });
      }
    } else if (systemId === 'dsa5') {
      // DSA5: Extract Zauber (spells), Liturgien (liturgies), Zeremonien (ceremonies), Rituale (rituals)
      const astralSpells = actor.items.filter(item => item.type === 'spell');
      const karmaSpells = actor.items.filter(item => ['liturgy', 'ceremony'].includes(item.type));
      const rituals = actor.items.filter(item => item.type === 'ritual');

      // Get AsP and KaP from actor
      const asp = actorAny.system?.status?.astralenergy || actorAny.system?.astralenergy;
      const kap = actorAny.system?.status?.karmaenergy || actorAny.system?.karmaenergy;

      // Zauber (Arcane spells using AsP)
      if (astralSpells.length > 0) {
        entries.push({
          id: 'zauber',
          name: 'Zauber (Spells)',
          type: 'arcane',
          slots: asp
            ? {
                asp: { value: asp.value ?? 0, max: asp.max ?? 0 },
              }
            : undefined,
          spells: astralSpells
            .map((spell: any) => {
              const spellSystem = spell.system;
              const targeting = extractDSA5SpellTargeting(spellSystem);
              return {
                id: spell.id || '',
                name: spell.name || '',
                level: spellSystem?.level?.value ?? spellSystem?.level ?? 0,
                traits: spellSystem?.effect?.attributes || [],
                actionCost: spellSystem?.castingTime?.value || undefined,
                range: targeting.range,
                target: targeting.target,
                area: targeting.area,
              };
            })
            .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name)),
        });
      }

      // Liturgien & Zeremonien (Divine spells using KaP)
      if (karmaSpells.length > 0) {
        entries.push({
          id: 'liturgien',
          name: 'Liturgien & Zeremonien (Liturgies)',
          type: 'divine',
          slots: kap
            ? {
                kap: { value: kap.value ?? 0, max: kap.max ?? 0 },
              }
            : undefined,
          spells: karmaSpells
            .map((spell: any) => {
              const spellSystem = spell.system;
              const targeting = extractDSA5SpellTargeting(spellSystem);
              return {
                id: spell.id || '',
                name: spell.name || '',
                level: spellSystem?.level?.value ?? spellSystem?.level ?? 0,
                traits: spellSystem?.effect?.attributes || [],
                actionCost: spellSystem?.castingTime?.value || undefined,
                range: targeting.range,
                target: targeting.target,
                area: targeting.area,
              };
            })
            .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name)),
        });
      }

      // Rituale (Rituals - can use either AsP or KaP depending on tradition)
      if (rituals.length > 0) {
        entries.push({
          id: 'rituale',
          name: 'Rituale (Rituals)',
          type: 'ritual',
          spells: rituals
            .map((spell: any) => {
              const spellSystem = spell.system;
              const targeting = extractDSA5SpellTargeting(spellSystem);
              return {
                id: spell.id || '',
                name: spell.name || '',
                level: spellSystem?.level?.value ?? spellSystem?.level ?? 0,
                traits: spellSystem?.effect?.attributes || [],
                actionCost: spellSystem?.castingTime?.value || undefined,
                range: targeting.range,
                target: targeting.target,
                area: targeting.area,
              };
            })
            .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name)),
        });
      }
    } else if (systemId === 'wfrp4e') {
      // WFRP4e: arcane spells grouped by Lore, divine prayers grouped by God.
      // WFRP4e has no spell levels or slots; spells use a Casting Number (CN).
      const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

      // Arcane spells, grouped by lore
      const spellsByLore = new Map<string, SpellInfo[]>();
      for (const spell of actor.items.filter(item => item.type === 'spell')) {
        const spellSystem = spell.system as any;
        const loreRaw = spellSystem?.lore?.value;
        const lore = String((Array.isArray(loreRaw) ? loreRaw[0] : loreRaw) || 'arcane');
        const cn = spellSystem?.cn?.value;
        const info: SpellInfo = {
          id: spell.id || '',
          name: spell.name || '',
          level: 0,
          actionCost: cn !== undefined && cn !== null ? `CN ${cn}` : undefined,
          range: spellSystem?.range?.value || undefined,
          target: spellSystem?.target?.value || undefined,
        };
        if (!spellsByLore.has(lore)) spellsByLore.set(lore, []);
        spellsByLore.get(lore)!.push(info);
      }
      for (const [lore, loreSpells] of spellsByLore) {
        entries.push({
          id: `lore-${lore}`,
          name: `Lore of ${cap(lore)}`,
          type: 'arcane',
          tradition: 'arcane',
          spells: loreSpells.sort((a, b) => a.name.localeCompare(b.name)),
        });
      }

      // Divine prayers, grouped by god
      const prayersByGod = new Map<string, SpellInfo[]>();
      for (const prayer of actor.items.filter(item => item.type === 'prayer')) {
        const praySystem = prayer.system as any;
        const god = String(praySystem?.god?.value || 'divine');
        const info: SpellInfo = {
          id: prayer.id || '',
          name: prayer.name || '',
          level: 0,
          range: praySystem?.range?.value || undefined,
          target: praySystem?.target?.value || undefined,
        };
        if (!prayersByGod.has(god)) prayersByGod.set(god, []);
        prayersByGod.get(god)!.push(info);
      }
      for (const [god, godPrayers] of prayersByGod) {
        entries.push({
          id: `prayers-${god}`,
          name: god === 'divine' ? 'Prayers' : `Prayers (${cap(god)})`,
          type: 'divine',
          tradition: 'divine',
          spells: godPrayers.sort((a, b) => a.name.localeCompare(b.name)),
        });
      }
    }

    return entries;
  }

  /**
   * List all actors with basic information
   */
  async listActors(): Promise<Array<{ id: string; name: string; type: string; img?: string }>> {
    return game.actors.map(actor => ({
      id: actor.id || '',
      name: actor.name || '',
      type: actor.type,
      ...(actor.img ? { img: actor.img } : {}),
    }));
  }

  /**
   * Find actor by name or ID
   */
  findActorByIdentifier(identifier: string): any {
    const worldActor =
      game.actors?.get(identifier) ||
      game.actors?.getName(identifier) ||
      Array.from(game.actors || []).find(a =>
        a.name?.toLowerCase().includes(identifier.toLowerCase())
      );
    if (worldActor) return worldActor;

    // Fallback: a scene Token id. For an unlinked token this returns the token's
    // own synthetic (delta-backed) actor, so edits persist to that token alone —
    // the way to tweak one copy on a map without touching the prototype or its
    // siblings. (For a linked token this is the world actor, same as above.)
    for (const scene of (game.scenes as any) || []) {
      const token = scene.tokens?.get(identifier);
      if (token?.actor) return token.actor;
    }
    return undefined;
  }

  /**
   * Get friendly NPCs from current scene
   */
  async getFriendlyNPCs(): Promise<Array<{ id: string; name: string }>> {
    validateFoundryState();

    try {
      const scene = game.scenes?.find(s => s.active);
      if (!scene) {
        return [];
      }

      const friendlyTokens = scene.tokens.filter(
        (token: any) => token.disposition === 1 // FRIENDLY disposition
      );

      return friendlyTokens
        .map((token: any) => ({
          id: token.actor?.id || token.id || '',
          name: token.name || token.actor?.name || 'Unknown',
        }))
        .filter(t => t.id);
    } catch (error) {
      console.error(`[${MODULE_ID}] Error getting friendly NPCs:`, error);
      return [];
    }
  }

  /**
   * Get party characters (player-owned actors)
   */
  async getPartyCharacters(): Promise<Array<{ id: string; name: string }>> {
    validateFoundryState();

    try {
      const partyCharacters = Array.from(game.actors || []).filter(
        actor => actor.hasPlayerOwner && actor.type === 'character'
      );

      return partyCharacters
        .map(actor => ({
          id: actor.id || '',
          name: actor.name || 'Unknown',
        }))
        .filter(c => c.id);
    } catch (error) {
      console.error(`[${MODULE_ID}] Error getting party characters:`, error);
      return [];
    }
  }

  /**
   * Find single actor by identifier
   */
  async findActor(data: { identifier: string }): Promise<{ id: string; name: string } | null> {
    validateFoundryState();

    try {
      const actor = this.findActorByIdentifier(data.identifier);
      return actor ? { id: actor.id, name: actor.name } : null;
    } catch (error) {
      console.error(`[${MODULE_ID}] Error finding actor:`, error);
      return null;
    }
  }

  // ===== PHASE 7: CHARACTER ENTITY AND TOKEN MANIPULATION METHODS =====

  /**
   * Get detailed information about a specific entity within a character (item, action, or effect)
   */
  async getCharacterEntity(data: {
    characterIdentifier: string;
    entityIdentifier: string;
  }): Promise<any> {
    validateFoundryState();

    try {
      const serializeDocument = (document: any): Record<string, any> => {
        const source = document?.toObject?.() ?? document?._source ?? document ?? {};
        return source as Record<string, any>;
      };

      // Find the character first
      const actors = game.actors?.contents || [];
      const character = actors.find(
        (actor: any) =>
          actor.id === data.characterIdentifier ||
          actor.name?.toLowerCase() === data.characterIdentifier.toLowerCase()
      );

      if (!character) {
        throw new Error(`Character not found: "${data.characterIdentifier}"`);
      }

      // Search in items first (by ID or name)
      const items = character.items?.contents || [];
      let entity = items.find(
        (item: any) =>
          item.id === data.entityIdentifier ||
          item.name?.toLowerCase() === data.entityIdentifier.toLowerCase()
      );

      if (entity) {
        const itemData = serializeDocument(entity);
        const itemSystem = sanitizeData(itemData.system ?? {});
        if (Object.prototype.hasOwnProperty.call(itemData.system ?? {}, 'advancement')) {
          itemSystem.advancement = sanitizeData(itemData.system.advancement);
        }
        return {
          success: true,
          entityType: 'item',
          entity: {
            id: entity.id,
            name: entity.name,
            type: entity.type,
            img: entity.img,
            description: itemSystem.description?.value || itemSystem.description || '',
            system: itemSystem,
            effects: itemData.effects ?? [],
          },
        };
      }

      // Search in actions (for systems that have actions as separate entities)
      if ((character as any).system?.actions) {
        const actions = Array.isArray((character as any).system.actions)
          ? (character as any).system.actions
          : Object.values((character as any).system.actions || {});

        entity = actions.find(
          (action: any) =>
            action.id === data.entityIdentifier ||
            (action.name || action.label)?.toLowerCase() === data.entityIdentifier.toLowerCase()
        );

        if (entity) {
          const actionData = sanitizeData(serializeDocument(entity));
          return {
            success: true,
            entityType: 'action',
            entity: {
              ...actionData,
              name: entity.label || entity.name,
              ...(entity.item ? { itemId: entity.item.id } : {}),
            },
          };
        }
      }

      // Search in actor-owned effects
      const effects = character.effects?.contents || [];
      entity = effects.find(
        (effect: any) =>
          effect.id === data.entityIdentifier ||
          (effect.name || effect.label)?.toLowerCase() === data.entityIdentifier.toLowerCase()
      );

      if (entity) {
        const effectData = serializeDocument(entity);
        return {
          success: true,
          entityType: 'effect',
          entity: {
            ...effectData,
            id: entity.id,
            name: entity.name || entity.label,
            scope: 'actor',
          },
        };
      }

      // Search in Item-owned effects
      for (const item of items) {
        const itemEffects = item.effects?.contents || Array.from(item.effects || []);
        entity = itemEffects.find(
          (effect: any) =>
            effect.id === data.entityIdentifier ||
            (effect.name || effect.label)?.toLowerCase() === data.entityIdentifier.toLowerCase()
        );

        if (entity) {
          const effectData = serializeDocument(entity);
          return {
            success: true,
            entityType: 'effect',
            entity: {
              ...effectData,
              id: entity.id,
              name: entity.name || entity.label,
              scope: 'item',
              parentItemId: item.id,
              parentItemName: item.name,
            },
          };
        }
      }

      throw new Error(
        `Entity not found: "${data.entityIdentifier}" in character "${character.name}"`
      );
    } catch (error) {
      throw new Error(
        `Failed to get character entity: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}
