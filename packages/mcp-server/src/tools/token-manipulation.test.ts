/**
 * Token manipulation tool tests — focused on setting a placed token's artwork,
 * which Foundry stores at texture.src rather than as a flat `img` field.
 */

import { describe, it, expect, vi } from 'vitest';
import { TokenManipulationTools } from './token-manipulation.js';

function makeTools(queryImpl?: (method: string, data: any) => unknown) {
  const query = vi.fn(queryImpl ?? (async () => ({ success: true })));
  const logger: any = { info: vi.fn(), debug: vi.fn(), error: vi.fn(), child: () => logger };
  const foundryClient: any = { query };
  const tools = new TokenManipulationTools({ foundryClient, logger });
  return { tools, query };
}

describe('TokenManipulationTools.getToolDefinitions', () => {
  it('advertises img on update-token so clients can discover it', () => {
    const defs = makeTools().tools.getToolDefinitions();
    const updateToken = defs.find((d: any) => d.name === 'update-token') as any;

    expect(updateToken.inputSchema.properties.updates.properties.img.type).toBe('string');
  });
});

describe('TokenManipulationTools.handleUpdateToken', () => {
  it('sends img to the bridge as texture.src', async () => {
    const { tools, query } = makeTools();

    await tools.handleUpdateToken({
      tokenId: 'abc123',
      updates: { img: 'worlds/iron-gods/art/gearsman.webp' },
    });

    expect(query).toHaveBeenCalledWith('foundry-mcp-bridge.update-token', {
      tokenId: 'abc123',
      updates: { 'texture.src': 'worlds/iron-gods/art/gearsman.webp' },
    });
  });

  it('rejects a remote image URL instead of setting an image players cannot load', async () => {
    const { tools, query } = makeTools();

    await expect(
      tools.handleUpdateToken({
        tokenId: 'abc123',
        updates: { img: 'https://example.com/gearsman.png' },
      })
    ).rejects.toThrow(/data directory/i);

    expect(query).not.toHaveBeenCalled();
  });

  it('still forwards non-image updates unchanged alongside img', async () => {
    const { tools, query } = makeTools();

    await tools.handleUpdateToken({
      tokenId: 'abc123',
      updates: { img: 'worlds/iron-gods/art/gearsman.webp', hidden: true, elevation: 5 },
    });

    expect(query).toHaveBeenCalledWith('foundry-mcp-bridge.update-token', {
      tokenId: 'abc123',
      updates: {
        hidden: true,
        elevation: 5,
        'texture.src': 'worlds/iron-gods/art/gearsman.webp',
      },
    });
  });
});
