/**
 * Rules every domain tool and action has to meet, whatever the tools are called and however the
 * actions are grouped. They name no tool, so they keep holding when the grouping changes.
 */

import { describe, expect, it } from 'vitest';
import {
  createTestOperationCatalog,
  createTestToolRegistry,
} from '../test-support/create-test-registry.js';
import { DOMAIN_TOOLS } from './domain-tools.js';

const catalog = createTestOperationCatalog();
const actions = DOMAIN_TOOLS.flatMap(tool =>
  Object.entries(tool.actions).map(([name, spec]) => ({ tool: tool.name, name, spec }))
);

/** What clients pay for in every session: all descriptions and schemas. A ceiling, not a goal. */
const SURFACE_BUDGET_CHARS = 18_000;

describe('domain tool specs', () => {
  it('give every tool and every action in it a different name', () => {
    expect(new Set(DOMAIN_TOOLS.map(t => t.name)).size).toBe(DOMAIN_TOOLS.length);
  });

  it.each(actions.map(a => [`${a.tool}.${a.name}`, a] as const))(
    '%s has a kebab-case name and a known risk',
    (_label, { name, spec }) => {
      expect(name).toMatch(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/);
      expect(['read', 'write', 'delete', 'execute']).toContain(spec.risk);
    }
  );

  it('uses every operation at least once, so none is left behind', () => {
    const used = new Set(actions.map(a => a.spec.operation).filter(Boolean));
    expect([...catalog.keys()].filter(name => !used.has(name))).toEqual([]);
  });

  it.each(actions.filter(a => a.spec.operation).map(a => [`${a.tool}.${a.name}`, a] as const))(
    '%s only names parameters and fixed arguments its operation has',
    (_label, { spec }) => {
      const schema = catalog.get(spec.operation!)!.definition.inputSchema as {
        properties?: Record<string, unknown>;
        required?: string[];
      };
      const known = Object.keys(schema.properties ?? {});
      for (const key of [...Object.keys(spec.params ?? {}), ...Object.keys(spec.fixed ?? {})]) {
        expect(known, `unknown parameter ${key}`).toContain(key);
      }
    }
  );

  it.each(actions.filter(a => a.spec.operation).map(a => [`${a.tool}.${a.name}`, a] as const))(
    '%s asks for everything its operation requires',
    (_label, { spec }) => {
      const schema = catalog.get(spec.operation!)!.definition.inputSchema as {
        required?: string[];
      };
      const fixed = new Set([
        ...Object.keys(spec.fixed ?? {}),
        ...(spec.choice ? [spec.choice.into] : []),
      ]);
      for (const key of (schema.required ?? []).filter(k => !fixed.has(k))) {
        const covered = spec.params ? spec.params[key] === true : true;
        expect(covered, `${key} is required by the operation`).toBe(true);
      }
    }
  );

  it('marks every action that deletes, and only those, with the delete risk', () => {
    for (const { tool, name, spec } of actions) {
      const deletes = /^delete|^remove-from|-delete$|^end$|^reset-fog$/.test(name);
      expect(spec.risk === 'delete', `${tool}.${name}`).toBe(deletes);
    }
  });

  it('keeps an action for one game system out of the general list', () => {
    for (const { tool, name, spec } of actions) {
      const operation = spec.operation ?? '';
      if (operation.startsWith('dnd5e-'))
        expect(spec.systems, `${tool}.${name}`).toEqual(['dnd5e']);
      if (operation.startsWith('wfrp4e-'))
        expect(spec.systems, `${tool}.${name}`).toEqual(['wfrp4e']);
      if (operation.includes('dsa5')) expect(spec.systems, `${tool}.${name}`).toEqual(['dsa5']);
    }
  });

  it('gates the actions of an optional feature, and nothing else', () => {
    for (const { tool, name, spec } of actions) {
      const isImage =
        /map/.test(spec.operation ?? '') && /generate|check|cancel/.test(spec.operation ?? '');
      expect(spec.feature === 'imageGeneration', `${tool}.${name}`).toBe(isImage);
    }
  });
});

describe('domain tool surface', () => {
  const tools = createTestToolRegistry().list();

  it('lists one MCP tool per spec, in order', () => {
    expect(tools.map(t => t.name)).toEqual(DOMAIN_TOOLS.map(t => t.name));
  });

  it('stays well under the size budget', () => {
    const size = tools.reduce(
      (sum, t) => sum + (t.description ?? '').length + JSON.stringify(t.inputSchema).length,
      0
    );
    expect(size).toBeLessThan(SURFACE_BUDGET_CHARS);
  });

  it('lists no system-specific action', () => {
    const systemActions = actions.filter(a => a.spec.systems).map(a => a.name);
    for (const tool of tools) {
      for (const name of systemActions) {
        expect(tool.description, `${tool.name} lists ${name}`).not.toMatch(
          new RegExp(`^- ${name}\\(`, 'm')
        );
      }
    }
  });

  it('lists every general action of every tool', () => {
    for (const tool of tools) {
      const spec = DOMAIN_TOOLS.find(t => t.name === tool.name)!;
      for (const [name, action] of Object.entries(spec.actions)) {
        if (action.systems) continue;
        expect(tool.description, `${tool.name}.${name}`).toMatch(new RegExp(`^- ${name}\\(`, 'm'));
      }
    }
  });
});
