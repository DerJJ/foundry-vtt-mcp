/**
 * What a compendium entry looks like to the model, by document type. A pack can hold Actors,
 * Items, Journal entries, Roll tables, Scenes, Macros, Playlists, Cards and Adventures. Actors
 * and Items have their own formatting in the compendium tool; everything else comes through
 * here, so that for example a journal returns the text of its pages instead of an empty
 * description.
 */

type Doc = Record<string, any>;

/** Pack document types formatted here (Actor and Item are formatted by the compendium tool). */
export const OTHER_DOCUMENT_TYPES = new Set([
  'JournalEntry',
  'RollTable',
  'Scene',
  'Macro',
  'Playlist',
  'Cards',
  'Adventure',
]);

const COMPACT_TEXT = 600;
const COMPACT_ROWS = 20;

export function stripHtml(html: unknown): string {
  if (typeof html !== 'string') return '';
  return html
    .replace(/<\s*(br|\/p|\/div|\/h[1-6]|\/li|\/tr)\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function clip(text: string, limit: number | undefined): string {
  return limit !== undefined && text.length > limit
    ? `${text.slice(0, limit).trimEnd()}… (${text.length} characters; read it without compact for the rest)`
    : text;
}

function rows<T>(list: T[], compact: boolean): { rows: T[]; total: number } {
  return { rows: compact ? list.slice(0, COMPACT_ROWS) : list, total: list.length };
}

/** True if `describeCompendiumDocument` should format this entry. */
export function isOtherDocument(item: Doc): boolean {
  return OTHER_DOCUMENT_TYPES.has(String(item?.documentName ?? ''));
}

/**
 * The type-specific part of the answer. `compact` shortens long text and long lists; without it
 * the content is complete.
 */
export function describeCompendiumDocument(item: Doc, compact: boolean): Doc {
  const data: Doc = item.fullData ?? {};
  const limit = compact ? COMPACT_TEXT : undefined;

  switch (item.documentName) {
    case 'JournalEntry': {
      const pages = (data.pages ?? []) as Doc[];
      return {
        pages: pages.map(page => ({
          id: page._id ?? page.id,
          name: page.name,
          type: page.type,
          ...(page.type === 'text' || page.text
            ? { text: clip(stripHtml(page.text?.content), limit) }
            : {}),
          ...(page.src ? { src: page.src } : {}),
        })),
      };
    }

    case 'RollTable': {
      const results = ((data.results ?? []) as Doc[]).map(result => ({
        range: result.range,
        text: stripHtml(result.text ?? result.description ?? result.name ?? ''),
        ...(result.weight !== undefined ? { weight: result.weight } : {}),
        ...(result.documentUuid ? { documentUuid: result.documentUuid } : {}),
      }));
      const { rows: shown, total } = rows(results, compact);
      return {
        formula: data.formula,
        description: clip(stripHtml(data.description), limit),
        totalResults: total,
        results: shown,
      };
    }

    case 'Scene': {
      const count = (key: string): number => (Array.isArray(data[key]) ? data[key].length : 0);
      return {
        dimensions: { width: data.width, height: data.height },
        grid: data.grid,
        background: data.background?.src,
        counts: {
          tokens: count('tokens'),
          walls: count('walls'),
          lights: count('lights'),
          sounds: count('sounds'),
          notes: count('notes'),
          tiles: count('tiles'),
          drawings: count('drawings'),
        },
        ...(compact ? {} : { fullData: data }),
      };
    }

    case 'Macro':
      return {
        macroType: data.type,
        command: clip(String(data.command ?? ''), limit),
      };

    case 'Playlist': {
      const sounds = ((data.sounds ?? []) as Doc[]).map(s => ({
        name: s.name,
        path: s.path,
        volume: s.volume,
      }));
      const { rows: shown, total } = rows(sounds, compact);
      return { mode: data.mode, totalSounds: total, sounds: shown };
    }

    case 'Cards': {
      const cards = ((data.cards ?? []) as Doc[]).map(c => ({
        name: c.name,
        suit: c.suit,
        value: c.value,
      }));
      const { rows: shown, total } = rows(cards, compact);
      return { cardsType: data.type, totalCards: total, cards: shown };
    }

    case 'Adventure': {
      const names = (key: string): string[] =>
        ((data[key] ?? []) as Doc[]).map(d => String(d.name ?? d._id ?? ''));
      const contents = Object.fromEntries(
        [
          'actors',
          'items',
          'scenes',
          'journal',
          'tables',
          'macros',
          'playlists',
          'cards',
          'folders',
        ].map(key => [key, names(key)])
      );
      return {
        description: clip(stripHtml(data.description), limit),
        contents: compact
          ? Object.fromEntries(
              Object.entries(contents).map(([key, list]) => [
                key,
                { count: list.length, first: list.slice(0, 5) },
              ])
            )
          : contents,
      };
    }

    default:
      return { fullData: data };
  }
}
