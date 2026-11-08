import { MODULE_ID } from './constants.js';
import { FoundryDataAccess } from './data-access.js';
import { ComfyUIManager } from './comfyui-manager.js';
import { QueryRegistry } from './queries/query-registry.js';
import { CharacterQueries } from './queries/characters.js';
import { CompendiumQueries } from './queries/compendium.js';
import { WorldQueries } from './queries/world.js';
import { AudioQueries } from './queries/audio.js';
import { JournalQueries } from './queries/journals.js';
import { ActorQueries } from './queries/actors.js';
import { EffectQueries } from './queries/effects.js';
import { ItemQueries } from './queries/items.js';
import { RollQueries } from './queries/rolls.js';
import { OwnershipQueries } from './queries/ownership.js';
import { ChatQueries } from './queries/chat.js';
import { TokenQueries } from './queries/tokens.js';
import { MapGenerationQueries } from './queries/map-generation.js';
import { UtilityQueries } from './queries/utility.js';
import { ScriptingQueries } from './queries/scripting.js';
import { Dnd5eQueries } from './systems/dnd5e/queries.js';
import { Wfrp4eQueries } from './systems/wfrp4e/queries.js';

/**
 * The bridge's queries. Each group of related queries lives in its own file; the registry
 * publishes them all in CONFIG.queries.
 */
export class QueryHandlers {
  public dataAccess: FoundryDataAccess;
  private comfyuiManager: ComfyUIManager;
  private registry: QueryRegistry;

  constructor() {
    this.dataAccess = new FoundryDataAccess();
    this.comfyuiManager = new ComfyUIManager();
    this.registry = new QueryRegistry([
      new CharacterQueries(this.dataAccess),
      new CompendiumQueries(this.dataAccess),
      new WorldQueries(this.dataAccess),
      new AudioQueries(this.dataAccess),
      new JournalQueries(this.dataAccess),
      new ActorQueries(this.dataAccess),
      new EffectQueries(this.dataAccess),
      new ItemQueries(this.dataAccess),
      new RollQueries(this.dataAccess),
      new OwnershipQueries(this.dataAccess),
      new ChatQueries(this.dataAccess),
      new TokenQueries(this.dataAccess),
      new MapGenerationQueries(this.comfyuiManager),
      new UtilityQueries(),
      new ScriptingQueries(),
      new Dnd5eQueries(this.dataAccess),
      new Wfrp4eQueries(this.dataAccess),
    ]);
  }

  /**
   * Register all query handlers in CONFIG.queries
   */
  registerHandlers(): void {
    this.registry.install();
  }

  /**
   * Unregister all query handlers
   */
  unregisterHandlers(): void {
    this.registry.uninstall();
  }

  /**
   * Handle query requests from other parts of the module
   */
  async handleQuery(queryName: string, data: any): Promise<any> {
    try {
      const handler = CONFIG.queries[queryName];
      if (!handler || typeof handler !== 'function') {
        throw new Error(`Query handler not found: ${queryName}`);
      }

      return await handler(data);
    } catch (error) {
      console.error(`[${MODULE_ID}] Query failed: ${queryName}`, error);
      return {
        error: error instanceof Error ? error.message : 'Unknown error',
        success: false,
      };
    }
  }

  /**
   * Get list of all registered query methods
   */
  getRegisteredMethods(): string[] {
    const modulePrefix = MODULE_ID;
    return Object.keys(CONFIG.queries)
      .filter(key => key.startsWith(modulePrefix))
      .map(key => key.replace(`${modulePrefix}.`, ''));
  }

  /**
   * Test if a specific query handler is registered
   */
  isMethodRegistered(method: string): boolean {
    const queryKey = `${MODULE_ID}.${method}`;
    return queryKey in CONFIG.queries && typeof CONFIG.queries[queryKey] === 'function';
  }
}
