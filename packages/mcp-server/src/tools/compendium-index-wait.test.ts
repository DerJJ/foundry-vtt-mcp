import { describe, expect, it, vi } from 'vitest';
import { CompendiumTools } from './compendium.js';

function setup(answers: Array<Error | object>) {
  const query = vi.fn(async () => {
    const next = answers.shift();
    if (next instanceof Error) throw next;
    return next;
  });
  const logger: any = { info: vi.fn(), debug: vi.fn(), child: () => logger };
  const tools = new CompendiumTools({ foundryClient: { query } as any, logger });
  const ask = (tools as any).queryCreaturesWhenIndexIsReady.bind(tools) as (
    p: unknown
  ) => Promise<any>;
  return { ask, query };
}

const building = new Error(
  'Query foundry-mcp-bridge.listCreaturesByCriteria failed: The creature index is still building (3 of 40 packs done, now Bestiary). Try again in a minute'
);

describe('a creature search while the index is building', () => {
  it('asks again until the bridge has the index, then returns the answer', async () => {
    const { ask, query } = setup([building, building, { creatures: [] }]);
    await expect(ask({})).resolves.toEqual({ creatures: [] });
    expect(query).toHaveBeenCalledTimes(3);
  });

  it('does not retry other errors', async () => {
    const { ask, query } = setup([new Error('Query timeout')]);
    await expect(ask({})).rejects.toThrow('Query timeout');
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('gives up after the wait limit', async () => {
    vi.useFakeTimers();
    try {
      const { ask, query } = setup([]);
      query.mockImplementation(async () => {
        vi.setSystemTime(Date.now() + 5 * 60 * 1000);
        throw building;
      });
      await expect(ask({})).rejects.toThrow('still building');
      expect(query.mock.calls.length).toBe(4);
    } finally {
      vi.useRealTimers();
    }
  });
});
