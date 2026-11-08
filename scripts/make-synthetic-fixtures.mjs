// Writes the committed test fixtures: invented worlds in the shape that
// scripts/export-fixtures.macro.js produces. Nothing here comes from a real world; every name,
// description and number is made up. Run: node scripts/make-synthetic-fixtures.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const outDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'packages',
  'foundry-module',
  'src',
  '__fixtures__'
);

// Deterministic 16-character ids.
let counter = 0;
const id = () => `synth${String(++counter).padStart(11, '0')}`;

const publication = { title: '', authors: '', license: 'synthetic', remaster: false };

function pf2e() {
  counter = 0;
  const abilityBlock = mods =>
    Object.fromEntries(Object.entries(mods).map(([k, mod]) => [k, { mod }]));
  const item = (name, type, system, extra = {}) => ({
    _id: id(),
    name,
    type,
    img: 'icons/svg/item-bag.svg',
    system: {
      description: { gm: '', value: `<p>Synthetic ${type}.</p>` },
      rules: [],
      slug: name.toLowerCase().replace(/\s+/g, '-'),
      traits: { otherTags: [], value: [], rarity: 'common' },
      publication,
      ...system,
    },
    effects: [],
    folder: null,
    sort: 0,
    ownership: { default: 0 },
    flags: {},
    ...extra,
  });
  const entryId = id();
  const character = {
    _id: id(),
    name: 'Synthetic Wizard',
    type: 'character',
    img: 'icons/svg/mystery-man.svg',
    folder: null,
    sort: 0,
    flags: {},
    ownership: { default: 0 },
    prototypeToken: { name: 'Synthetic Wizard', actorLink: true },
    effects: [],
    system: {
      abilities: abilityBlock({ str: 0, dex: 2, con: 1, int: 4, wis: 1, cha: 0 }),
      attributes: { hp: { value: 18, temp: 0 } },
      details: {
        level: { value: 3 },
        keyability: { value: 'int' },
        xp: { value: 0, max: 1000 },
        languages: { value: ['common'], details: '' },
        biography: { appearance: '', backstory: 'Invented for tests.', public: '' },
      },
      skills: {
        arcana: { rank: 2 },
        crafting: { rank: 1 },
        diplomacy: { rank: 1 },
      },
      resources: { heroPoints: { value: 1, max: 3 } },
      initiative: { statistic: 'perception' },
    },
    items: [
      item('Synthetic Staff', 'weapon', {
        level: { value: 0 },
        quantity: 1,
        baseItem: 'staff',
        bulk: { value: 1 },
        traits: { otherTags: [], value: ['two-hand-d8'], rarity: 'common' },
      }),
      item('Synthetic Robe', 'armor', { level: { value: 0 }, quantity: 1, bulk: { value: 0.1 } }),
      item('Synthetic Torch', 'equipment', {
        level: { value: 0 },
        quantity: 3,
        bulk: { value: 1 },
      }),
      item('Synthetic Feat', 'feat', {
        category: 'general',
        level: { value: 1 },
        actionType: { value: 'passive' },
        actions: { value: null },
        prerequisites: { value: [] },
      }),
      item(
        'Synthetic Spellbook',
        'spellcastingEntry',
        {
          ability: { value: 'int' },
          spelldc: { value: 7, dc: 17 },
          tradition: { value: 'arcane' },
          prepared: { value: 'prepared', flexible: false },
          slots: { slot0: { value: 5, max: 5 }, slot1: { value: 3, max: 3 } },
        },
        { _id: entryId }
      ),
      item('Synthetic Spark', 'spell', {
        level: { value: 1 },
        location: { value: entryId },
        range: { value: '30 feet' },
        target: { value: '1 creature' },
        traits: { otherTags: [], value: ['fire'], rarity: 'common', traditions: ['arcane'] },
      }),
      item('Synthetic Class', 'class', { hp: 6, keyAbility: { value: ['int'] } }),
    ],
  };
  const npc = {
    _id: id(),
    name: 'Synthetic Bandit',
    type: 'npc',
    img: 'icons/svg/mystery-man.svg',
    folder: null,
    sort: 0,
    flags: {},
    ownership: { default: 0 },
    prototypeToken: { name: 'Synthetic Bandit', actorLink: false },
    effects: [],
    system: {
      abilities: abilityBlock({ str: 3, dex: 2, con: 2, int: 0, wis: 1, cha: 0 }),
      attributes: {
        hp: { value: 20, temp: 0, max: 20, details: '' },
        ac: { value: 17, details: '' },
        allSaves: { value: '' },
        speed: { value: 25, otherSpeeds: [], details: '' },
      },
      details: {
        level: { value: 1 },
        languages: { value: ['common'], details: '' },
        blurb: 'Invented creature.',
        publicNotes: '',
        privateNotes: '',
        publication,
        creatureType: 'Humanoid',
        source: { value: '', author: '' },
      },
      perception: { details: '', mod: 6, senses: [], vision: true },
      saves: {
        fortitude: { value: 7, saveDetail: '' },
        reflex: { value: 5, saveDetail: '' },
        will: { value: 3, saveDetail: '' },
      },
      skills: {},
      traits: { value: ['human', 'humanoid'], rarity: 'common', size: { value: 'med' } },
      resources: {},
      initiative: { statistic: 'perception' },
    },
    items: [
      item('Synthetic Sword', 'melee', {
        bonus: { value: 9 },
        damageRolls: { 0: { damage: '1d8+3', damageType: 'slashing', category: null } },
        attackEffects: { value: [] },
        traits: { otherTags: [], value: ['agile'], config: {} },
      }),
      item('Synthetic Maneuver', 'action', {
        actionType: { value: 'action' },
        actions: { value: 1 },
        category: 'offensive',
      }),
    ],
  };
  const hazard = {
    _id: id(),
    name: 'Synthetic Pit Trap',
    type: 'hazard',
    img: 'icons/svg/trap.svg',
    folder: null,
    sort: 0,
    flags: {},
    ownership: { default: 0 },
    prototypeToken: { name: 'Synthetic Pit Trap', actorLink: false },
    effects: [],
    items: [],
    system: {
      attributes: {
        ac: { value: 15 },
        hp: { value: 30, max: 30 },
        hardness: 5,
        stealth: { value: 12, details: '' },
        immunities: [],
        weaknesses: [],
        resistances: [],
      },
      saves: { fortitude: { value: 0 }, reflex: { value: 8 }, will: { value: 0 } },
      details: {
        isComplex: false,
        level: { value: 1 },
        disable: 'Invented disable text.',
        description: 'Invented hazard.',
      },
    },
  };
  const loot = {
    _id: id(),
    name: 'Synthetic Chest',
    type: 'loot',
    img: 'icons/svg/chest.svg',
    folder: null,
    sort: 0,
    flags: {},
    ownership: { default: 0 },
    prototypeToken: { name: 'Synthetic Chest', actorLink: false },
    effects: [],
    items: [item('Synthetic Coin', 'treasure', { quantity: 25, bulk: { value: 0 } })],
    system: { details: { description: '', level: { value: 0 } }, lootSheetType: 'Loot' },
  };
  const party = {
    _id: id(),
    name: 'Synthetic Party',
    type: 'party',
    img: 'icons/svg/mystery-man.svg',
    folder: null,
    sort: 0,
    flags: {},
    ownership: { default: 0 },
    prototypeToken: { name: 'Synthetic Party', actorLink: true },
    effects: [],
    items: [],
    system: { details: { description: '' } },
  };
  const effectItem = item('Synthetic Boon', 'effect', {
    level: { value: 1 },
    duration: { value: 1, unit: 'rounds', sustained: false, expiry: 'turn-start' },
    tokenIcon: { show: true },
  });
  const worldItems = [
    item('Synthetic Dagger', 'weapon', { level: { value: 0 }, quantity: 1, bulk: { value: 0.1 } }),
    item('Synthetic Potion', 'consumable', {
      level: { value: 1 },
      quantity: 1,
      bulk: { value: 0.1 },
    }),
    effectItem,
  ];
  return {
    synthetic: true,
    exportedAt: '2000-01-01T00:00:00.000Z',
    foundry: { version: '14.0.0', release: 14 },
    system: { id: 'pf2e', version: '0.0.0-synthetic' },
    world: { id: 'synthetic-pf2e', title: 'Synthetic PF2e world' },
    conditions: ['blinded', 'dazzled', 'frightened', 'prone', 'sickened', 'stunned'],
    actors: [character, npc, hazard, loot, party],
    items: worldItems,
    effects: [],
    scene: {
      _id: id(),
      name: 'Synthetic Scene',
      width: 4000,
      height: 3000,
      padding: 0.25,
      grid: { type: 1, size: 100, distance: 5, units: 'ft' },
      tokens: [],
      lights: [],
      walls: [],
      notes: [],
      sounds: [],
      tiles: [],
      drawings: [],
      playlist: null,
      playlistSound: null,
      active: true,
      flags: {},
    },
    chat: [
      {
        _id: id(),
        type: 'base',
        author: 'user',
        timestamp: 946684800000,
        content: '<p>Synthetic message one.</p>',
        flavor: '',
        speaker: { scene: null, actor: null, alias: 'Synthetic' },
        whisper: [],
        blind: false,
        rolls: [],
        flags: {},
        system: {},
        style: 0,
        emote: false,
      },
      {
        _id: id(),
        type: 'base',
        author: 'user',
        timestamp: 946684801000,
        content: '<p>Synthetic whisper.</p>',
        flavor: '',
        speaker: { scene: null, actor: null, alias: 'Synthetic' },
        whisper: ['user'],
        blind: false,
        rolls: [],
        flags: {},
        system: {},
        style: 0,
        emote: false,
      },
    ],
    packs: [1, 2, 3].map(n => ({
      collection: `synthetic.pack-${n}`,
      documentName: 'Actor',
      title: `Synthetic Pack ${n}`,
      total: 25,
      rows: Array.from({ length: 5 }, (_, i) => {
        const rowId = id();
        return {
          _id: rowId,
          folder: null,
          img: 'icons/svg/mystery-man.svg',
          name: `Synthetic Entry ${n}.${i + 1}`,
          type: 'npc',
          uuid: `Compendium.synthetic.pack-${n}.Actor.${rowId}`,
          pack: `synthetic.pack-${n}`,
        };
      }),
    })),
  };
}

function dnd5e() {
  counter = 0;
  const abilities = scores =>
    Object.fromEntries(
      Object.entries(scores).map(([k, value]) => [k, { value, proficient: 0, bonuses: {} }])
    );
  const item = (name, type, system) => ({
    _id: id(),
    name,
    type,
    img: 'icons/svg/item-bag.svg',
    system: {
      description: { value: `<p>Synthetic ${type}.</p>`, chat: '' },
      source: {},
      ...system,
    },
    effects: [],
    folder: null,
    sort: 0,
    ownership: { default: 0 },
    flags: {},
  });
  const character = {
    _id: id(),
    name: 'Synthetic Fighter',
    type: 'character',
    img: 'icons/svg/mystery-man.svg',
    folder: null,
    sort: 0,
    flags: {},
    ownership: { default: 0 },
    prototypeToken: { name: 'Synthetic Fighter', actorLink: true },
    effects: [],
    system: {
      abilities: abilities({ str: 16, dex: 12, con: 14, int: 10, wis: 10, cha: 8 }),
      attributes: {
        hp: { value: 28, max: 28, temp: 0, tempmax: 0 },
        ac: { flat: null, calc: 'default' },
        movement: { walk: 30, units: 'ft' },
      },
      details: {
        biography: { value: 'Invented for tests.', public: '' },
        level: 3,
        xp: { value: 0 },
      },
      skills: { ath: { value: 1 }, prc: { value: 0 } },
      currency: { pp: 0, gp: 10, ep: 0, sp: 0, cp: 0 },
    },
    items: [
      item('Synthetic Longsword', 'weapon', {
        quantity: 1,
        equipped: true,
        damage: { base: { number: 1, denomination: 8, bonus: '', types: ['slashing'] } },
      }),
      item('Synthetic Shield', 'equipment', { quantity: 1, equipped: true }),
      item('Synthetic Fighting Style', 'feat', { type: { value: 'class' } }),
    ],
  };
  const npc = {
    _id: id(),
    name: 'Synthetic Raider',
    type: 'npc',
    img: 'icons/svg/mystery-man.svg',
    folder: null,
    sort: 0,
    flags: {},
    ownership: { default: 0 },
    prototypeToken: { name: 'Synthetic Raider', actorLink: false },
    effects: [],
    system: {
      abilities: abilities({ str: 14, dex: 12, con: 12, int: 8, wis: 10, cha: 8 }),
      attributes: {
        hp: { value: 15, max: 15, formula: '3d8+3' },
        ac: { flat: 13, calc: 'flat' },
        movement: { walk: 30, units: 'ft' },
      },
      details: {
        cr: 0.5,
        type: { value: 'humanoid', subtype: '' },
        alignment: 'Neutral',
        biography: { value: '' },
      },
      traits: { size: 'med', di: { value: [] }, dr: { value: [] }, dv: { value: [] } },
    },
    items: [
      item('Synthetic Axe', 'weapon', {
        quantity: 1,
        equipped: true,
        damage: { base: { number: 1, denomination: 6, bonus: '', types: ['slashing'] } },
      }),
    ],
  };
  const spellcaster = {
    ...character,
    _id: id(),
    name: 'Synthetic Mage',
    prototypeToken: { name: 'Synthetic Mage', actorLink: true },
    system: {
      ...character.system,
      abilities: abilities({ str: 8, dex: 14, con: 12, int: 16, wis: 10, cha: 10 }),
      spells: { spell1: { value: 2, override: null }, spell2: { value: 0, override: null } },
    },
    items: [
      item('Synthetic Bolt', 'spell', {
        level: 0,
        school: 'evo',
        method: 'spell',
        properties: ['vocal', 'somatic'],
        activation: { type: 'action', value: 1 },
      }),
      item('Synthetic Ward', 'spell', {
        level: 1,
        school: 'abj',
        method: 'spell',
        properties: ['vocal', 'somatic'],
        activation: { type: 'action', value: 1 },
      }),
    ],
  };
  return {
    synthetic: true,
    exportedAt: '2000-01-01T00:00:00.000Z',
    foundry: { version: '14.0.0', release: 14 },
    system: { id: 'dnd5e', version: '0.0.0-synthetic' },
    world: { id: 'synthetic-dnd5e', title: 'Synthetic D&D 5e world' },
    conditions: ['blinded', 'charmed', 'frightened', 'poisoned', 'prone', 'stunned'],
    actors: [character, npc, spellcaster],
    items: [
      item('Synthetic Rope', 'equipment', { quantity: 1, weight: { value: 10, units: 'lb' } }),
      item('Synthetic Bow', 'weapon', {
        quantity: 1,
        damage: { base: { number: 1, denomination: 8, bonus: '', types: ['piercing'] } },
      }),
    ],
    effects: [
      {
        _id: id(),
        name: 'Synthetic Blessing',
        img: 'icons/svg/aura.svg',
        disabled: false,
        transfer: false,
        duration: { rounds: 10 },
        changes: [{ key: 'system.attributes.ac.bonus', mode: 2, value: '1', priority: null }],
        statuses: [],
        flags: {},
      },
    ],
    scene: {
      _id: id(),
      name: 'Synthetic Scene',
      width: 4000,
      height: 3000,
      padding: 0.25,
      grid: { type: 1, size: 100, distance: 5, units: 'ft' },
      tokens: [],
      lights: [],
      walls: [],
      notes: [],
      sounds: [],
      tiles: [],
      drawings: [],
      playlist: null,
      playlistSound: null,
      active: true,
      flags: {},
    },
    chat: [
      {
        _id: id(),
        type: 'base',
        author: 'user',
        timestamp: 946684800000,
        content: '<p>Synthetic message.</p>',
        flavor: '',
        speaker: { scene: null, actor: null, alias: 'Synthetic' },
        whisper: [],
        blind: false,
        rolls: [],
        flags: {},
        system: {},
        style: 0,
        emote: false,
      },
    ],
    packs: [1, 2, 3].map(n => ({
      collection: `synthetic.pack-${n}`,
      documentName: 'Actor',
      title: `Synthetic Pack ${n}`,
      total: 25,
      rows: Array.from({ length: 5 }, (_, i) => {
        const rowId = id();
        return {
          _id: rowId,
          folder: null,
          img: 'icons/svg/mystery-man.svg',
          name: `Synthetic Entry ${n}.${i + 1}`,
          type: 'npc',
          uuid: `Compendium.synthetic.pack-${n}.Actor.${rowId}`,
          pack: `synthetic.pack-${n}`,
        };
      }),
    })),
  };
}

mkdirSync(outDir, { recursive: true });
for (const [name, data] of [
  ['pf2e-synthetic.json', pf2e()],
  ['dnd5e-synthetic.json', dnd5e()],
]) {
  writeFileSync(join(outDir, name), JSON.stringify(data, null, 2) + '\n');
  console.log(`wrote ${name}`);
}
