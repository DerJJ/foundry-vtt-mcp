/**
 * Kinds: named groups of a game system's item types (inventory, spells, features, ...). They
 * let a caller ask for "the spells of this actor" without knowing that dnd5e calls the type
 * `spell` and PF2e has `spell` and `spellcastingEntry`. Systems that are not listed here are
 * grouped by the name of the type, which is right for most of them and is said so in `schema`.
 */

export type Kinds = Record<string, string[]>;

const SYSTEM_KINDS: Record<string, Kinds> = {
  dnd5e: {
    inventory: ['weapon', 'equipment', 'consumable', 'tool', 'loot', 'container', 'backpack'],
    spells: ['spell'],
    features: ['feat', 'class', 'subclass', 'race', 'background', 'facility'],
  },
  pf2e: {
    inventory: [
      'weapon',
      'armor',
      'shield',
      'equipment',
      'consumable',
      'treasure',
      'backpack',
      'kit',
    ],
    spells: ['spell', 'spellcastingEntry'],
    features: [
      'feat',
      'action',
      'class',
      'ancestry',
      'heritage',
      'background',
      'deity',
      'lore',
      'campaignFeature',
    ],
    effects: ['effect', 'condition', 'affliction'],
    attacks: ['melee'],
  },
};

const HEURISTICS: Array<[string, RegExp]> = [
  ['spells', /spell|magic|ritual|prayer|blessing|miracle/i],
  [
    'inventory',
    /weapon|armou?r|shield|equipment|trapping|consumable|loot|tool|container|gear|item|ammunition|treasure|backpack|vehicle/i,
  ],
  [
    'features',
    /feat|feature|talent|trait|skill|career|class|race|species|background|ability|advantage/i,
  ],
];

/**
 * The kinds for a system and its item types. The table for a verified system is used as it is,
 * with any type it does not name put under `other`; for the rest the type names decide.
 */
export function kindsFor(systemId: string, itemTypes: readonly string[]): Kinds {
  const table = SYSTEM_KINDS[systemId];
  const kinds: Kinds = {};
  const placed = new Set<string>();

  if (table) {
    for (const [kind, types] of Object.entries(table)) {
      const present = types.filter(type => itemTypes.includes(type));
      if (present.length) {
        kinds[kind] = present;
        present.forEach(type => placed.add(type));
      }
    }
  }
  for (const type of itemTypes) {
    if (placed.has(type)) continue;
    const match = table ? undefined : HEURISTICS.find(([, pattern]) => pattern.test(type));
    const kind = match?.[0] ?? 'other';
    (kinds[kind] ??= []).push(type);
  }
  return kinds;
}

/** True when the system has a hand-written table, so its kinds are not a guess. */
export function hasKindTable(systemId: string): boolean {
  return systemId in SYSTEM_KINDS;
}
