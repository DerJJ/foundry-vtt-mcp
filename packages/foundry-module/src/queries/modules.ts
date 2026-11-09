import { ModulesService, type ModulesRequest } from '../services/modules.js';
import { validateFoundryState } from '../services/support.js';
import { validateGMAccess } from './gm-access.js';
import type { QueryGroup, QueryHandler } from './query-registry.js';

/** The `modules` query: the installed modules, and switching them on or off. */
export class ModulesQueries implements QueryGroup {
  constructor(private readonly modules: ModulesService = new ModulesService()) {}

  routes(): Record<string, QueryHandler> {
    return { modules: this.handleModules.bind(this) };
  }

  async handleModules(data: ModulesRequest): Promise<any> {
    const gmCheck = validateGMAccess();
    if (!gmCheck.allowed) return { error: 'Access denied', success: false };
    validateFoundryState();
    try {
      return await this.modules.run(data);
    } catch (error) {
      throw new Error(
        `modules ${data?.action ?? ''}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}
