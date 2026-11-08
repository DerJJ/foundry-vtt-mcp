import { describe, expect, it, vi } from 'vitest';
import type { Capabilities } from './access.js';
import {
  buildDomainTool,
  type DomainContext,
  type DomainToolSpec,
  type Operation,
} from './domain-tool.js';

function operation(
  name: string,
  schema: object,
  handler: (args: any) => Promise<unknown> = async () => ({ ok: true })
): Operation {
  return {
    definition: { name, description: `Does ${name}. More text.`, inputSchema: schema },
    handler: vi.fn(handler),
  };
}

const caps = (overrides: Partial<Capabilities> = {}): Capabilities => ({
  system: { id: 'pf2e', version: '1' },
  foundryVersion: '14',
  moduleVersion: '1',
  accessLevel: { id: 'readwrite', label: 'Read & write', allows: ['read', 'write'] },
  executeAllowed: false,
  imageGenerationEnabled: false,
  ...overrides,
});

function context(
  system = 'pf2e',
  capabilities: () => Promise<Capabilities> = async () => caps()
): DomainContext {
  return {
    system: async () => system,
    capabilities,
    verification: s => (s === 'pf2e' ? 'verified' : 'unverified'),
  };
}

function setup(spec: Partial<DomainToolSpec> = {}, ctx = context()) {
  const get = operation('get-thing', {
    type: 'object',
    properties: { id: { type: 'string' }, detail: { type: 'boolean' } },
    required: ['id'],
  });
  const multi = operation('manage-things', {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['create', 'delete'] },
      names: { type: 'array', items: { type: 'string' } },
      ids: { type: 'array', items: { type: 'string' } },
    },
    required: ['action'],
  });
  const list = operation(
    'list-things',
    { type: 'object', properties: { kind: { type: 'string' } } },
    async () => ({ things: Array.from({ length: 120 }, (_, i) => i), total: 120 })
  );
  const catalog = new Map([
    ['get-thing', get],
    ['manage-things', multi],
    ['list-things', list],
    ['dnd-only', operation('dnd-only', { type: 'object', properties: {} })],
  ]);
  const built = buildDomainTool(
    {
      name: 'things',
      purpose: 'Things.',
      actions: {
        get: { operation: 'get-thing', risk: 'read' },
        list: { operation: 'list-things', risk: 'read', paged: 'things' },
        create: {
          operation: 'manage-things',
          risk: 'write',
          fixed: { action: 'create' },
          params: { names: true },
          summary: 'Make things.',
        },
        delete: {
          operation: 'manage-things',
          risk: 'delete',
          fixed: { action: 'delete' },
          params: { ids: true },
        },
        'dnd-thing': { operation: 'dnd-only', risk: 'write', systems: ['dnd5e'] },
        generate: { operation: 'get-thing', risk: 'write', feature: 'imageGeneration' },
      },
      ...spec,
    },
    catalog,
    ctx
  );
  const call = (args: unknown) => built.handlers['things'](args);
  return { built, call, get, multi, list };
}

describe('domain tool definition', () => {
  it('lists the general actions with signatures, and leaves system actions out', () => {
    const description = setup().built.definitions[0].description!;
    expect(description).toContain('- get(id*, detail?): Does get-thing.');
    expect(description).toContain('- create(names*): Make things.');
    expect(description).toContain('delete(ids*) (delete)');
    expect(description).not.toContain('dnd-thing');
    expect(description).toContain('"describe"');
  });

  it('takes an action and an open params object', () => {
    const schema = setup().built.definitions[0].inputSchema as any;
    expect(schema.required).toEqual(['action']);
    expect(Object.keys(schema.properties)).toEqual(['action', 'params']);
  });

  it('refuses an action whose operation does not exist', () => {
    expect(() =>
      buildDomainTool(
        { name: 't', purpose: 'p', actions: { a: { operation: 'nope', risk: 'read' } } },
        new Map(),
        context()
      )
    ).toThrow('unknown operation nope');
  });
});

describe('domain tool calls', () => {
  it('runs the operation with the params and the fixed arguments', async () => {
    const { call, multi } = setup();
    await call({ action: 'create', params: { names: ['a'] } });
    expect(multi.handler).toHaveBeenCalledWith({ names: ['a'], action: 'create' });
  });

  it('accepts arguments placed beside the action', async () => {
    const { call, get } = setup();
    await call({ action: 'get', id: 'x' });
    expect(get.handler).toHaveBeenCalledWith({ id: 'x' });
  });

  it('rejects missing and mistyped params before calling anything', async () => {
    const { call, get } = setup();
    await expect(call({ action: 'get', params: {} })).rejects.toThrow('id is required');
    await expect(call({ action: 'get', params: { id: 5 } })).rejects.toThrow('id must be string');
    await expect(call({ action: 'create', params: { names: [1] } })).rejects.toThrow(
      'names[0] must be string'
    );
    expect(get.handler).not.toHaveBeenCalled();
  });

  it('points at describe when params are invalid', async () => {
    await expect(setup().call({ action: 'get', params: {} })).rejects.toThrow(
      '{"action":"describe","params":{"action":"get"}}'
    );
  });

  it('names the valid actions when the action is unknown', async () => {
    await expect(setup().call({ action: 'explode' })).rejects.toThrow(
      /unknown action "explode".*get, list, create, delete/
    );
    await expect(setup().call({})).rejects.toThrow('"action" is required');
  });

  it('pages a list, with defaults and explicit limit and offset', async () => {
    const { call } = setup();
    const first: any = await call({ action: 'list' });
    expect(first.things).toHaveLength(50);
    expect(first).toMatchObject({ total: 120, limit: 50, offset: 0, hasMore: true });
    const last: any = await call({ action: 'list', params: { limit: 50, offset: 100 } });
    expect(last.things).toHaveLength(20);
    expect(last.hasMore).toBe(false);
  });

  it('does not pass limit and offset to the operation', async () => {
    const { call, list } = setup();
    await call({ action: 'list', params: { kind: 'x', limit: 5, offset: 2 } });
    expect(list.handler).toHaveBeenCalledWith({ kind: 'x' });
  });
});

describe('access', () => {
  it('refuses a delete at read & write, naming the level that would allow it', async () => {
    const { call, multi } = setup();
    await expect(call({ action: 'delete', params: { ids: ['a'] } })).rejects.toThrow(
      /Read & write.*Full access/s
    );
    expect(multi.handler).not.toHaveBeenCalled();
  });

  it('refuses a write at read only', async () => {
    const readonly = caps({
      accessLevel: { id: 'readonly', label: 'Read only', allows: ['read'] },
    });
    const { call } = setup(
      {},
      context('pf2e', async () => readonly)
    );
    await expect(call({ action: 'create', params: { names: [] } })).rejects.toThrow(
      'needs write access'
    );
    await expect(call({ action: 'get', params: { id: 'x' } })).resolves.toEqual({ ok: true });
  });

  it('allows a delete at full access', async () => {
    const full = caps({
      accessLevel: { id: 'full', label: 'Full access', allows: ['read', 'write', 'delete'] },
    });
    const { call, multi } = setup(
      {},
      context('pf2e', async () => full)
    );
    await call({ action: 'delete', params: { ids: ['a'] } });
    expect(multi.handler).toHaveBeenCalled();
  });

  it('refuses a gated feature while it is off', async () => {
    await expect(setup().call({ action: 'generate', params: { id: 'x' } })).rejects.toThrow(
      'image generation is off'
    );
  });

  it('still calls the operation when the bridge cannot be asked, so its error shows', async () => {
    const { call, get } = setup(
      {},
      context('pf2e', async () => {
        throw new Error('Not connected');
      })
    );
    await call({ action: 'get', params: { id: 'x' } });
    expect(get.handler).toHaveBeenCalled();
  });
});

describe('describe', () => {
  it('lists the actions of the active system, including its own', async () => {
    const pf2e: any = await setup().call({ action: 'describe' });
    expect(pf2e.system).toBe('pf2e');
    expect(pf2e.verification).toBe('verified');
    expect(pf2e.actions.map((a: any) => a.action)).not.toContain('dnd-thing');

    const dnd: any = await setup({}, context('dnd5e')).call({ action: 'describe' });
    expect(dnd.verification).toBe('unverified');
    expect(dnd.actions.map((a: any) => a.action)).toContain('dnd-thing');
  });

  it('returns the full schema of one action, without the fixed arguments', async () => {
    const result: any = await setup().call({ action: 'describe', params: { action: 'create' } });
    expect(result).toMatchObject({ tool: 'things', action: 'create', risk: 'write' });
    expect(Object.keys(result.inputSchema.properties)).toEqual(['names']);
    expect(result.inputSchema.required).toEqual(['names']);
  });

  it('adds the paging parameters to a paged action', async () => {
    const result: any = await setup().call({ action: 'describe', params: { action: 'list' } });
    expect(Object.keys(result.inputSchema.properties)).toEqual(['kind', 'limit', 'offset']);
  });

  it('refuses to call or describe a system action in another system', async () => {
    await expect(setup().call({ action: 'dnd-thing' })).rejects.toThrow('unknown action');
    await expect(
      setup().call({ action: 'describe', params: { action: 'dnd-thing' } })
    ).rejects.toThrow('unknown action');
  });
});
