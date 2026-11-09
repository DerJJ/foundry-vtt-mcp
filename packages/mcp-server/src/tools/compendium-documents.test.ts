import { describe, expect, it } from 'vitest';
import { describeCompendiumDocument, isOtherDocument, stripHtml } from './compendium-documents.js';

const entry = (documentName: string, fullData: Record<string, unknown>) => ({
  documentName,
  fullData,
});

describe('which entries are formatted here', () => {
  it('leaves actors and items to the compendium tool', () => {
    expect(isOtherDocument({ documentName: 'Actor' })).toBe(false);
    expect(isOtherDocument({ documentName: 'Item' })).toBe(false);
    expect(isOtherDocument({})).toBe(false);
  });

  it.each(['JournalEntry', 'RollTable', 'Scene', 'Macro', 'Playlist', 'Cards', 'Adventure'])(
    'formats %s',
    name => expect(isOtherDocument({ documentName: name })).toBe(true)
  );
});

describe('stripHtml', () => {
  it('keeps text and paragraph breaks, drops tags and entities', () => {
    expect(stripHtml('<h2>Title</h2><p>One &amp; two</p><p>Three<br>four</p>')).toBe(
      'Title\nOne & two\nThree\nfour'
    );
    expect(stripHtml(undefined)).toBe('');
  });
});

describe('journal entries', () => {
  const journal = entry('JournalEntry', {
    pages: [
      { _id: 'p1', name: 'Rumours', type: 'text', text: { content: `<p>${'x'.repeat(2000)}</p>` } },
      { _id: 'p2', name: 'Map', type: 'image', src: 'maps/town.webp' },
    ],
  });

  it('returns the text of every page, not an empty description', () => {
    const full: any = describeCompendiumDocument(journal, false);
    expect(full.pages[0].text).toHaveLength(2000);
    expect(full.pages[1]).toMatchObject({ name: 'Map', type: 'image', src: 'maps/town.webp' });
    expect(full.pages[1].text).toBeUndefined();
  });

  it('shortens long text when compact, and says so', () => {
    const compact: any = describeCompendiumDocument(journal, true);
    expect(compact.pages[0].text.length).toBeLessThan(700);
    expect(compact.pages[0].text).toContain('2000 characters');
  });
});

describe('roll tables', () => {
  const table = entry('RollTable', {
    formula: '1d6',
    description: '<p>Odd things in the market.</p>',
    results: Array.from({ length: 30 }, (_, i) => ({
      range: [i + 1, i + 1],
      text: `<b>Thing ${i + 1}</b>`,
      weight: 1,
    })),
  });

  it('returns the formula and every result', () => {
    const full: any = describeCompendiumDocument(table, false);
    expect(full).toMatchObject({
      formula: '1d6',
      description: 'Odd things in the market.',
      totalResults: 30,
    });
    expect(full.results).toHaveLength(30);
    expect(full.results[0]).toMatchObject({ range: [1, 1], text: 'Thing 1' });
  });

  it('shows the first rows and the total when compact', () => {
    const compact: any = describeCompendiumDocument(table, true);
    expect(compact.results).toHaveLength(20);
    expect(compact.totalResults).toBe(30);
  });
});

describe('scenes, macros, playlists, cards and adventures', () => {
  it('summarises a scene and adds its full data only when not compact', () => {
    const scene = entry('Scene', {
      width: 4000,
      height: 3000,
      grid: { size: 100 },
      background: { src: 'maps/inn.webp' },
      walls: [{}, {}],
      tokens: [{}],
    });
    const compact: any = describeCompendiumDocument(scene, true);
    expect(compact).toMatchObject({
      dimensions: { width: 4000, height: 3000 },
      background: 'maps/inn.webp',
      counts: { walls: 2, tokens: 1, lights: 0 },
    });
    expect(compact.fullData).toBeUndefined();
    expect((describeCompendiumDocument(scene, false) as any).fullData).toBeDefined();
  });

  it('returns the source of a macro', () => {
    const macro: any = describeCompendiumDocument(
      entry('Macro', { type: 'script', command: 'return 1;' }),
      false
    );
    expect(macro).toEqual({ macroType: 'script', command: 'return 1;' });
  });

  it('lists the sounds of a playlist', () => {
    const playlist: any = describeCompendiumDocument(
      entry('Playlist', { mode: 1, sounds: [{ name: 'Rain', path: 'a.ogg', volume: 0.5 }] }),
      false
    );
    expect(playlist).toMatchObject({ totalSounds: 1, sounds: [{ name: 'Rain', path: 'a.ogg' }] });
  });

  it('lists the cards of a deck', () => {
    const deck: any = describeCompendiumDocument(
      entry('Cards', { type: 'deck', cards: [{ name: 'Ace', suit: 1, value: 1 }] }),
      false
    );
    expect(deck).toMatchObject({ cardsType: 'deck', totalCards: 1 });
  });

  it('names what an adventure contains', () => {
    const adventure: any = describeCompendiumDocument(
      entry('Adventure', {
        description: '<p>A short one.</p>',
        scenes: [{ name: 'Cellar' }],
        actors: [{ name: 'Rat' }, { name: 'Cook' }],
      }),
      false
    );
    expect(adventure.description).toBe('A short one.');
    expect(adventure.contents.scenes).toEqual(['Cellar']);
    expect(adventure.contents.actors).toEqual(['Rat', 'Cook']);
    const compact: any = describeCompendiumDocument(
      entry('Adventure', { actors: [{ name: 'Rat' }] }),
      true
    );
    expect(compact.contents.actors).toEqual(['Rat']);
    expect(compact.contents.scenes).toBeUndefined();
    const many: any = describeCompendiumDocument(
      entry('Adventure', { actors: Array.from({ length: 8 }, (_, i) => ({ name: `N${i}` })) }),
      true
    );
    expect(many.contents.actors).toEqual({ count: 8, first: ['N0', 'N1', 'N2', 'N3', 'N4'] });
  });
});
