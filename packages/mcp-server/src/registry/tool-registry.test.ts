import { describe, expect, it } from 'vitest';
import { bindMethods, ToolRegistry } from './tool-registry.js';

const definition = (name: string) => ({ name, inputSchema: { type: 'object' } });

describe('ToolRegistry', () => {
  it('lists definitions in registration order and routes calls by name', async () => {
    const registry = new ToolRegistry();
    registry.registerModule({
      definitions: [definition('a'), definition('b')],
      handlers: { a: async args => ['a', args], b: async args => ['b', args] },
    });
    registry.registerModule({
      definitions: [definition('c')],
      handlers: { c: async () => 'c' },
    });

    expect(registry.list().map(d => d.name)).toEqual(['a', 'b', 'c']);
    await expect(registry.call('b', { x: 1 })).resolves.toEqual(['b', { x: 1 }]);
  });

  it('rejects a call to an unknown tool', async () => {
    await expect(new ToolRegistry().call('nope', {})).rejects.toThrow('Unknown tool: nope');
  });

  it('rejects a tool without a handler', () => {
    expect(() =>
      new ToolRegistry().registerModule({ definitions: [definition('a')], handlers: {} })
    ).toThrow('Tool has no handler: a');
  });

  it('rejects a handler without a tool', () => {
    expect(() =>
      new ToolRegistry().registerModule({
        definitions: [],
        handlers: { ghost: async () => null },
      })
    ).toThrow('Handler registered for undefined tool: ghost');
  });

  it('rejects a duplicate tool name', () => {
    const registry = new ToolRegistry();
    const module = { definitions: [definition('a')], handlers: { a: async () => null } };
    registry.registerModule(module);
    expect(() => registry.registerModule(module)).toThrow('Duplicate tool name: a');
  });
});

describe('bindMethods', () => {
  it('calls the method on its instance', async () => {
    class Tools {
      prefix = 'p:';
      async run(args: { v: string }) {
        return this.prefix + args.v;
      }
    }
    const handlers = bindMethods(new Tools(), { 'run-tool': 'run' });
    await expect(handlers['run-tool']!({ v: 'x' })).resolves.toBe('p:x');
  });
});
