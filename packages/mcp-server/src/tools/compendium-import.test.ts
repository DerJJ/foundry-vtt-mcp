import { describe, expect, it, vi } from 'vitest';
import { CompendiumImportTools } from './compendium-import.js';

function setup() {
  const query = vi.fn(async () => ({ success: true }));
  const logger: any = { info: vi.fn(), child: () => logger };
  return { tools: new CompendiumImportTools({ foundryClient: { query } as any, logger }), query };
}

describe('import-compendium-entry', () => {
  it('asks the bridge to import the entry', async () => {
    const { tools, query } = setup();
    await tools.handleImportCompendiumEntry({ packId: 'dnd5e.items', itemId: 'abc' });
    expect(query).toHaveBeenCalledWith('foundry-mcp-bridge.importCompendiumDocument', {
      packId: 'dnd5e.items',
      documentId: 'abc',
    });
  });

  it('sends a folder path as segments', async () => {
    const { tools, query } = setup();
    await tools.handleImportCompendiumEntry({ packId: 'p', itemId: 'i', folder: 'Loot / Weapons' });
    expect(query).toHaveBeenCalledWith(
      'foundry-mcp-bridge.importCompendiumDocument',
      expect.objectContaining({ folderSegments: ['Loot', 'Weapons'] })
    );
  });

  it('rejects a bad folder path and missing ids before asking the bridge', async () => {
    const { tools, query } = setup();
    await expect(
      tools.handleImportCompendiumEntry({ packId: 'p', itemId: 'i', folder: 'A//B' })
    ).rejects.toThrow('empty segment');
    await expect(tools.handleImportCompendiumEntry({ packId: 'p' })).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });
});
