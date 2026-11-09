/**
 * The Foundry modules installed in this world: which are installed, which are running, and
 * switching them on or off. Foundry applies a change to the module list only when the world is
 * loaded again, so a change is stored in the world's module configuration and the answer says
 * that every browser has to reload; until then a module's `active` (what runs) and `configured`
 * (what is stored) differ, which is shown as `pendingReload`.
 */

import { MODULE_ID } from '../constants.js';
import { auditLog, validateFoundryState } from './support.js';

export interface ModulesRequest {
  action: 'list' | 'get' | 'set-active';
  id?: string;
  ids?: string[];
  active?: boolean;
  query?: string;
  withDependencies?: boolean;
  withDependents?: boolean;
}

/** Ids of the modules a module requires (game systems and worlds are not modules). */
function requiredModules(module: any): string[] {
  const requires: any[] = Array.from(module?.relationships?.requires ?? []);
  return requires
    .filter(entry => (entry?.type ?? 'module') === 'module')
    .map(entry => String(entry.id));
}

export class ModulesService {
  async run(request: ModulesRequest): Promise<any> {
    validateFoundryState();
    switch (request.action) {
      case 'list':
        return this.list(request);
      case 'get':
        return this.get(request);
      case 'set-active':
        return this.setActive(request);
      default:
        throw new Error(`Unknown modules action: ${String((request as any).action)}`);
    }
  }

  private all(): any[] {
    return Array.from((game as any).modules?.values?.() ?? []);
  }

  private find(id: string): any {
    const found = (game as any).modules?.get?.(id);
    if (!found) throw new Error(`Module not installed: ${id}`);
    return found;
  }

  /** What is stored: module id to on or off. */
  private configuration(): Record<string, boolean> {
    return { ...((game as any).settings.get('core', 'moduleConfiguration') ?? {}) };
  }

  private row(module: any, configuration: Record<string, boolean>): Record<string, unknown> {
    const configured = configuration[module.id] === true;
    const active = module.active === true;
    return {
      id: module.id,
      title: module.title,
      version: module.version,
      active,
      configured,
      pendingReload: configured !== active,
      library: !!module.library,
      requires: requiredModules(module),
    };
  }

  private list(request: ModulesRequest): any {
    const configuration = this.configuration();
    let rows = this.all().map(module => this.row(module, configuration));
    if (request.active !== undefined) rows = rows.filter(row => row['active'] === request.active);
    if (request.query) {
      const needle = request.query.toLowerCase();
      rows = rows.filter(
        row =>
          String(row['id']).toLowerCase().includes(needle) ||
          String(row['title']).toLowerCase().includes(needle)
      );
    }
    rows.sort((a, b) => String(a['title']).localeCompare(String(b['title'])));
    const pending = rows.filter(row => row['pendingReload']).length;
    return {
      total: rows.length,
      activeCount: rows.filter(row => row['active']).length,
      pendingReload: pending,
      ...(pending
        ? { note: 'Some modules were switched since the world loaded: reload to apply.' }
        : {}),
      modules: rows,
    };
  }

  private get(request: ModulesRequest): any {
    if (!request.id) throw new Error('get needs an id.');
    const module = this.find(request.id);
    const configuration = this.configuration();
    const relationships = (key: string): unknown[] =>
      Array.from(module.relationships?.[key] ?? []).map((entry: any) => ({
        id: entry.id,
        type: entry.type ?? 'module',
        ...(entry.reason ? { reason: entry.reason } : {}),
      }));
    return {
      ...this.row(module, configuration),
      description: module.description,
      authors: Array.from(module.authors ?? []).map((author: any) => author?.name ?? author),
      url: module.url,
      compatibility: module.compatibility,
      relationships: {
        requires: relationships('requires'),
        recommends: relationships('recommends'),
        conflicts: relationships('conflicts'),
      },
      dependents: this.dependentsOf(module.id, configuration),
    };
  }

  /** Modules that are switched on and require this one. */
  private dependentsOf(id: string, configuration: Record<string, boolean>): string[] {
    return this.all()
      .filter(module => configuration[module.id] === true && requiredModules(module).includes(id))
      .map(module => module.id as string);
  }

  private async setActive(request: ModulesRequest): Promise<any> {
    const wanted = request.ids?.length ? request.ids : request.id ? [request.id] : [];
    if (wanted.length === 0) throw new Error('set-active needs id or ids.');
    if (request.active === undefined) throw new Error('set-active needs active: true or false.');
    const active = request.active;

    const configuration = this.configuration();
    const targets = new Map<string, any>();
    for (const id of wanted) targets.set(id, this.find(id));

    if (active) {
      // everything a module needs has to be installed and on
      const pending = [...targets.keys()];
      while (pending.length) {
        const id = pending.pop() as string;
        for (const required of requiredModules(targets.get(id))) {
          if (targets.has(required)) continue;
          const dependency = (game as any).modules?.get?.(required);
          if (!dependency) {
            throw new Error(`${id} requires ${required}, which is not installed.`);
          }
          if (configuration[required] === true) continue;
          if (!request.withDependencies) {
            throw new Error(
              `${id} requires ${required}, which is off. Switch it on too, or pass withDependencies: true.`
            );
          }
          targets.set(required, dependency);
          pending.push(required);
        }
      }
    } else {
      if (targets.has(MODULE_ID)) {
        throw new Error(
          `${MODULE_ID} is the connection to this tool: switching it off would end it, and it cannot be switched on again from here.`
        );
      }
      for (const id of [...targets.keys()]) {
        const dependents = this.dependentsOf(id, configuration).filter(
          other => !targets.has(other)
        );
        if (dependents.length === 0) continue;
        if (!request.withDependents) {
          throw new Error(
            `${dependents.join(', ')} require${dependents.length === 1 ? 's' : ''} ${id}. ` +
              'Switch them off too, or pass withDependents: true.'
          );
        }
        for (const other of dependents) targets.set(other, this.find(other));
      }
      if (targets.has(MODULE_ID)) {
        throw new Error(`${MODULE_ID} would be switched off as a dependent; that is refused.`);
      }
    }

    const next = { ...configuration };
    const changed: Array<{ id: string; title: string; from: boolean; to: boolean }> = [];
    const unchanged: string[] = [];
    for (const [id, module] of targets) {
      const from = configuration[id] === true;
      if (from === active) {
        unchanged.push(id);
        continue;
      }
      next[id] = active;
      changed.push({ id, title: module.title, from, to: active });
    }

    if (changed.length > 0) {
      await (game as any).settings.set('core', 'moduleConfiguration', next);
      auditLog('modules.set-active', { ids: changed.map(c => c.id), active }, 'success');
    }

    return {
      success: true,
      changed,
      unchanged,
      reloadRequired: changed.length > 0,
      message:
        changed.length > 0
          ? 'Stored. Foundry applies module changes when the world is loaded again: every browser has to reload (F5). The bridge reconnects by itself afterwards.'
          : 'Nothing to change: the modules were already in that state.',
    };
  }
}
