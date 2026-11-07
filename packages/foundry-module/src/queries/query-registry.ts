import { MODULE_ID } from '../constants.js';
import { guardQueryHandler } from '../query-guard.js';

export type QueryHandler = (data?: any, context?: any) => Promise<any>;

/** A set of related queries: the names it answers and the handler of each. */
export interface QueryGroup {
  routes(): Record<string, QueryHandler>;
}

/**
 * The query registry: the one place that publishes the bridge's queries in CONFIG.queries,
 * where Foundry's User#query makes them reachable, and that guards every one of them.
 */
export class QueryRegistry {
  private readonly installed = new Set<string>();

  constructor(
    private readonly groups: readonly QueryGroup[],
    private readonly prefix: string = MODULE_ID
  ) {}

  /** All query names, without the module prefix. */
  names(): string[] {
    return this.collect().map(([name]) => name);
  }

  /**
   * Registers every query in CONFIG.queries.
   *
   * SECURITY: these handlers are reachable by any connected user through Foundry's
   * User#query, so each one is wrapped to accept those calls from a GM only. See query-guard.ts.
   */
  install(): void {
    for (const [name, handler] of this.collect()) {
      const key = `${this.prefix}.${name}`;
      CONFIG.queries[key] = guardQueryHandler(key, handler);
      this.installed.add(key);
    }
  }

  /** Removes every query of this module from CONFIG.queries. */
  uninstall(): void {
    const keysToRemove = Object.keys(CONFIG.queries).filter(key => key.startsWith(this.prefix));
    for (const key of keysToRemove) {
      delete CONFIG.queries[key];
    }
    this.installed.clear();
  }

  private collect(): [string, QueryHandler][] {
    const seen = new Map<string, QueryHandler>();
    for (const group of this.groups) {
      for (const [name, handler] of Object.entries(group.routes())) {
        if (seen.has(name)) {
          throw new Error(`Duplicate query name: ${name}`);
        }
        seen.set(name, handler);
      }
    }
    return [...seen];
  }
}
