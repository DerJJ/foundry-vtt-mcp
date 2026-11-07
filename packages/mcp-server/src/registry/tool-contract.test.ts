/**
 * Contract every tool has to meet, whatever it is called and however the tools are grouped.
 * Unlike the golden snapshot these checks do not name a tool, so they keep holding when the
 * tool surface is redesigned and the snapshot is regenerated.
 */

import { describe, expect, it } from 'vitest';
import { createTestToolRegistry } from '../test-support/create-test-registry.js';

type Schema = Record<string, any>;

const registry = createTestToolRegistry();
const tools = registry.list() as Array<{ name: string; description?: string; inputSchema: Schema }>;

function describeEach<T>(title: string, check: (tool: (typeof tools)[number]) => void) {
  it.each(tools.map(t => [t.name, t] as const))(`${title}: %s`, (_name, tool) => check(tool));
}

describe('tool contract', () => {
  it('has tools', () => {
    expect(tools.length).toBeGreaterThan(0);
  });

  it('gives every tool a different name', () => {
    expect(new Set(tools.map(t => t.name)).size).toBe(tools.length);
  });

  describeEach('has a kebab-case name', tool => {
    expect(tool.name).toMatch(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/);
  });

  describeEach('has a description that tells the model what it does', tool => {
    expect(tool.description?.trim().length ?? 0).toBeGreaterThan(20);
  });

  describeEach('takes an object', tool => {
    expect(tool.inputSchema.type).toBe('object');
  });

  describeEach('only requires properties it declares', tool => {
    const declared = Object.keys(tool.inputSchema.properties ?? {});
    for (const required of tool.inputSchema.required ?? []) {
      expect(declared).toContain(required);
    }
  });

  describeEach('types every property', tool => {
    for (const [name, schema] of Object.entries<Schema>(tool.inputSchema.properties ?? {})) {
      const typed = ['type', 'enum', 'anyOf', 'oneOf', 'allOf', '$ref', 'const'].some(
        k => k in schema
      );
      expect(typed, `${tool.name}.${name} has no type`).toBe(true);
    }
  });

  describeEach('has a schema that survives JSON', tool => {
    expect(JSON.parse(JSON.stringify(tool.inputSchema))).toEqual(tool.inputSchema);
  });

  it('rejects a call to a tool that does not exist', async () => {
    await expect(registry.call('no-such-tool', {})).rejects.toThrow('Unknown tool: no-such-tool');
  });
});
