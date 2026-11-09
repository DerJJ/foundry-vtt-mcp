import { describe, expect, it, vi } from 'vitest';
import { ActorPlacementTools } from './actor-placement.js';

function makeTools() {
  const query = vi.fn(async () => ({ success: true }));
  const logger: any = { info: vi.fn(), child: () => logger };
  return { tools: new ActorPlacementTools({ foundryClient: { query } as any, logger }), query };
}

describe('place-actors', () => {
  it('forwards the ids to the bridge with the defaults applied', async () => {
    const { tools, query } = makeTools();
    await tools.handlePlaceActors({ actorIds: ['a', 'b'] });
    expect(query).toHaveBeenCalledWith('foundry-mcp-bridge.addActorsToScene', {
      actorIds: ['a', 'b'],
      placement: 'random',
      hidden: false,
    });
  });

  it('passes placement and hidden on', async () => {
    const { tools, query } = makeTools();
    await tools.handlePlaceActors({ actorIds: ['a'], placement: 'grid', hidden: true });
    expect(query).toHaveBeenCalledWith('foundry-mcp-bridge.addActorsToScene', {
      actorIds: ['a'],
      placement: 'grid',
      hidden: true,
    });
  });

  it('rejects a call with no actors before asking the bridge', async () => {
    const { tools, query } = makeTools();
    await expect(tools.handlePlaceActors({})).rejects.toThrow();
    await expect(tools.handlePlaceActors({ actorIds: [] })).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });
});
