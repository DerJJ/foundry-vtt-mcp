import { MODULE_ID } from '../constants.js';
import type {
  CompendiumSearchResult,
  DnD5eCreatureIndex,
  PF2eCreatureIndex,
  CosmereRpgCreatureIndex,
  MGT2eCreatureIndex,
  EnhancedCreatureIndex,
  CompendiumEntryFull,
} from './types.js';
import { PersistentCreatureIndex } from './creature-index.js';
import { sanitizeData, validateFoundryState } from './support.js';

import { passesMGT2eCriteria } from '../systems/mgt2e/creature-criteria.js';
import { passesCosmereRpgCriteria } from '../systems/cosmere-rpg/creature-criteria.js';
import { passesDnD5eCriteria } from '../systems/dnd5e/creature-criteria.js';
import { passesPF2eCriteria } from '../systems/pf2e/creature-criteria.js';

export class CompendiumService {
  private persistentIndex: PersistentCreatureIndex = new PersistentCreatureIndex();

  /**
   * Force rebuild of enhanced creature index
   */
  async rebuildEnhancedCreatureIndex(): Promise<{
    success: boolean;
    totalCreatures: number;
    message: string;
  }> {
    try {
      const creatures = await this.persistentIndex.rebuildIndex();
      return {
        success: true,
        totalCreatures: creatures.length,
        message: `Enhanced creature index rebuilt: ${creatures.length} creatures indexed from all packs`,
      };
    } catch (error) {
      console.error(`[${MODULE_ID}] Failed to rebuild enhanced creature index:`, error);
      return {
        success: false,
        totalCreatures: 0,
        message: `Failed to rebuild index: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Search compendium packs for items matching query with optional filters
   */
  async searchCompendium(
    query: string,
    packType?: string,
    filters?: {
      challengeRating?: number | { min?: number; max?: number };
      creatureType?: string;
      size?: string;
      alignment?: string;
      hasLegendaryActions?: boolean;
      spellcaster?: boolean;
    }
  ): Promise<CompendiumSearchResult[]> {
    // Add defensive checks for query parameter
    if (!query || typeof query !== 'string' || query.trim().length < 2) {
      throw new Error('Search query must be a string with at least 2 characters');
    }

    // ENHANCED SEARCH: If we have creature-specific filters and Actor packType, use enhanced index
    if (
      filters &&
      packType === 'Actor' &&
      (filters.challengeRating || filters.creatureType || filters.hasLegendaryActions)
    ) {
      // Check if enhanced creature index is enabled
      const enhancedIndexEnabled = game.settings.get(MODULE_ID, 'enableEnhancedCreatureIndex');

      if (enhancedIndexEnabled) {
        try {
          // Convert search criteria and use enhanced search
          const criteria: any = { limit: 100 }; // Default limit for search

          if (filters.challengeRating) criteria.challengeRating = filters.challengeRating;
          if (filters.creatureType) criteria.creatureType = filters.creatureType;
          if (filters.size) criteria.size = filters.size;
          if (filters.hasLegendaryActions)
            criteria.hasLegendaryActions = filters.hasLegendaryActions;

          const enhancedResult = await this.listCreaturesByCriteria(criteria);

          // No name filtering needed - trust the enhanced creature index!
          const filteredResults = enhancedResult.creatures;

          // Convert to CompendiumSearchResult format
          return filteredResults.map(
            creature =>
              ({
                id: creature.id || creature.name,
                name: creature.name,
                type: creature.type || 'npc',
                pack: creature.pack,
                packLabel: creature.packLabel || creature.pack,
                description: creature.description || '',
                hasImage: creature.hasImage || !!creature.img,
                summary: `CR ${creature.challengeRating} ${creature.creatureType} from ${creature.packLabel}`,
                // Enhanced data (not part of interface but will be included)
                challengeRating: creature.challengeRating,
                creatureType: creature.creatureType,
                size: creature.size,
                hasLegendaryActions: creature.hasLegendaryActions,
              }) as CompendiumSearchResult & {
                challengeRating: number;
                creatureType: string;
                size: string;
                hasLegendaryActions: boolean;
              }
          );
        } catch (error) {
          console.warn(
            `[${MODULE_ID}] Enhanced search failed, falling back to basic search:`,
            error
          );
          // Continue to basic search below
        }
      }
    }

    const results: CompendiumSearchResult[] = [];
    const cleanQuery = query.toLowerCase().trim();
    const searchTerms = cleanQuery
      .split(' ')
      .filter(term => term && typeof term === 'string' && term.length > 0);

    if (searchTerms.length === 0) {
      throw new Error('Search query must contain valid search terms');
    }

    // Filter packs by type if specified
    const packs = Array.from(game.packs.values()).filter(pack => {
      if (packType && pack.metadata.type !== packType) {
        return false;
      }
      return pack.metadata.type !== 'Scene'; // Exclude scene packs for safety
    });

    for (const pack of packs) {
      try {
        // Ensure pack index is loaded.
        // In Foundry v13 getIndex() returns the index Collection; always call it
        // and use the return value so we don't depend on pack.indexed state.
        let packIndex: any;
        try {
          packIndex = await (pack as any).getIndex({ fields: ['name', 'img', 'type'] });
        } catch {
          // Fallback: older Foundry API without fields option
          packIndex = await (pack as any).getIndex();
        }

        // Use the returned index if available, otherwise fall back to pack.index
        const indexSource =
          packIndex && typeof packIndex.values === 'function' ? packIndex : (pack as any).index;

        const entriesToSearch = Array.from((indexSource as any).values());

        for (const entry of entriesToSearch) {
          try {
            // Type assertion and comprehensive safety checks for entry properties
            const typedEntry = entry as any;
            if (
              !typedEntry?.name ||
              typeof typedEntry.name !== 'string' ||
              typedEntry.name.trim().length === 0
            ) {
              continue;
            }

            // Ensure searchTerms are valid before using them
            if (!searchTerms || !Array.isArray(searchTerms) || searchTerms.length === 0) {
              continue;
            }

            // Use already created typedEntry

            const entryNameLower = typedEntry.name.toLowerCase();
            const nameMatch = searchTerms.every(term => {
              if (!term || typeof term !== 'string') {
                return false;
              }
              return entryNameLower.includes(term);
            });

            if (nameMatch) {
              // For Actor packs with filters, use simple name/description matching
              if (
                filters &&
                this.shouldApplyFilters(entry, filters) &&
                pack.metadata.type === 'Actor'
              ) {
                // Convert filters to search criteria for compatibility
                const searchCriteria: any = {};

                if (filters.challengeRating) {
                  const searchTerms = [];
                  if (typeof filters.challengeRating === 'number') {
                    if (filters.challengeRating >= 15) {
                      searchTerms.push('ancient', 'legendary', 'elder', 'greater');
                    } else if (filters.challengeRating >= 10) {
                      searchTerms.push('adult', 'warlord', 'champion', 'master');
                    } else if (filters.challengeRating >= 5) {
                      searchTerms.push('captain', 'knight', 'priest', 'mage');
                    } else {
                      searchTerms.push('guard', 'soldier', 'warrior', 'scout');
                    }
                  }
                  searchCriteria.searchTerms = searchTerms;
                }

                if (filters.creatureType) {
                  const typeTerms = [filters.creatureType];
                  if (filters.creatureType.toLowerCase() === 'humanoid') {
                    typeTerms.push('human', 'elf', 'dwarf', 'orc', 'goblin');
                  }
                  searchCriteria.searchTerms = [
                    ...(searchCriteria.searchTerms || []),
                    ...typeTerms,
                  ];
                }

                if (!this.matchesSearchCriteria(typedEntry, searchCriteria)) {
                  continue;
                }
              }

              // Standard index entry result
              results.push({
                id: typedEntry._id || '',
                name: typedEntry.name,
                type: typedEntry.type || 'unknown',
                img: typedEntry.img || undefined,
                pack: pack.metadata.id,
                packLabel: pack.metadata.label,
                description: typedEntry.description || '',
                hasImage: !!typedEntry.img,
                summary: `${typedEntry.type} from ${pack.metadata.label}`,
              });
            }
          } catch (entryError) {
            // Log individual entry errors but continue processing
            console.warn(
              `[${MODULE_ID}] Error processing entry in pack ${pack.metadata.id}:`,
              entryError
            );
            continue;
          }

          // Limit results per pack to prevent overwhelming responses
          if (results.length >= 100) break;
        }
      } catch (error) {
        console.warn(`[${MODULE_ID}] Failed to search pack ${pack.metadata.id}:`, error);
      }

      // Global limit to prevent memory issues
      if (results.length >= 100) break;
    }

    // Sort results by relevance with enhanced ranking for filtered searches
    results.sort((a, b) => {
      // Exact name matches first
      const aExact = a.name.toLowerCase() === query.toLowerCase();
      const bExact = b.name.toLowerCase() === query.toLowerCase();
      if (aExact && !bExact) return -1;
      if (!aExact && bExact) return 1;

      // If filters are used, prioritize by filter match quality
      if (filters) {
        const aScore = this.calculateRelevanceScore(a, filters, query);
        const bScore = this.calculateRelevanceScore(b, filters, query);
        if (aScore !== bScore) return bScore - aScore; // Higher score first
      }

      // Fallback to alphabetical
      return a.name.localeCompare(b.name);
    });

    return results.slice(0, 50); // Final limit
  }

  /**
   * Check if filters should be applied to this entry
   */
  private shouldApplyFilters(entry: any, filters: any): boolean {
    // Only apply filters to Actor entries (which includes NPCs/monsters/creatures)
    if (entry.type !== 'npc' && entry.type !== 'character' && entry.type !== 'creature') {
      return false;
    }

    // Check if any filters are actually specified
    return Object.keys(filters).some(key => filters[key] !== undefined);
  }

  /**
   * Check if entry passes all specified filters
   * @unused - Replaced with simple index-only approach
   */
  // @ts-ignore - Unused method kept for compatibility
  private passesFilters(
    entry: any,
    filters: {
      challengeRating?: number | { min?: number; max?: number };
      creatureType?: string;
      size?: string;
      alignment?: string;
      hasLegendaryActions?: boolean;
      spellcaster?: boolean;
    }
  ): boolean {
    const system = entry.system || {};

    // Challenge Rating filter
    if (filters.challengeRating !== undefined) {
      // Try multiple possible CR locations in D&D 5e data structure
      let entryCR =
        system.details?.cr?.value || system.details?.cr || system.cr?.value || system.cr || 0;

      // Handle fractional CRs (common in D&D 5e)
      if (typeof entryCR === 'string') {
        if (entryCR === '1/8') entryCR = 0.125;
        else if (entryCR === '1/4') entryCR = 0.25;
        else if (entryCR === '1/2') entryCR = 0.5;
        else entryCR = parseFloat(entryCR) || 0;
      }

      if (typeof filters.challengeRating === 'number') {
        // Exact CR match
        if (entryCR !== filters.challengeRating) {
          return false;
        }
      } else if (typeof filters.challengeRating === 'object') {
        // CR range
        const { min, max } = filters.challengeRating;
        if (min !== undefined && entryCR < min) {
          return false;
        }
        if (max !== undefined && entryCR > max) {
          return false;
        }
      }
    }

    // Creature Type filter
    if (filters.creatureType) {
      const entryType = system.details?.type?.value || system.type?.value || '';
      if (entryType.toLowerCase() !== filters.creatureType.toLowerCase()) {
        return false;
      }
    }

    // Size filter
    if (filters.size) {
      const entrySize = system.traits?.size || system.size || '';
      if (entrySize.toLowerCase() !== filters.size.toLowerCase()) {
        return false;
      }
    }

    // Alignment filter
    if (filters.alignment) {
      const entryAlignment = system.details?.alignment || system.alignment || '';
      if (!entryAlignment.toLowerCase().includes(filters.alignment.toLowerCase())) {
        return false;
      }
    }

    // Legendary Actions filter
    if (filters.hasLegendaryActions !== undefined) {
      const hasLegendary = !!(
        system.resources?.legact ||
        system.legendary ||
        (system.resources?.legres && system.resources.legres.value > 0)
      );
      if (hasLegendary !== filters.hasLegendaryActions) {
        return false;
      }
    }

    // Spellcaster filter
    if (filters.spellcaster !== undefined) {
      const isSpellcaster = !!(
        system.spells ||
        system.attributes?.spellcasting ||
        (system.details?.spellLevel && system.details.spellLevel > 0)
      );
      if (isSpellcaster !== filters.spellcaster) {
        return false;
      }
    }

    return true;
  }

  /**
   * Calculate relevance score for search result ranking
   */
  private calculateRelevanceScore(entry: any, filters: any, query: string): number {
    let score = 0;
    const system = entry.system || {};

    // Bonus for creature type match (high importance for encounter building)
    if (filters.creatureType) {
      const entryType = system.details?.type?.value || system.type?.value || '';
      if (entryType.toLowerCase() === filters.creatureType.toLowerCase()) {
        score += 20;
      }
    }

    // Bonus for CR match (exact match gets higher score than range)
    if (filters.challengeRating !== undefined) {
      const entryCR = system.details?.cr || system.cr || 0;
      if (typeof filters.challengeRating === 'number') {
        if (entryCR === filters.challengeRating) score += 15;
      } else if (typeof filters.challengeRating === 'object') {
        const { min, max } = filters.challengeRating;
        if (min !== undefined && max !== undefined) {
          // Bonus for being in range, extra for being in middle of range
          if (entryCR >= min && entryCR <= max) {
            score += 10;
            const rangeMid = (min + max) / 2;
            const distFromMid = Math.abs(entryCR - rangeMid);
            score += Math.max(0, 5 - distFromMid); // Up to 5 bonus for being near middle
          }
        }
      }
    }

    // Bonus for common creature names (better for encounters)
    const commonNames = [
      'knight',
      'warrior',
      'guard',
      'soldier',
      'mage',
      'priest',
      'bandit',
      'orc',
      'goblin',
      'dragon',
    ];
    const lowerName = entry.name.toLowerCase();
    if (commonNames.some(name => lowerName.includes(name))) {
      score += 5;
    }

    // Bonus for query term matches in name
    const queryTerms = query.toLowerCase().split(' ');
    for (const term of queryTerms) {
      if (term.length > 2 && lowerName.includes(term)) {
        score += 3;
      }
    }

    return score;
  }

  /**
   * List creatures by criteria using enhanced persistent index - optimized for instant filtering
   */
  async listCreaturesByCriteria(criteria: {
    challengeRating?: number | { min?: number; max?: number };
    creatureType?: string;
    size?: string;
    hasSpells?: boolean;
    hasLegendaryActions?: boolean;
    limit?: number;
  }): Promise<{ creatures: any[]; searchSummary: any }> {
    const limit = criteria.limit || 500;

    // Check if enhanced creature index is enabled
    const enhancedIndexEnabled = game.settings.get(MODULE_ID, 'enableEnhancedCreatureIndex');

    if (!enhancedIndexEnabled) {
      return this.fallbackBasicCreatureSearch(criteria, limit);
    }

    try {
      // Get enhanced creature index (builds if needed)
      const enhancedCreatures = await this.persistentIndex.getEnhancedIndex();

      // Apply filters to enhanced data
      let filteredCreatures = enhancedCreatures.filter(creature =>
        this.passesEnhancedCriteria(creature, criteria)
      );

      // Sort by power level then name for consistent ordering (system-aware).
      // Power-level dial: tier (cosmere), level (pf2e), challengeRating (dnd5e).
      const powerLevel = (c: EnhancedCreatureIndex): number => {
        if ('hits' in c && 'hasPsionics' in c) return (c as MGT2eCreatureIndex).hits;
        if ('tier' in c) return (c as CosmereRpgCreatureIndex).tier;
        if ('level' in c) return (c as PF2eCreatureIndex).level;
        return (c as DnD5eCreatureIndex).challengeRating;
      };
      filteredCreatures.sort((a, b) => {
        const powerA = powerLevel(a);
        const powerB = powerLevel(b);
        if (powerA !== powerB) return powerA - powerB;
        return a.name.localeCompare(b.name);
      });

      // Apply limit
      if (filteredCreatures.length > limit) {
        filteredCreatures = filteredCreatures.slice(0, limit);
      }

      // Convert enhanced creatures to result format (system-aware)
      const results = filteredCreatures.map(creature => {
        const isMGT2e = 'hits' in creature && 'hasPsionics' in creature;
        const isCosmere = !isMGT2e && 'tier' in creature;
        const isPF2e = !isMGT2e && !isCosmere && 'level' in creature;

        const base = {
          id: creature.id,
          name: creature.name,
          type: creature.type,
          pack: creature.pack,
          packLabel: creature.packLabel,
          description: (creature as any).description || '',
          hasImage: !!creature.img,
          creatureType: (creature as any).creatureType,
          size: (creature as any).size,
          hitPoints: (creature as any).hitPoints,
        };

        if (isMGT2e) {
          const m = creature as MGT2eCreatureIndex;
          const strDm = m.characteristics?.STR?.dm ?? 0;
          const dexDm = m.characteristics?.DEX?.dm ?? 0;
          return {
            ...base,
            hits: m.hits,
            creatureType: m.creatureType,
            hasPsionics: m.hasPsionics,
            characteristics: m.characteristics,
            summary: `${m.type} — ${m.hits} hits${m.creatureType ? ', ' + m.creatureType : ''} (STR DM${strDm >= 0 ? '+' : ''}${strDm}, DEX DM${dexDm >= 0 ? '+' : ''}${dexDm}) from ${m.packLabel}`,
          };
        }

        if (isCosmere) {
          const c = creature;
          return {
            ...base,
            summary: `Tier ${c.tier} ${c.role} ${c.creatureType} from ${c.packLabel}`,
            tier: c.tier,
            role: c.role,
            subtype: c.subtype,
            focus: c.focus,
            investiture: c.investiture,
            hasInvestiture: c.hasInvestiture,
            defenses: {
              physical: c.defensePhysical,
              cognitive: c.defenseCognitive,
              spiritual: c.defenseSpiritual,
            },
            deflect: c.deflect,
            walkSpeed: c.walkSpeed,
          };
        }

        if (isPF2e) {
          const p = creature;
          return {
            ...base,
            armorClass: p.armorClass,
            hasSpells: p.hasSpells,
            alignment: p.alignment,
            summary: `Level ${p.level} ${p.creatureType} (${p.rarity}) from ${p.packLabel}`,
            level: p.level,
            traits: p.traits,
            rarity: p.rarity,
          };
        }

        const d = creature as DnD5eCreatureIndex;
        return {
          ...base,
          armorClass: d.armorClass,
          hasSpells: d.hasSpells,
          alignment: d.alignment,
          summary: `CR ${d.challengeRating} ${d.creatureType} from ${d.packLabel}`,
          challengeRating: d.challengeRating,
          hasLegendaryActions: d.hasLegendaryActions,
        };
      });

      // Calculate pack distribution for summary
      const packResults = new Map();
      results.forEach(creature => {
        const count = packResults.get(creature.packLabel) || 0;
        packResults.set(creature.packLabel, count + 1);
      });

      // Get unique pack information
      const uniquePacks = Array.from(new Set(enhancedCreatures.map(c => c.pack)));
      const topPacks = uniquePacks.slice(0, 5).map(packId => {
        const sampleCreature = enhancedCreatures.find(c => c.pack === packId);
        return {
          id: packId,
          label: sampleCreature?.packLabel || 'Unknown Pack',
          priority: 100, // All packs are prioritized equally in enhanced index
        };
      });

      if (packResults.size > 0) {
      }

      return {
        creatures: results,
        searchSummary: {
          packsSearched: uniquePacks.length,
          topPacks,
          totalCreaturesFound: results.length,
          resultsByPack: Object.fromEntries(packResults),
          criteria,
          indexMetadata: {
            totalIndexedCreatures: enhancedCreatures.length,
            searchMethod: 'enhanced_persistent_index',
          },
        },
      };
    } catch (error) {
      console.error(`[${MODULE_ID}] Enhanced creature search failed:`, error);
      // Fallback to basic search if enhanced index fails
      return this.fallbackBasicCreatureSearch(criteria, limit);
    }
  }

  /**
   * Check if enhanced creature passes all specified criteria (system-aware routing).
   *
   * Discriminator order matters: cosmere-rpg has a `tier` field, pf2e has
   * `level`, dnd5e has `challengeRating`. Check cosmere first (tier is the
   * narrowest signal), then pf2e, then fall through to dnd5e.
   */
  private passesEnhancedCriteria(creature: EnhancedCreatureIndex, criteria: any): boolean {
    if ('hits' in creature && 'hasPsionics' in creature) {
      return passesMGT2eCriteria(creature as MGT2eCreatureIndex, criteria);
    }
    if ('tier' in creature) {
      return passesCosmereRpgCriteria(creature, criteria);
    }
    if ('level' in creature) {
      return passesPF2eCriteria(creature, criteria);
    }
    return passesDnD5eCriteria(creature, criteria);
  }

  /**
   * Fallback to basic creature search if enhanced index fails
   */
  private async fallbackBasicCreatureSearch(
    criteria: any,
    limit: number
  ): Promise<{ creatures: any[]; searchSummary: any }> {
    console.warn(`[${MODULE_ID}] Falling back to basic search due to enhanced index failure`);

    // Use a simple text-based search as fallback
    const searchTerms: string[] = [];

    if (criteria.creatureType) {
      searchTerms.push(criteria.creatureType);
    }

    if (criteria.challengeRating) {
      if (typeof criteria.challengeRating === 'number') {
        // Add CR-based name patterns as fallback
        if (criteria.challengeRating >= 15) searchTerms.push('ancient', 'legendary');
        else if (criteria.challengeRating >= 10) searchTerms.push('adult', 'champion');
        else if (criteria.challengeRating >= 5) searchTerms.push('captain', 'knight');
      }
    }

    const searchQuery = searchTerms.join(' ') || 'monster';
    const basicResults = await this.searchCompendium(searchQuery, 'Actor');

    return {
      creatures: basicResults.slice(0, limit),
      searchSummary: {
        packsSearched: 0,
        topPacks: [],
        totalCreaturesFound: basicResults.length,
        resultsByPack: {},
        criteria,
        fallback: true,
        searchMethod: 'basic_fallback',
      },
    };
  }

  /**
   * Prioritize compendium packs by likelihood of containing relevant creatures
   * @unused - Replaced by enhanced persistent index system
   */
  // @ts-ignore - Unused method kept for compatibility
  private prioritizePacksForCreatures(packs: any[]): any[] {
    const priorityOrder = [
      // Tier 1: Core D&D 5e content (highest priority)
      { pattern: /^dnd5e\.monsters/, priority: 100 }, // Core D&D 5e monsters
      { pattern: /^dnd5e\.actors/, priority: 95 }, // Core D&D 5e actors
      { pattern: /ddb.*monsters/i, priority: 90 }, // D&D Beyond monsters

      // Tier 2: Official modules and supplements
      { pattern: /^world\..*ddb.*monsters/i, priority: 85 }, // World-specific DDB monsters
      { pattern: /monsters/i, priority: 80 }, // Any pack with "monsters"

      // Tier 3: Campaign and adventure content
      { pattern: /^world\.(?!.*summon|.*hero)/i, priority: 70 }, // World packs (not summons/heroes)

      // Tier 4: Specialized content
      { pattern: /summon|familiar/i, priority: 40 }, // Summons and familiars

      // Tier 5: Unlikely to contain monsters (lowest priority)
      { pattern: /hero|player|pc/i, priority: 10 }, // Player characters
    ];

    return packs.sort((a, b) => {
      const aScore = this.getPackPriority(a.metadata.id, a.metadata.label, priorityOrder);
      const bScore = this.getPackPriority(b.metadata.id, b.metadata.label, priorityOrder);

      if (aScore !== bScore) {
        return bScore - aScore; // Higher score first
      }

      // Secondary sort by pack label alphabetically
      return a.metadata.label.localeCompare(b.metadata.label);
    });
  }

  /**
   * Get priority score for a pack based on ID and label
   */
  private getPackPriority(
    packId: string,
    packLabel: string,
    priorityOrder: { pattern: RegExp; priority: number }[]
  ): number {
    for (const rule of priorityOrder) {
      if (rule.pattern.test(packId) || rule.pattern.test(packLabel)) {
        return rule.priority;
      }
    }
    // Default priority for unmatched packs
    return 50;
  }

  /**
   * Check if creature entry passes the given criteria
   * @unused - Legacy method replaced by passesEnhancedCriteria
   */
  // @ts-ignore - Legacy method kept for compatibility
  private passesCriteria(
    entry: any,
    criteria: {
      challengeRating?: number | { min?: number; max?: number };
      creatureType?: string;
      size?: string;
      hasSpells?: boolean;
      hasLegendaryActions?: boolean;
    }
  ): boolean {
    const system = entry.system || {};

    // Challenge Rating filter - enhanced extraction
    if (criteria.challengeRating !== undefined) {
      // Try multiple possible CR locations in D&D 5e data structure
      let entryCR =
        system.details?.cr?.value || system.details?.cr || system.cr?.value || system.cr || 0;

      // Handle fractional CRs (common in D&D 5e)
      if (typeof entryCR === 'string') {
        if (entryCR === '1/8') entryCR = 0.125;
        else if (entryCR === '1/4') entryCR = 0.25;
        else if (entryCR === '1/2') entryCR = 0.5;
        else entryCR = parseFloat(entryCR) || 0;
      }

      if (typeof criteria.challengeRating === 'number') {
        if (entryCR !== criteria.challengeRating) {
          return false;
        }
      } else if (typeof criteria.challengeRating === 'object') {
        const { min = 0, max = 30 } = criteria.challengeRating;
        if (entryCR < min || entryCR > max) {
          return false;
        }
      }
    }

    // Creature Type filter - enhanced extraction
    if (criteria.creatureType) {
      // Try multiple possible type locations in D&D 5e data structure
      const entryType =
        system.details?.type?.value ||
        system.details?.type ||
        system.type?.value ||
        system.type ||
        '';
      if (entryType.toLowerCase() !== criteria.creatureType.toLowerCase()) {
        return false;
      }
    }

    // Size filter
    if (criteria.size) {
      const entrySize = system.traits?.size || system.size || '';
      if (entrySize.toLowerCase() !== criteria.size.toLowerCase()) return false;
    }

    // Spellcaster filter
    if (criteria.hasSpells !== undefined) {
      const isSpellcaster = !!(
        system.spells ||
        system.attributes?.spellcasting ||
        (system.details?.spellLevel && system.details.spellLevel > 0)
      );
      if (isSpellcaster !== criteria.hasSpells) return false;
    }

    // Legendary Actions filter
    if (criteria.hasLegendaryActions !== undefined) {
      const hasLegendary = !!(
        system.resources?.legact ||
        system.legendary ||
        (system.resources?.legres && system.resources.legres.value > 0)
      );
      if (hasLegendary !== criteria.hasLegendaryActions) return false;
    }

    return true;
  }

  /**
   * Simple name/description-based matching for creatures using index data only
   */
  private matchesSearchCriteria(
    entry: any,
    criteria: {
      searchTerms?: string[];
      excludeTerms?: string[];
      size?: string;
      hasSpells?: boolean;
      hasLegendaryActions?: boolean;
    }
  ): boolean {
    const name = (entry.name || '').toLowerCase();
    const description = (entry.description || '').toLowerCase();
    const searchText = `${name} ${description}`;

    // Include terms - at least one must match
    if (criteria.searchTerms && criteria.searchTerms.length > 0) {
      const hasMatch = criteria.searchTerms.some(term => searchText.includes(term.toLowerCase()));
      if (!hasMatch) {
        return false;
      }
    }

    // Exclude terms - none should match
    if (criteria.excludeTerms && criteria.excludeTerms.length > 0) {
      const hasExcluded = criteria.excludeTerms.some(term =>
        searchText.includes(term.toLowerCase())
      );
      if (hasExcluded) {
        return false;
      }
    }

    return true;
  }

  /**
   * Get available compendium packs
   */
  async getAvailablePacks() {
    return Array.from(game.packs.values()).map(pack => ({
      id: pack.metadata.id,
      label: pack.metadata.label,
      type: pack.metadata.type,
      system: pack.metadata.system,
      private: pack.metadata.private,
    }));
  }

  /**
   * Return a compendium pack's index entries as a plain array.
   * `fields` requests extra (dot-notation) fields be included in the index —
   * e.g. ['type', 'system.details.species.value'] — so callers can filter
   * without loading every full document. Mirrors the getIndex({ fields })
   * pattern used elsewhere, with a fallback for older Foundry APIs.
   */
  async getPackIndex(packId: string, fields?: string[]): Promise<any[]> {
    const pack = game.packs.get(packId);
    if (!pack) {
      throw new Error(`Compendium pack not found: ${packId}`);
    }

    let packIndex: any;
    try {
      packIndex = await (pack as any).getIndex(
        fields && fields.length > 0 ? { fields } : undefined
      );
    } catch {
      // Fallback: older Foundry API without the fields option
      packIndex = await (pack as any).getIndex();
    }

    const source =
      packIndex && typeof packIndex.values === 'function' ? packIndex : (pack as any).index;
    return Array.from((source as any).values()).map((entry: any) => sanitizeData(entry));
  }

  /**
   * Get full compendium document with all embedded data
   */
  async getCompendiumDocumentFull(
    packId: string,
    documentId: string
  ): Promise<CompendiumEntryFull> {
    const pack = game.packs.get(packId);
    if (!pack) {
      throw new Error(`Compendium pack ${packId} not found`);
    }

    const document = await pack.getDocument(documentId);
    if (!document) {
      throw new Error(`Document ${documentId} not found in pack ${packId}`);
    }
    const documentData = document.toObject() as Record<string, any>;
    const system = sanitizeData((document as any).system || {});
    const fullData = sanitizeData(documentData);
    if (Object.prototype.hasOwnProperty.call(documentData.system ?? {}, 'advancement')) {
      const advancement = sanitizeData(documentData.system.advancement);
      system.advancement = advancement;
      fullData.system ??= {};
      fullData.system.advancement = advancement;
    }

    // Build comprehensive data structure
    const fullEntry: CompendiumEntryFull = {
      id: document.id || '',
      name: document.name || '',
      type: (document as any).type || 'unknown',
      img: (document as any).img || undefined,
      pack: packId,
      packLabel: pack.metadata.label,
      system,
      fullData,
    };

    // Add items if the actor has them
    if ((document as any).items) {
      fullEntry.items = (document as any).items.map((item: any) => ({
        id: item.id,
        name: item.name,
        type: item.type,
        img: item.img || undefined,
        system: sanitizeData(item.system || {}),
      }));
    }

    // Add effects if the actor has them
    if ((document as any).effects) {
      fullEntry.effects = (document as any).effects.map((effect: any) => ({
        id: effect.id,
        name: effect.name || effect.label || 'Unknown Effect',
        icon: effect.icon || undefined,
        disabled: effect.disabled || false,
        duration: sanitizeData(effect.duration || {}),
      }));
    }

    return fullEntry;
  }

  /**
   * Find best matching compendium entry for creature type
   */
  async findBestCompendiumMatch(
    creatureType: string,
    packPreference?: string
  ): Promise<CompendiumSearchResult | null> {
    // First try exact search
    const exactResults = await this.searchCompendium(creatureType, 'Actor');

    // Look for exact name match first
    const exactMatch = exactResults.find(
      result => result.name.toLowerCase() === creatureType.toLowerCase()
    );
    if (exactMatch) return exactMatch;

    // Look for partial matches, preferring specified pack
    if (packPreference) {
      const packMatch = exactResults.find(result => result.pack === packPreference);
      if (packMatch) return packMatch;
    }

    // Return best fuzzy match
    return exactResults.length > 0 ? exactResults[0] : null;
  }

  /**
   * Get enhanced creature index for campaign analysis
   */
  async getEnhancedCreatureIndex(): Promise<any[]> {
    validateFoundryState();

    // Get the enhanced creature index (builds if needed)
    const enhancedCreatures = await this.persistentIndex.getEnhancedIndex();

    return enhancedCreatures || [];
  }
}
