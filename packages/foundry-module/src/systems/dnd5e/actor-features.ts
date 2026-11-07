import { MODULE_ID } from '../../constants.js';
import { validateFoundryState, auditLog } from '../../services/support.js';
import type { FoundryDataAccess } from '../../data-access.js';

// =============================================================================
// Shared dnd5e helpers
// =============================================================================

function slugify(name: string, fallback = 'feature'): string {
  return (
    name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '') || fallback
  );
}

// =============================================================================
// NPC creation helpers — module-level, used exclusively by createNpcActor
// =============================================================================

const NPC_DAMAGE_CANONICAL = new Set([
  'acid',
  'bludgeoning',
  'cold',
  'fire',
  'force',
  'lightning',
  'necrotic',
  'piercing',
  'poison',
  'psychic',
  'radiant',
  'slashing',
  'thunder',
]);

const NPC_CONDITION_CANONICAL = new Set([
  'blinded',
  'charmed',
  'deafened',
  'exhaustion',
  'frightened',
  'grappled',
  'incapacitated',
  'invisible',
  'paralyzed',
  'petrified',
  'poisoned',
  'prone',
  'restrained',
  'stunned',
  'unconscious',
]);

const NPC_SIZE_MAP: Record<string, string> = {
  tiny: 'tiny',
  small: 'sm',
  medium: 'med',
  large: 'lg',
  huge: 'huge',
  gargantuan: 'grg',
};

const NPC_SKILL_MAP: Record<string, string> = {
  Acrobatics: 'acr',
  'Animal Handling': 'ani',
  Arcana: 'arc',
  Athletics: 'ath',
  Deception: 'dec',
  History: 'his',
  Insight: 'ins',
  Intimidation: 'itm',
  Investigation: 'inv',
  Medicine: 'med',
  Nature: 'nat',
  Perception: 'prc',
  Performance: 'prf',
  Persuasion: 'per',
  Religion: 'rel',
  'Sleight of Hand': 'slt',
  Stealth: 'ste',
  Survival: 'sur',
};

function npcNormalizeCR(input: string | number): number {
  if (typeof input === 'number') return input;
  if (input.includes('/')) {
    const [num, den] = input.split('/').map(Number);
    return num / den;
  }
  return parseInt(input, 10);
}

function npcFormatCR(value: number): string {
  if (value === 0) return '0';
  if (value === 0.125) return '1/8';
  if (value === 0.25) return '1/4';
  if (value === 0.5) return '1/2';
  return String(Math.round(value));
}

function npcBuildSkillsBlock(
  skills: Array<{ skill: string; proficiency: string }>
): Record<string, { value: number; ability?: string }> {
  const result: Record<string, { value: number; ability?: string }> = {};
  // Read governing ability live from CONFIG.DND5E.skills — the currently-loaded system/rules
  // config (full core books, not a hardcoded SRD snapshot) — rather than a static map, so this
  // stays correct even if the system's skill-ability associations ever change.
  const dnd5eConfig: any = (globalThis as any).CONFIG?.DND5E;
  for (const { skill, proficiency } of skills) {
    const key = NPC_SKILL_MAP[skill];
    if (key) {
      const entry: { value: number; ability?: string } = {
        value: proficiency === 'expert' ? 2 : 1,
      };
      const liveAbility: string | undefined = dnd5eConfig?.skills?.[key]?.ability;
      if (liveAbility) entry.ability = liveAbility;
      result[key] = entry;
    }
  }
  return result;
}

// =============================================================================
// Live compendium templates — Tier 2 of the build strategy for hand-built features.
//
// Tom's instruction (2026-09-05): if a feature is standard, take it straight from what already
// exists; if it's custom, build it on top of the closest real thing available; only build fully
// from scratch if there's genuinely no reasonable template. Hand-typing an entire Activity's data
// shape from a remembered/hardcoded snapshot (the previous approach — one such snapshot was
// explicitly "verified against dnd5e 5.1.8 Banshee Wail" per a comment left in this file) goes
// stale as the system/module versions move on: confirmed live on 2026-09-05 that the *current*
// (5.3.3, 2024-converted) Banshee's "Deathly Wail" is now a `save`-type activity, not the `damage`
// type the old hardcoded template assumed — the exact kind of drift this approach exists to avoid.
//
// This fetches a real, live item from an installed compendium and returns its full item-level
// system data plus one embedded activity of the requested type, to use as a structural scaffold —
// callers override only the specific fields that make the feature custom (ability, damage, range,
// etc.) and keep everything else (module-added boilerplate — Midi-QOL fields, region behavior,
// whatever a future system update adds — none of which this file has to know about or keep in
// sync by hand). Returns null if the compendium/item/activity-of-that-type isn't found, so callers
// fall back to full from-scratch construction (Tier 3) rather than fail outright.
// =============================================================================

async function fetchLiveTemplate(
  packId: string,
  itemName: string,
  activityType: string
): Promise<{ itemSystem: Record<string, any>; activity: Record<string, any> } | null> {
  try {
    const pack = (game as any).packs?.get(packId);
    if (!pack) return null;
    const index = await pack.getIndex();
    const entry = index.find((e: any) => e.name === itemName);
    if (!entry) return null;
    const doc = await pack.getDocument(entry._id);
    const raw = doc.toObject();
    const activityEntry = Object.values(raw.system?.activities ?? {}).find(
      (a: any) => a.type === activityType
    ) as Record<string, any> | undefined;
    if (!activityEntry) return null;
    return {
      itemSystem: raw.system,
      activity: (foundry.utils as any).deepClone(activityEntry),
    };
  } catch (err) {
    console.warn(
      `[${MODULE_ID}] fetchLiveTemplate failed for ${packId}/${itemName} (${activityType}) — falling back to from-scratch construction`,
      err
    );
    return null;
  }
}

// =============================================================================
// Limited-use tracker — item-level `system.uses`, confirmed live (2026-09-05) against real
// compendium examples rather than guessed: Adult Red Dragon's "Fire Breath" stores its
// Recharge 5-6 as `{max:"1", recovery:[{period:"recharge", type:"recoverAll", formula:"5"}]}`
// at the ITEM level (its own Activity's `uses` field stays empty) — confirmed the same shape
// recurs across other monsters' recharge abilities (Vampire's Charm, Marilith's Teleport, Pit
// Fiend's Hellfire Spellcasting). Per-day abilities (Archmage's Misty Step/Protective Magic,
// Githyanki Knight's Misty Step) use `{max:"N", recovery:[{period:"day", type:"recoverAll"}]}`.
// Note "recharge" as a period value doesn't appear in CONFIG.DND5E.limitedUsePeriods at all
// (only day/dawn/dusk/lr/sr/turn/turnStart/turnEnd/initiative are listed there) — it's handled
// as a special case elsewhere in the system, so this was only discoverable by reading real
// stored data, not by inspecting the config schema.
// =============================================================================

function buildUsesField(uses?: { max: number; per: 'day' | 'recharge'; rechargeOn?: number }): {
  max: string;
  recovery: any[];
  spent: number;
} {
  if (!uses) return { max: '', recovery: [], spent: 0 };
  if (uses.per === 'recharge') {
    return {
      max: String(uses.max),
      recovery: [{ period: 'recharge', type: 'recoverAll', formula: String(uses.rechargeOn ?? 6) }],
      spent: 0,
    };
  }
  return {
    max: String(uses.max),
    recovery: [{ period: 'day', type: 'recoverAll' }],
    spent: 0,
  };
}

// =============================================================================
// Attack feature helpers — module-level, used exclusively by addAttackToActor
// =============================================================================

const ATTACK_DAMAGE_CANONICAL = new Set([
  'acid',
  'bludgeoning',
  'cold',
  'fire',
  'force',
  'lightning',
  'necrotic',
  'piercing',
  'poison',
  'psychic',
  'radiant',
  'slashing',
  'thunder',
]);

const ATTACK_PROPERTY_CANONICAL = new Set([
  'ada',
  'amm',
  'fin',
  'fir',
  'foc',
  'hvy',
  'lgt',
  'lod',
  'mgc',
  'rch',
  'ret',
  'spc',
  'thr',
  'two',
  'ver',
]);

// =============================================================================
// Aura feature helpers — module-level, used exclusively by addAuraToActor
// =============================================================================

const AURA_DAMAGE_CANONICAL = new Set([
  'acid',
  'bludgeoning',
  'cold',
  'fire',
  'force',
  'lightning',
  'necrotic',
  'piercing',
  'poison',
  'psychic',
  'radiant',
  'slashing',
  'thunder',
]);

// =============================================================================
// Attack+save helpers — module-level, used exclusively by addAttackWithSaveToActor
// =============================================================================

const ATTACK_WITH_SAVE_DAMAGE_CANONICAL = new Set([
  'acid',
  'bludgeoning',
  'cold',
  'fire',
  'force',
  'lightning',
  'necrotic',
  'piercing',
  'poison',
  'psychic',
  'radiant',
  'slashing',
  'thunder',
]);

// =============================================================================
// Spellcasting slot tables — module-level, used by setActorSpellcasting
//
// Each array has 20 entries (index 0 = level 1 … index 19 = level 20).
// Each entry is a 9-element tuple: [L1, L2, L3, L4, L5, L6, L7, L8, L9].
// Source: SRD 5.1 spell slot tables.
// =============================================================================

// prettier-ignore
const FULL_CASTER_SLOTS: number[][] = [
  //  L1  L2  L3  L4  L5  L6  L7  L8  L9
  [   2,   0,   0,   0,   0,   0,   0,   0,   0 ], // level  1
  [   3,   0,   0,   0,   0,   0,   0,   0,   0 ], // level  2
  [   4,   2,   0,   0,   0,   0,   0,   0,   0 ], // level  3
  [   4,   3,   0,   0,   0,   0,   0,   0,   0 ], // level  4
  [   4,   3,   2,   0,   0,   0,   0,   0,   0 ], // level  5
  [   4,   3,   3,   0,   0,   0,   0,   0,   0 ], // level  6
  [   4,   3,   3,   1,   0,   0,   0,   0,   0 ], // level  7
  [   4,   3,   3,   2,   0,   0,   0,   0,   0 ], // level  8
  [   4,   3,   3,   3,   1,   0,   0,   0,   0 ], // level  9
  [   4,   3,   3,   3,   2,   0,   0,   0,   0 ], // level 10
  [   4,   3,   3,   3,   2,   1,   0,   0,   0 ], // level 11
  [   4,   3,   3,   3,   2,   1,   0,   0,   0 ], // level 12
  [   4,   3,   3,   3,   2,   1,   1,   0,   0 ], // level 13
  [   4,   3,   3,   3,   2,   1,   1,   0,   0 ], // level 14
  [   4,   3,   3,   3,   2,   1,   1,   1,   0 ], // level 15
  [   4,   3,   3,   3,   2,   1,   1,   1,   0 ], // level 16
  [   4,   3,   3,   3,   2,   1,   1,   1,   1 ], // level 17
  [   4,   3,   3,   3,   3,   1,   1,   1,   1 ], // level 18
  [   4,   3,   3,   3,   3,   2,   1,   1,   1 ], // level 19
  [   4,   3,   3,   3,   3,   2,   2,   1,   1 ], // level 20
];

// prettier-ignore
/** Paladin / Ranger — half-caster (rounds down). Level 1 = no slots. */
const HALF_CASTER_SLOTS: number[][] = [
  //  L1  L2  L3  L4  L5  L6  L7  L8  L9
  [   0,   0,   0,   0,   0,   0,   0,   0,   0 ], // level  1 — no slots
  [   2,   0,   0,   0,   0,   0,   0,   0,   0 ], // level  2
  [   3,   0,   0,   0,   0,   0,   0,   0,   0 ], // level  3
  [   3,   0,   0,   0,   0,   0,   0,   0,   0 ], // level  4
  [   4,   2,   0,   0,   0,   0,   0,   0,   0 ], // level  5
  [   4,   2,   0,   0,   0,   0,   0,   0,   0 ], // level  6
  [   4,   3,   0,   0,   0,   0,   0,   0,   0 ], // level  7
  [   4,   3,   0,   0,   0,   0,   0,   0,   0 ], // level  8
  [   4,   3,   2,   0,   0,   0,   0,   0,   0 ], // level  9
  [   4,   3,   2,   0,   0,   0,   0,   0,   0 ], // level 10
  [   4,   3,   3,   0,   0,   0,   0,   0,   0 ], // level 11
  [   4,   3,   3,   0,   0,   0,   0,   0,   0 ], // level 12
  [   4,   3,   3,   1,   0,   0,   0,   0,   0 ], // level 13
  [   4,   3,   3,   1,   0,   0,   0,   0,   0 ], // level 14
  [   4,   3,   3,   2,   0,   0,   0,   0,   0 ], // level 15
  [   4,   3,   3,   2,   0,   0,   0,   0,   0 ], // level 16
  [   4,   3,   3,   3,   1,   0,   0,   0,   0 ], // level 17
  [   4,   3,   3,   3,   1,   0,   0,   0,   0 ], // level 18
  [   4,   3,   3,   3,   2,   0,   0,   0,   0 ], // level 19
  [   4,   3,   3,   3,   2,   0,   0,   0,   0 ], // level 20
];

// prettier-ignore
/** Artificer — half-caster (rounds UP). Starts at level 1. Max 5th-level slots. */
const ARTIFICER_SLOTS: number[][] = [
  //  L1  L2  L3  L4  L5  L6  L7  L8  L9
  [   2,   0,   0,   0,   0,   0,   0,   0,   0 ], // level  1
  [   2,   0,   0,   0,   0,   0,   0,   0,   0 ], // level  2
  [   3,   0,   0,   0,   0,   0,   0,   0,   0 ], // level  3
  [   3,   0,   0,   0,   0,   0,   0,   0,   0 ], // level  4
  [   4,   2,   0,   0,   0,   0,   0,   0,   0 ], // level  5
  [   4,   2,   0,   0,   0,   0,   0,   0,   0 ], // level  6
  [   4,   3,   0,   0,   0,   0,   0,   0,   0 ], // level  7
  [   4,   3,   0,   0,   0,   0,   0,   0,   0 ], // level  8
  [   4,   3,   2,   0,   0,   0,   0,   0,   0 ], // level  9
  [   4,   3,   2,   0,   0,   0,   0,   0,   0 ], // level 10
  [   4,   3,   3,   0,   0,   0,   0,   0,   0 ], // level 11
  [   4,   3,   3,   0,   0,   0,   0,   0,   0 ], // level 12
  [   4,   3,   3,   1,   0,   0,   0,   0,   0 ], // level 13
  [   4,   3,   3,   1,   0,   0,   0,   0,   0 ], // level 14
  [   4,   3,   3,   2,   0,   0,   0,   0,   0 ], // level 15
  [   4,   3,   3,   2,   0,   0,   0,   0,   0 ], // level 16
  [   4,   3,   3,   3,   1,   0,   0,   0,   0 ], // level 17
  [   4,   3,   3,   3,   1,   0,   0,   0,   0 ], // level 18
  [   4,   3,   3,   3,   2,   0,   0,   0,   0 ], // level 19
  [   4,   3,   3,   3,   2,   0,   0,   0,   0 ], // level 20
];

// prettier-ignore
/** Warlock Pact Magic — slot count and slot level per warlock level. */
const WARLOCK_PACT_TABLE: Array<{ max: number; level: number }> = [
  { max: 1, level: 1 }, // level  1
  { max: 2, level: 1 }, // level  2
  { max: 2, level: 2 }, // level  3
  { max: 2, level: 2 }, // level  4
  { max: 2, level: 3 }, // level  5
  { max: 2, level: 3 }, // level  6
  { max: 2, level: 4 }, // level  7
  { max: 2, level: 4 }, // level  8
  { max: 2, level: 5 }, // level  9
  { max: 2, level: 5 }, // level 10
  { max: 3, level: 5 }, // level 11
  { max: 3, level: 5 }, // level 12
  { max: 3, level: 5 }, // level 13
  { max: 3, level: 5 }, // level 14
  { max: 3, level: 5 }, // level 15
  { max: 3, level: 5 }, // level 16
  { max: 4, level: 5 }, // level 17
  { max: 4, level: 5 }, // level 18
  { max: 4, level: 5 }, // level 19
  { max: 4, level: 5 }, // level 20
];
export class Dnd5eActorFeatureService {
  constructor(private readonly access: FoundryDataAccess) {}

  // ===== D&D 5E FEATURE CREATION =====

  /**
   * Add a save-attack feature (feat) to an existing D&D 5e actor.
   * Creates a single save Activity with damage and an optional area template.
   */
  async addSaveFeatureToActor(data: {
    actorIdentifier: string;
    featureName: string;
    description: string;
    activationType: string;
    saveAbility: string;
    saveDC: number;
    damageParts: Array<{ number: number; denomination: number; type: string; bonus?: number }>;
    halfOnSave: boolean;
    areaType: string;
    areaSize?: number;
    areaUnits: string;
    affectsType: string;
    uses?: { max: number; per: 'day' | 'recharge'; rechargeOn?: number };
  }): Promise<any> {
    validateFoundryState();

    try {
      // 1. Lookup actor
      const actor = this.access.characters.findActorByIdentifier(data.actorIdentifier);
      if (!actor) {
        throw new Error(`Actor not found: "${data.actorIdentifier}"`);
      }

      // 2. System guard
      if ((game.system as any).id !== 'dnd5e') {
        throw new Error(
          `addSaveFeatureToActor requires D&D 5e. ` +
            `Current system: "${(game.system as any).id}".`
        );
      }

      // 3. Duplicate check (by name only, regardless of item type)
      const existing = actor.items.find((i: any) => i.name === data.featureName);
      if (existing) {
        throw new Error(
          `Feature "${data.featureName}" already exists on actor "${actor.name}" ` +
            `(id: ${existing.id}). Use a different name or remove the existing feature first.`
        );
      }

      // 4. Generate activity ID
      const activityId: string = (foundry.utils as any).randomID(16);

      // 5. Slug identifier
      const identifier = slugify(data.featureName);

      // 5a. Map emanation → radius (Foundry uses "radius" for radial emanations)
      const mappedAreaType: string = data.areaType === 'emanation' ? 'radius' : data.areaType;

      // 6. Build item data — Tier 2: clone a real, live save-based monster feature (Adult Red
      // Dragon's Fire Breath) as a structural scaffold, override only caller-specified fields.
      // Falls back to full from-scratch construction if that live template isn't available.
      const saveTemplate = await fetchLiveTemplate(
        'dnd-monster-manual.actors',
        'Adult Red Dragon',
        'save'
      );

      let itemData: Record<string, any>;

      if (saveTemplate) {
        const activity = saveTemplate.activity;
        activity._id = activityId;
        activity.name = '';
        activity.sort = 0;
        activity.description = {};
        activity.effects = [];
        activity.activation = {
          ...activity.activation,
          type: data.activationType,
          override: false,
        };
        activity.target = {
          ...activity.target,
          template: {
            ...activity.target?.template,
            contiguous: false,
            units: data.areaUnits,
            count: '',
            type: mappedAreaType,
            size: mappedAreaType ? String(data.areaSize) : '',
          },
          affects: {
            choice: false,
            count: '',
            type: data.affectsType,
            special: '',
          },
        };
        activity.damage = {
          ...activity.damage,
          onSave: data.halfOnSave ? 'half' : 'none',
          parts: data.damageParts.map(p => ({
            custom: { enabled: false, formula: '' },
            number: p.number,
            denomination: p.denomination,
            bonus: p.bonus !== undefined ? String(p.bonus) : '',
            types: [p.type],
            scaling: { mode: '', number: 1 },
          })),
        };
        activity.save = {
          ...activity.save,
          ability: [data.saveAbility],
          dc: { calculation: '', formula: String(data.saveDC) },
        };

        itemData = {
          name: data.featureName,
          type: 'feat',
          img: 'systems/dnd5e/icons/svg/items/feature.svg',
          system: {
            ...(foundry.utils as any).deepClone(saveTemplate.itemSystem),
            description: { value: data.description, chat: '' },
            identifier,
            source: { revision: 1, rules: '2024' },
            type: { value: 'monster', subtype: '' },
            uses: buildUsesField(data.uses),
            properties: [],
            requirements: '',
            activities: { [activityId]: activity },
          },
          effects: [],
        };
      } else {
        // Tier 3 — no live template available, build fully from scratch.
        itemData = {
          name: data.featureName,
          type: 'feat',
          img: 'systems/dnd5e/icons/svg/items/feature.svg',
          system: {
            description: { value: data.description, chat: '' },
            identifier,
            source: { revision: 1, rules: '2024' },
            type: { value: 'monster', subtype: '' },
            uses: buildUsesField(data.uses),
            advancement: [],
            crewed: false,
            enchant: {},
            prerequisites: { items: [], repeatable: false, level: null },
            properties: [],
            requirements: '',
            activities: {
              [activityId]: {
                _id: activityId,
                type: 'save',
                sort: 0,
                name: '',
                activation: {
                  type: data.activationType,
                  override: false,
                },
                consumption: {
                  scaling: { allowed: false },
                  spellSlot: true,
                  targets: [],
                },
                description: {},
                duration: { units: 'inst', concentration: false, override: false },
                effects: [],
                range: { units: 'self', override: false },
                uses: { spent: 0, recovery: [] },
                target: {
                  template: {
                    contiguous: false,
                    units: data.areaUnits,
                    count: '',
                    type: mappedAreaType,
                    size: mappedAreaType ? String(data.areaSize) : '',
                  },
                  affects: {
                    choice: false,
                    count: '',
                    type: data.affectsType,
                    special: '',
                  },
                  override: false,
                  prompt: true,
                },
                damage: {
                  onSave: data.halfOnSave ? 'half' : 'none',
                  parts: data.damageParts.map(p => ({
                    custom: { enabled: false, formula: '' },
                    number: p.number,
                    denomination: p.denomination,
                    bonus: p.bonus !== undefined ? String(p.bonus) : '',
                    types: [p.type],
                    scaling: { mode: '', number: 1 },
                  })),
                },
                save: {
                  ability: [data.saveAbility],
                  dc: {
                    calculation: '',
                    formula: String(data.saveDC),
                  },
                },
              },
            },
          },
          effects: [],
        };
      }

      // 7. Create embedded item
      const [created] = (await actor.createEmbeddedDocuments('Item', [itemData])) as any[];

      auditLog(
        'addSaveFeatureToActor',
        { actorId: actor.id, featureName: data.featureName },
        'success'
      );

      // 8. Return structured result
      return {
        success: true,
        item: { id: created.id, name: created.name },
        actor: { id: actor.id, name: actor.name },
      };
    } catch (error) {
      console.error(`[${MODULE_ID}] Failed to add save feature to actor`, error);
      auditLog(
        'addSaveFeatureToActor',
        { actorIdentifier: data.actorIdentifier, featureName: data.featureName },
        'failure',
        error instanceof Error ? error.message : 'Unknown error'
      );
      throw error;
    }
  }

  // ===== CREATE NPC ACTOR (D&D 5e) =====

  async createNpcActor(data: {
    name: string;
    creatureType: string;
    creatureSubtype: string;
    size: string;
    alignment: string;
    cr: string | number;
    hpAverage: number;
    hpFormula: string;
    acMode: string;
    acValue?: number;
    abilities: { str: number; dex: number; con: number; int: number; wis: number; cha: number };
    savingThrows: string[];
    walkSpeed: number;
    flySpeed: number;
    swimSpeed: number;
    climbSpeed: number;
    burrowSpeed: number;
    hover: boolean;
    darkvision: number;
    blindsight: number;
    tremorsense: number;
    truesight: number;
    specialSenses: string;
    skills: Array<{ skill: string; proficiency: string }>;
    damageImmunities: string[];
    damageResistances: string[];
    damageVulnerabilities: string[];
    conditionImmunities: string[];
    languages: string[];
    languagesCustom: string;
    biography: string;
    sourceBook: string;
    sourcePage: string;
    sourceRules: string;
  }): Promise<any> {
    validateFoundryState();

    try {
      // 1. System guard
      if ((game.system as any).id !== 'dnd5e') {
        throw new Error(
          `createNpcActor requires D&D 5e. ` + `Current system: "${(game.system as any).id}".`
        );
      }

      // 2. Duplicate check by name — only against other NPCs, so a player
      //    character sharing the name does not block NPC creation.
      const existingActor = game.actors?.find((a: any) => a.name === data.name && a.type === 'npc');
      if (existingActor) {
        throw new Error(
          `NPC "${data.name}" already exists (id: ${existingActor.id}). ` +
            `Use a different name or remove the existing NPC first.`
        );
      }

      // 3. Soft validation — collect warnings, do NOT block creation
      const warnings: string[] = [];
      const allDamageValues: Array<{ field: string; value: string }> = [
        ...data.damageImmunities.map(v => ({ field: 'damageImmunities', value: v })),
        ...data.damageResistances.map(v => ({ field: 'damageResistances', value: v })),
        ...data.damageVulnerabilities.map(v => ({ field: 'damageVulnerabilities', value: v })),
      ];
      for (const { field, value } of allDamageValues) {
        if (!NPC_DAMAGE_CANONICAL.has(value)) {
          const msg = `Unknown damage type "${value}" in ${field} — verify it matches dnd5e system values`;
          warnings.push(msg);
          console.warn(`[${MODULE_ID}] ${msg}`);
        }
      }
      for (const value of data.conditionImmunities) {
        if (!NPC_CONDITION_CANONICAL.has(value)) {
          const msg = `Unknown condition "${value}" in conditionImmunities — verify it matches dnd5e system values`;
          warnings.push(msg);
          console.warn(`[${MODULE_ID}] ${msg}`);
        }
      }

      // 4. Normalize CR to float
      const normalizedCR = npcNormalizeCR(data.cr);

      // 5. Folder
      const folderId = await this.access.actors.getOrCreateFolder('Foundry MCP Creatures', 'Actor');

      // 6. Ability scores with saving throw proficiency flags
      const savingThrowSet = new Set(data.savingThrows);
      const abilities = {
        str: { value: data.abilities.str, proficient: savingThrowSet.has('str') ? 1 : 0 },
        dex: { value: data.abilities.dex, proficient: savingThrowSet.has('dex') ? 1 : 0 },
        con: { value: data.abilities.con, proficient: savingThrowSet.has('con') ? 1 : 0 },
        int: { value: data.abilities.int, proficient: savingThrowSet.has('int') ? 1 : 0 },
        wis: { value: data.abilities.wis, proficient: savingThrowSet.has('wis') ? 1 : 0 },
        cha: { value: data.abilities.cha, proficient: savingThrowSet.has('cha') ? 1 : 0 },
      };

      // 7. AC block — omit flat when mode is "default"
      const acBlock =
        data.acMode === 'flat' ? { calc: 'flat', flat: data.acValue } : { calc: 'default' };

      // 8. Build full actor data
      const actorData: any = {
        name: data.name,
        type: 'npc',
        system: {
          abilities,
          attributes: {
            ac: acBlock,
            hp: {
              value: data.hpAverage,
              max: data.hpAverage,
              temp: 0,
              tempmax: 0,
              formula: data.hpFormula,
            },
            movement: {
              walk: data.walkSpeed,
              fly: data.flySpeed,
              swim: data.swimSpeed,
              climb: data.climbSpeed,
              burrow: data.burrowSpeed,
              units: 'ft',
              hover: data.hover,
              special: '',
            },
            senses: {
              darkvision: data.darkvision,
              blindsight: data.blindsight,
              tremorsense: data.tremorsense,
              truesight: data.truesight,
              units: 'ft',
              special: data.specialSenses,
            },
          },
          details: {
            cr: normalizedCR,
            type: {
              value: data.creatureType,
              subtype: data.creatureSubtype,
            },
            alignment: data.alignment,
            biography: {
              value: data.biography,
              public: '',
            },
            source: {
              revision: 1,
              rules: data.sourceRules,
              book: data.sourceBook,
              page: data.sourcePage,
              custom: '',
              license: '',
            },
          },
          traits: {
            size: NPC_SIZE_MAP[data.size] ?? 'med',
            di: { value: data.damageImmunities, custom: '', bypasses: [] },
            dr: { value: data.damageResistances, custom: '', bypasses: [] },
            dv: { value: data.damageVulnerabilities, custom: '', bypasses: [] },
            ci: { value: data.conditionImmunities, custom: '' },
            languages: {
              value: data.languages,
              custom: data.languagesCustom,
              communication: {},
            },
          },
          skills: npcBuildSkillsBlock(data.skills),
        },
      };

      // 9. Assign folder if available
      if (folderId) {
        actorData.folder = folderId;
      }

      // 10. Create actor
      const actor = await Actor.create(actorData);
      if (!actor) {
        throw new Error(`Failed to create NPC actor "${data.name}"`);
      }

      auditLog('createNpcActor', { name: data.name, cr: normalizedCR }, 'success');

      // 11. Return structured result
      return {
        success: true,
        actor: {
          id: actor.id,
          name: actor.name,
          cr: npcFormatCR(normalizedCR),
          folder: folderId ?? null,
        },
        warnings,
      };
    } catch (error) {
      console.error(`[${MODULE_ID}] Failed to create NPC actor`, error);
      auditLog(
        'createNpcActor',
        { name: data.name },
        'failure',
        error instanceof Error ? error.message : 'Unknown error'
      );
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // Add weapon attack to an existing actor (dnd5e-add-attack-feature)
  // ---------------------------------------------------------------------------

  async addAttackToActor(data: any): Promise<any> {
    validateFoundryState();

    if ((game.system as any).id !== 'dnd5e') {
      throw new Error('addAttackToActor requires the dnd5e game system');
    }

    try {
      // 1. Resolve actor
      const actor = await this.access.characters.findActorByIdentifier(data.actorIdentifier);
      if (!actor) {
        throw new Error(`Actor not found: "${data.actorIdentifier}"`);
      }

      // 2. Duplicate check
      const existing = actor.items.find(
        (i: any) => i.name.toLowerCase() === data.featureName.toLowerCase()
      );
      if (existing) {
        throw new Error(
          `An item named "${data.featureName}" already exists on actor "${actor.name}". ` +
            `Remove or rename it first.`
        );
      }

      // 3. Soft validation — collect warnings, never block
      const warnings: string[] = [];

      for (const part of data.damageParts as Array<{
        number: number;
        denomination: number;
        type: string;
      }>) {
        if (!ATTACK_DAMAGE_CANONICAL.has(part.type)) {
          const msg = `Unknown damage type "${part.type}" — verify it matches dnd5e system values`;
          warnings.push(msg);
          console.warn(`[${MODULE_ID}] ${msg}`);
        }
      }
      for (const prop of data.properties as string[]) {
        if (!ATTACK_PROPERTY_CANONICAL.has(prop)) {
          const msg = `Unknown weapon property "${prop}" — verify it matches dnd5e system values`;
          warnings.push(msg);
          console.warn(`[${MODULE_ID}] ${msg}`);
        }
      }

      // 4. Generate activity ID
      const activityId: string = (foundry.utils as any).randomID(16);

      // 5. Damage parts for the activity (all except the first — which is system.damage.base)
      const activityDamageParts = (
        data.damageParts as Array<{
          number: number;
          denomination: number;
          type: string;
          bonus?: number;
        }>
      )
        .slice(1)
        .map(p => ({
          types: [p.type],
          number: p.number,
          denomination: p.denomination,
          bonus: p.bonus !== undefined ? String(p.bonus) : '',
          scaling: { mode: '', number: 1 },
          custom: { enabled: false },
        }));

      // 6. Range object (system-level — holds the real range/reach)
      const rangeObj =
        data.attackType === 'melee'
          ? { value: data.reachFt ?? 5, long: null, units: 'ft' }
          : { value: data.rangeFt, long: data.longRangeFt ?? null, units: 'ft' };

      // 7. Conditional 2024-only fields
      const sourceRules: string = data.sourceRules ?? '2014';
      const masteryField = sourceRules === '2024' ? { mastery: '' } : {};
      // Attack ability must always be written regardless of rules edition — it was previously
      // gated behind sourceRules === '2024' alongside the genuinely-2024-only mastery/classification
      // fields, which silently dropped it for the default 2014 case and left attack.ability as the
      // hardcoded empty string below, falling back to a wrong default at the sheet level.
      const abilityField = { ability: data.effectiveAbility };
      const classification = sourceRules === '2014' ? 'weapon' : '';

      // 8. Build item data — Tier 2: clone a real, live weapon (Dagger/Shortbow) as a structural
      // scaffold and override only the caller-specified fields. Falls back to full from-scratch
      // construction (Tier 3, the previous behavior) only if that live template can't be fetched.
      const attackTemplate = await fetchLiveTemplate(
        'dnd-players-handbook.equipment',
        data.attackType === 'ranged' ? 'Shortbow' : 'Dagger',
        'attack'
      );

      const baseDamagePart = {
        types: [(data.damageParts as any[])[0].type],
        number: (data.damageParts as any[])[0].number,
        denomination: (data.damageParts as any[])[0].denomination,
        bonus:
          (data.damageParts as any[])[0].bonus !== undefined
            ? String((data.damageParts as any[])[0].bonus)
            : '',
        scaling: { mode: '', number: 1 },
        custom: { enabled: false },
      };

      let itemData: Record<string, any>;

      if (attackTemplate) {
        const activity = attackTemplate.activity;
        activity._id = activityId;
        activity.name = '';
        activity.img = '';
        activity.sort = 0;
        activity.description = {};
        activity.effects = [];
        activity.activation = {
          ...activity.activation,
          type: data.activationType ?? 'action',
          value: 1,
          condition: '',
          override: false,
        };
        activity.attack = {
          ...activity.attack,
          ability: data.effectiveAbility,
          bonus: data.attackBonus > 0 ? String(data.attackBonus) : '',
          type: { value: data.attackType ?? 'melee', classification },
        };
        activity.damage = {
          ...activity.damage,
          includeBase: true,
          parts: activityDamageParts,
        };

        itemData = {
          name: data.featureName,
          type: 'weapon',
          system: {
            ...(foundry.utils as any).deepClone(attackTemplate.itemSystem),
            description: { value: data.description ?? '', chat: '', unidentified: '' },
            source: {
              custom: '',
              book: data.sourceBook ?? '',
              page: data.sourcePage ?? '',
              license: '',
              rules: sourceRules,
            },
            quantity: 1,
            weight: { value: 0, units: 'lb' },
            price: { value: 0, denomination: 'gp' },
            equipped: data.equipped !== false,
            activation: {
              type: data.activationType ?? 'action',
              value: 1,
              condition: '',
              override: false,
            },
            range: rangeObj,
            damage: { base: baseDamagePart },
            type: { value: data.weaponClass ?? 'natural', baseItem: '' },
            properties: data.properties as string[],
            proficient: 1,
            uses: buildUsesField(data.uses),
            ...masteryField,
            activities: { [activityId]: activity },
          },
        };
      } else {
        // Tier 3 — no live template available, build fully from scratch.
        itemData = {
          name: data.featureName,
          type: 'weapon',
          system: {
            description: {
              value: data.description ?? '',
              chat: '',
              unidentified: '',
            },
            source: {
              custom: '',
              book: data.sourceBook ?? '',
              page: data.sourcePage ?? '',
              license: '',
              rules: sourceRules,
            },
            quantity: 1,
            weight: { value: 0, units: 'lb' },
            price: { value: 0, denomination: 'gp' },
            attunement: '',
            equipped: data.equipped !== false,
            rarity: '',
            identified: true,
            activation: {
              type: data.activationType ?? 'action',
              value: 1,
              condition: '',
              override: false,
            },
            duration: { value: '', units: '' },
            cover: null,
            target: {
              template: {
                count: '',
                contiguous: false,
                type: '',
                size: '',
                width: '',
                height: '',
                units: '',
              },
              affects: { count: '', type: '', choice: false, special: '' },
              prompt: true,
              override: false,
            },
            range: rangeObj,
            uses: buildUsesField(data.uses),
            damage: { base: baseDamagePart },
            type: { value: data.weaponClass ?? 'natural', baseItem: '' },
            properties: data.properties as string[],
            proficient: 1,
            magicalBonus: null,
            ...masteryField,
            activities: {
              [activityId]: {
                _id: activityId,
                type: 'attack',
                name: '',
                img: '',
                sort: 0,
                description: {},
                activation: {
                  type: data.activationType ?? 'action',
                  value: 1,
                  condition: '',
                  override: false,
                },
                duration: { units: '', value: '', override: false },
                target: {
                  template: {
                    count: '',
                    contiguous: false,
                    type: '',
                    size: '',
                    width: '',
                    height: '',
                    units: '',
                  },
                  affects: { count: '', type: '', choice: false, special: '' },
                  prompt: true,
                  override: false,
                },
                range: { units: 'self', override: false },
                uses: { spent: 0, max: '', recovery: [] },
                consumption: {
                  targets: [],
                  scaling: { allowed: false, max: '' },
                  spellSlot: true,
                },
                attack: {
                  bonus: data.attackBonus > 0 ? String(data.attackBonus) : '',
                  critical: { threshold: null },
                  flat: false,
                  type: {
                    value: data.attackType ?? 'melee',
                    classification: classification,
                  },
                  ...abilityField,
                },
                damage: {
                  critical: { bonus: '' },
                  includeBase: true,
                  parts: activityDamageParts,
                },
                effects: [],
                save: { ability: '', dc: { formula: '', calculation: '' } },
              },
            },
          },
        };
      }

      // 9. Create the item on the actor
      const created = (await actor.createEmbeddedDocuments('Item', [itemData]))[0];
      if (!created) {
        throw new Error(
          `Failed to create attack item "${data.featureName}" on actor "${actor.name}"`
        );
      }

      auditLog('addAttackToActor', { actorId: actor.id, featureName: data.featureName }, 'success');

      return {
        success: true,
        actor: { id: actor.id, name: actor.name },
        item: { id: created.id, name: created.name, type: 'weapon' },
        warnings,
      };
    } catch (error) {
      console.error(`[${MODULE_ID}] Failed to add attack to actor`, error);
      auditLog(
        'addAttackToActor',
        { actorIdentifier: data.actorIdentifier, featureName: data.featureName },
        'failure',
        error instanceof Error ? error.message : 'Unknown error'
      );
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // Add automatic-damage aura/emanation feature to an existing actor
  // (dnd5e-add-aura-feature)
  // ---------------------------------------------------------------------------

  async addAuraToActor(data: any): Promise<any> {
    validateFoundryState();

    if ((game.system as any).id !== 'dnd5e') {
      throw new Error('addAuraToActor requires the dnd5e game system');
    }

    try {
      // 1. Resolve actor
      const actor = await this.access.characters.findActorByIdentifier(data.actorIdentifier);
      if (!actor) {
        throw new Error(`Actor not found: "${data.actorIdentifier}"`);
      }

      // 2. Duplicate check (case-insensitive name match)
      const existing = actor.items.find(
        (i: any) => i.name.toLowerCase() === data.featureName.toLowerCase()
      );
      if (existing) {
        throw new Error(
          `An item named "${data.featureName}" already exists on actor "${actor.name}". ` +
            `Remove or rename it first.`
        );
      }

      // 3. Soft validation — collect warnings, never block
      const warnings: string[] = [];

      for (const part of data.damageParts as Array<{
        number: number;
        denomination: number;
        type: string;
      }>) {
        if (!AURA_DAMAGE_CANONICAL.has(part.type)) {
          const msg = `Unknown damage type "${part.type}" — verify it matches dnd5e system values`;
          warnings.push(msg);
          console.warn(`[${MODULE_ID}] ${msg}`);
        }
      }

      // 4. Map areaType: Foundry uses "radius" internally for what 5e 2024 calls "emanation"
      //    <option value="radius">Emanation</option> — no "emanation" value exists in the dropdown
      const mappedAreaType: string = data.areaType === 'emanation' ? 'radius' : data.areaType;

      // 5. Generate activity ID
      const activityId: string = (foundry.utils as any).randomID(16);

      // 6. Slug identifier
      const identifier = slugify(data.featureName as string);

      // 7. Build item data — Tier 2: compose two live templates, since no single real feat
      // happens to have a `damage`-type activity in this compendium (2024 conversions moved
      // Banshee's Wail — the previous hand-typed template's own source — to a `save`-type
      // activity instead; `damage`-type activities do still exist, just on spells like Magic
      // Missile). Use a real feat item (Fire Breath) for the outer item-level boilerplate, and
      // Magic Missile's `damage`-type activity as the activity scaffold, overriding the
      // spell-specific consumption/fields that don't belong on a monster feature.
      const featShellTemplate = await fetchLiveTemplate(
        'dnd-monster-manual.actors',
        'Adult Red Dragon',
        'save'
      );
      const damageActivityTemplate = await fetchLiveTemplate(
        'dnd-players-handbook.spells',
        'Magic Missile',
        'damage'
      );

      let itemData: Record<string, any>;

      if (featShellTemplate && damageActivityTemplate) {
        const activity = damageActivityTemplate.activity;
        activity._id = activityId;
        activity.name = '';
        activity.sort = 0;
        activity.description = {};
        activity.effects = [];
        activity.activation = {
          ...activity.activation,
          type: data.activationType ?? 'action',
          value: 1,
          override: false,
        };
        // Spell-specific consumption (spell slots) doesn't apply to a monster feature.
        activity.consumption = { scaling: { allowed: false }, spellSlot: false, targets: [] };
        activity.range = { units: 'self', override: false };
        activity.target = {
          ...activity.target,
          template: {
            ...activity.target?.template,
            contiguous: false,
            units: data.areaUnits ?? 'ft',
            count: '',
            type: mappedAreaType,
            size: String(data.areaSize),
            width: '',
            height: '',
          },
          affects: {
            count: '',
            type: data.affectsType ?? 'creature',
            choice: false,
            special: '',
          },
        };
        activity.damage = {
          ...activity.damage,
          parts: (
            data.damageParts as Array<{
              number: number;
              denomination: number;
              type: string;
              bonus?: number;
            }>
          ).map(p => ({
            types: [p.type],
            number: p.number,
            denomination: p.denomination,
            bonus: p.bonus !== undefined ? String(p.bonus) : '',
            scaling: { mode: '', number: 1 },
            custom: { enabled: false },
          })),
        };

        itemData = {
          name: data.featureName,
          type: 'feat',
          img: 'systems/dnd5e/icons/svg/items/feature.svg',
          system: {
            ...(foundry.utils as any).deepClone(featShellTemplate.itemSystem),
            description: { value: data.description ?? '', chat: '' },
            identifier,
            source: {
              revision: 1,
              rules: data.sourceRules ?? '2014',
              custom: '',
              book: data.sourceBook ?? '',
              page: data.sourcePage ?? '',
              license: '',
            },
            type: { value: 'monster', subtype: '' },
            uses: buildUsesField(data.uses),
            properties: [],
            requirements: '',
            activities: { [activityId]: activity },
          },
          effects: [],
        };
      } else {
        // Tier 3 — no live template available, build fully from scratch.
        itemData = {
          name: data.featureName,
          type: 'feat',
          img: 'systems/dnd5e/icons/svg/items/feature.svg',
          system: {
            description: { value: data.description ?? '', chat: '' },
            identifier,
            source: {
              revision: 1,
              rules: data.sourceRules ?? '2014',
              custom: '',
              book: data.sourceBook ?? '',
              page: data.sourcePage ?? '',
              license: '',
            },
            type: { value: 'monster', subtype: '' },
            uses: buildUsesField(data.uses),
            advancement: [],
            crewed: false,
            enchant: {},
            prerequisites: { items: [], repeatable: false, level: null },
            properties: [],
            requirements: '',
            activities: {
              [activityId]: {
                _id: activityId,
                type: 'damage',
                name: '',
                sort: 0,
                activation: {
                  type: data.activationType ?? 'action',
                  value: 1,
                  override: false,
                },
                consumption: {
                  scaling: { allowed: false },
                  spellSlot: true,
                  targets: [],
                },
                description: {},
                duration: {
                  units: 'inst',
                  concentration: false,
                  override: false,
                },
                effects: [],
                range: { units: 'self', override: false },
                uses: { spent: 0, recovery: [] },
                target: {
                  template: {
                    contiguous: false,
                    units: data.areaUnits ?? 'ft',
                    count: '',
                    type: mappedAreaType,
                    size: String(data.areaSize),
                    width: '',
                    height: '',
                  },
                  affects: {
                    count: '',
                    type: data.affectsType ?? 'creature',
                    choice: false,
                    special: '',
                  },
                  override: false,
                  prompt: true,
                },
                damage: {
                  critical: { allow: false },
                  parts: (
                    data.damageParts as Array<{
                      number: number;
                      denomination: number;
                      type: string;
                      bonus?: number;
                    }>
                  ).map(p => ({
                    types: [p.type],
                    number: p.number,
                    denomination: p.denomination,
                    bonus: p.bonus !== undefined ? String(p.bonus) : '',
                    scaling: { mode: '', number: 1 },
                    custom: { enabled: false },
                  })),
                },
              },
            },
          },
          effects: [],
        };
      }

      // 7. Create embedded item
      const [created] = (await actor.createEmbeddedDocuments('Item', [itemData])) as any[];
      if (!created) {
        throw new Error(
          `Failed to create aura item "${data.featureName}" on actor "${actor.name}"`
        );
      }

      auditLog('addAuraToActor', { actorId: actor.id, featureName: data.featureName }, 'success');

      return {
        success: true,
        actor: { id: actor.id, name: actor.name },
        item: { id: created.id, name: created.name, type: 'feat' },
        warnings,
      };
    } catch (error) {
      console.error(`[${MODULE_ID}] Failed to add aura to actor`, error);
      auditLog(
        'addAuraToActor',
        { actorIdentifier: data.actorIdentifier, featureName: data.featureName },
        'failure',
        error instanceof Error ? error.message : 'Unknown error'
      );
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // Add passive/descriptive feature to an existing actor (dnd5e-add-passive-feature)
  // No activities, no mechanics — pure description displayed on the sheet.
  // ---------------------------------------------------------------------------

  async addPassiveFeatureToActor(data: any): Promise<any> {
    validateFoundryState();

    if ((game.system as any).id !== 'dnd5e') {
      throw new Error('addPassiveFeatureToActor requires the dnd5e game system');
    }

    try {
      // 1. Resolve actor
      const actor = await this.access.characters.findActorByIdentifier(data.actorIdentifier);
      if (!actor) {
        throw new Error(`Actor not found: "${data.actorIdentifier}"`);
      }

      // 2. Duplicate check (case-insensitive)
      const existing = actor.items.find(
        (i: any) => i.name.toLowerCase() === data.featureName.toLowerCase()
      );
      if (existing) {
        throw new Error(
          `An item named "${data.featureName}" already exists on actor "${actor.name}". ` +
            `Remove or rename it first.`
        );
      }

      // 3. Slug identifier
      const identifier = slugify(data.featureName as string);

      // 4. Build item data — no activities, no activityId needed
      const itemData = {
        name: data.featureName,
        type: 'feat',
        img: 'systems/dnd5e/icons/svg/items/feature.svg',
        system: {
          description: { value: data.description ?? '', chat: '' },
          identifier,
          source: {
            revision: 1,
            rules: data.sourceRules ?? '2014',
            custom: '',
            book: data.sourceBook ?? '',
            page: data.sourcePage ?? '',
            license: '',
          },
          type: { value: 'monster', subtype: '' },
          uses: buildUsesField(data.uses),
          advancement: [],
          crewed: false,
          enchant: {},
          prerequisites: { items: [], repeatable: false, level: null },
          properties: [],
          requirements: '',
          activities: {}, // empty — passive feature has no mechanical activity
        },
        effects: [],
      };

      // 5. Create embedded item
      const [created] = (await actor.createEmbeddedDocuments('Item', [itemData])) as any[];
      if (!created) {
        throw new Error(
          `Failed to create passive feature "${data.featureName}" on actor "${actor.name}"`
        );
      }

      auditLog(
        'addPassiveFeatureToActor',
        { actorId: actor.id, featureName: data.featureName },
        'success'
      );

      return {
        success: true,
        actor: { id: actor.id, name: actor.name },
        item: { id: created.id, name: created.name, type: 'feat' },
      };
    } catch (error) {
      console.error(`[${MODULE_ID}] Failed to add passive feature to actor`, error);
      auditLog(
        'addPassiveFeatureToActor',
        { actorIdentifier: data.actorIdentifier, featureName: data.featureName },
        'failure',
        error instanceof Error ? error.message : 'Unknown error'
      );
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // Add weapon attack + save effect to an existing actor
  // (dnd5e-add-attack-with-save) — Tipo B
  // Two activities: attack (sort:0) + save (sort:1)
  // ---------------------------------------------------------------------------

  async addAttackWithSaveToActor(data: any): Promise<any> {
    validateFoundryState();

    if ((game.system as any).id !== 'dnd5e') {
      throw new Error('addAttackWithSaveToActor requires the dnd5e game system');
    }

    try {
      // 1. Resolve actor
      const actor = await this.access.characters.findActorByIdentifier(data.actorIdentifier);
      if (!actor) {
        throw new Error(`Actor not found: "${data.actorIdentifier}"`);
      }

      // 2. Duplicate check
      const existing = actor.items.find(
        (i: any) => i.name.toLowerCase() === data.featureName.toLowerCase()
      );
      if (existing) {
        throw new Error(
          `An item named "${data.featureName}" already exists on actor "${actor.name}". ` +
            `Remove or rename it first.`
        );
      }

      // 3. Soft validation — both damage groups unified
      const warnings: string[] = [];
      const allParts = [
        ...(data.damageParts as Array<{ type: string }>),
        ...(data.saveDamageParts as Array<{ type: string }>),
      ];
      for (const part of allParts) {
        if (!ATTACK_WITH_SAVE_DAMAGE_CANONICAL.has(part.type)) {
          const msg = `Unknown damage type "${part.type}" — verify it matches dnd5e system values`;
          if (!warnings.includes(msg)) warnings.push(msg);
          console.warn(`[${MODULE_ID}] ${msg}`);
        }
      }

      // 4. Generate two distinct activity IDs
      const attackActivityId: string = (foundry.utils as any).randomID(16);
      const saveActivityId: string = (foundry.utils as any).randomID(16);

      // 5. Attack activity damage parts: damageParts[1+] (base is in system.damage.base)
      const activityDamageParts = (
        data.damageParts as Array<{
          number: number;
          denomination: number;
          type: string;
          bonus?: number;
        }>
      )
        .slice(1)
        .map(p => ({
          types: [p.type],
          number: p.number,
          denomination: p.denomination,
          bonus: p.bonus !== undefined ? String(p.bonus) : '',
          scaling: { mode: '', number: 1 },
          custom: { enabled: false },
        }));

      // 6. Save activity damage parts: ALL saveDamageParts (no base — independent)
      const saveActivityDamageParts = (
        data.saveDamageParts as Array<{
          number: number;
          denomination: number;
          type: string;
          bonus?: number;
        }>
      ).map(p => ({
        types: [p.type],
        number: p.number,
        denomination: p.denomination,
        bonus: p.bonus !== undefined ? String(p.bonus) : '',
        scaling: { mode: '', number: 1 },
        custom: { enabled: false },
      }));

      // 7. System-level range (real reach/range — activity range is always 'self')
      const rangeObj =
        data.attackType === 'melee'
          ? { value: data.reachFt ?? 5, long: null, units: 'ft' }
          : { value: data.rangeFt, long: data.longRangeFt ?? null, units: 'ft' };

      // 8. Conditional 2024-only fields (same rules as Tipo A)
      const sourceRules: string = data.sourceRules ?? '2014';
      const masteryField = sourceRules === '2024' ? { mastery: '' } : {};
      // Attack ability must always be written regardless of rules edition — it was previously
      // gated behind sourceRules === '2024' alongside the genuinely-2024-only mastery/classification
      // fields, which silently dropped it for the default 2014 case and left attack.ability as the
      // hardcoded empty string below, falling back to a wrong default at the sheet level.
      const abilityField = { ability: data.effectiveAbility };
      const classification = sourceRules === '2014' ? 'weapon' : '';

      // 9. Build item data — Tier 2: clone a real weapon (attack activity) and a real save-based
      // monster feature (save activity) as structural scaffolds, override only caller-specified
      // fields. Falls back to full from-scratch construction if either live template is missing.
      const attackTemplate = await fetchLiveTemplate(
        'dnd-players-handbook.equipment',
        data.attackType === 'ranged' ? 'Shortbow' : 'Dagger',
        'attack'
      );
      const saveTemplate = await fetchLiveTemplate(
        'dnd-monster-manual.actors',
        'Adult Red Dragon',
        'save'
      );

      const baseDamagePart = {
        types: [(data.damageParts as any[])[0].type],
        number: (data.damageParts as any[])[0].number,
        denomination: (data.damageParts as any[])[0].denomination,
        bonus:
          (data.damageParts as any[])[0].bonus !== undefined
            ? String((data.damageParts as any[])[0].bonus)
            : '',
        scaling: { mode: '', number: 1 },
        custom: { enabled: false },
      };

      let itemData: Record<string, any>;

      if (attackTemplate && saveTemplate) {
        const attackActivity = attackTemplate.activity;
        attackActivity._id = attackActivityId;
        attackActivity.name = '';
        attackActivity.img = '';
        attackActivity.sort = 0;
        attackActivity.description = {};
        attackActivity.effects = [];
        attackActivity.activation = {
          ...attackActivity.activation,
          type: data.activationType ?? 'action',
          value: 1,
          condition: '',
          override: false,
        };
        attackActivity.attack = {
          ...attackActivity.attack,
          ability: data.effectiveAbility,
          bonus: data.attackBonus > 0 ? String(data.attackBonus) : '',
          type: { value: data.attackType ?? 'melee', classification },
        };
        attackActivity.damage = {
          ...attackActivity.damage,
          includeBase: true,
          parts: activityDamageParts,
        };

        const saveActivity = saveTemplate.activity;
        saveActivity._id = saveActivityId;
        saveActivity.name = '';
        saveActivity.img = '';
        saveActivity.sort = 1;
        saveActivity.description = {};
        saveActivity.effects = [];
        saveActivity.activation = {
          ...saveActivity.activation,
          type: data.activationType ?? 'action',
          value: 1,
          override: false,
        };
        saveActivity.target = {
          ...saveActivity.target,
          affects: { count: '1', type: 'creature', choice: false, special: '' },
        };
        saveActivity.damage = {
          ...saveActivity.damage,
          onSave: data.saveOnSave ?? 'none',
          parts: saveActivityDamageParts,
        };
        saveActivity.save = {
          ...saveActivity.save,
          ability: [data.saveAbility],
          dc: { calculation: '', formula: String(data.saveDC) },
        };

        itemData = {
          name: data.featureName,
          type: 'weapon',
          system: {
            ...(foundry.utils as any).deepClone(attackTemplate.itemSystem),
            description: { value: data.description ?? '', chat: '', unidentified: '' },
            source: {
              custom: '',
              book: data.sourceBook ?? '',
              page: data.sourcePage ?? '',
              license: '',
              rules: sourceRules,
            },
            quantity: 1,
            weight: { value: 0, units: 'lb' },
            price: { value: 0, denomination: 'gp' },
            equipped: data.equipped !== false,
            activation: {
              type: data.activationType ?? 'action',
              value: 1,
              condition: '',
              override: false,
            },
            range: rangeObj,
            damage: { base: baseDamagePart },
            type: { value: data.weaponClass ?? 'natural', baseItem: '' },
            properties: data.properties as string[],
            proficient: 1,
            uses: buildUsesField(data.uses),
            ...masteryField,
            activities: {
              [attackActivityId]: attackActivity,
              [saveActivityId]: saveActivity,
            },
          },
        };
      } else {
        // Tier 3 — no live template available, build fully from scratch.
        itemData = {
          name: data.featureName,
          type: 'weapon',
          system: {
            description: {
              value: data.description ?? '',
              chat: '',
              unidentified: '',
            },
            source: {
              custom: '',
              book: data.sourceBook ?? '',
              page: data.sourcePage ?? '',
              license: '',
              rules: sourceRules,
            },
            quantity: 1,
            weight: { value: 0, units: 'lb' },
            price: { value: 0, denomination: 'gp' },
            attunement: '',
            equipped: data.equipped !== false,
            rarity: '',
            identified: true,
            activation: {
              type: data.activationType ?? 'action',
              value: 1,
              condition: '',
              override: false,
            },
            duration: { value: '', units: '' },
            cover: null,
            target: {
              template: {
                count: '',
                contiguous: false,
                type: '',
                size: '',
                width: '',
                height: '',
                units: '',
              },
              affects: { count: '', type: '', choice: false, special: '' },
              prompt: true,
              override: false,
            },
            range: rangeObj,
            uses: buildUsesField(data.uses),
            damage: { base: baseDamagePart },
            type: { value: data.weaponClass ?? 'natural', baseItem: '' },
            properties: data.properties as string[],
            proficient: 1,
            magicalBonus: null,
            ...masteryField,
            activities: {
              // ── Activity 1: attack (sort 0) ───────────────────────────────
              [attackActivityId]: {
                _id: attackActivityId,
                type: 'attack',
                name: '',
                img: '',
                sort: 0,
                description: {},
                activation: {
                  type: data.activationType ?? 'action',
                  value: 1,
                  condition: '',
                  override: false,
                },
                duration: { units: '', value: '', override: false },
                target: {
                  template: {
                    count: '',
                    contiguous: false,
                    type: '',
                    size: '',
                    width: '',
                    height: '',
                    units: '',
                  },
                  affects: { count: '', type: '', choice: false, special: '' },
                  prompt: true,
                  override: false,
                },
                range: { units: 'self', override: false },
                uses: { spent: 0, max: '', recovery: [] },
                consumption: {
                  targets: [],
                  scaling: { allowed: false, max: '' },
                  spellSlot: true,
                },
                attack: {
                  bonus: data.attackBonus > 0 ? String(data.attackBonus) : '',
                  critical: { threshold: null },
                  flat: false,
                  type: { value: data.attackType ?? 'melee', classification },
                  ...abilityField,
                },
                damage: {
                  critical: { bonus: '' },
                  includeBase: true,
                  parts: activityDamageParts,
                },
                effects: [],
                save: { ability: '', dc: { formula: '', calculation: '' } },
              },

              // ── Activity 2: save (sort 1) ─────────────────────────────────
              [saveActivityId]: {
                _id: saveActivityId,
                type: 'save',
                name: '',
                sort: 1,
                description: {}, // {} — not { chatFlavor: '' } (real schema confirmed)
                activation: {
                  type: data.activationType ?? 'action',
                  value: 1,
                  override: false,
                  // NO condition — per real schema
                },
                duration: { units: 'inst', concentration: false, override: false },
                effects: [],
                range: { units: 'self', override: false },
                uses: { spent: 0, recovery: [] }, // NO max
                consumption: { scaling: { allowed: false }, spellSlot: true, targets: [] },
                target: {
                  template: {
                    count: '',
                    contiguous: false,
                    type: '',
                    size: '',
                    width: '',
                    height: '',
                    units: '',
                  },
                  affects: { count: '1', type: 'creature', choice: false, special: '' },
                  override: false,
                  prompt: true,
                },
                damage: {
                  onSave: data.saveOnSave ?? 'none',
                  parts: saveActivityDamageParts,
                  // NO includeBase — save damage is independent from weapon base damage
                },
                save: {
                  ability: [data.saveAbility],
                  dc: { calculation: '', formula: String(data.saveDC) },
                },
              },
            },
          },
        };
      }

      // 10. Create the item on the actor
      const created = (await actor.createEmbeddedDocuments('Item', [itemData]))[0];
      if (!created) {
        throw new Error(
          `Failed to create attack+save item "${data.featureName}" on actor "${actor.name}"`
        );
      }

      auditLog(
        'addAttackWithSaveToActor',
        { actorId: actor.id, featureName: data.featureName },
        'success'
      );

      return {
        success: true,
        actor: { id: actor.id, name: actor.name },
        item: { id: created.id, name: created.name, type: 'weapon' },
        warnings,
      };
    } catch (error) {
      console.error(`[${MODULE_ID}] Failed to add attack+save to actor`, error);
      auditLog(
        'addAttackWithSaveToActor',
        { actorIdentifier: data.actorIdentifier, featureName: data.featureName },
        'failure',
        error instanceof Error ? error.message : 'Unknown error'
      );
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // Set actor spellcasting (ability + slot counts)
  // ---------------------------------------------------------------------------

  async setActorSpellcasting(data: any): Promise<any> {
    validateFoundryState();

    if ((game.system as any).id !== 'dnd5e') {
      throw new Error('setActorSpellcasting requires the dnd5e game system');
    }

    try {
      // 1. Resolve actor
      const actor = this.access.characters.findActorByIdentifier(data.actorIdentifier);
      if (!actor) {
        throw new Error(`Actor not found: "${data.actorIdentifier}"`);
      }

      const cls = data.spellcastingClass as string;
      const lvl = data.spellcastingLevel as number;
      const ability = data.effectiveAbility as string;
      const idx = lvl - 1; // 0-based index into slot tables
      const warnings: string[] = [];

      // 2. Build flat updates object for a single actor.update() call
      const updates: Record<string, unknown> = {};

      // Spellcasting ability
      updates['system.attributes.spellcasting'] = ability;

      if (cls === 'warlock') {
        // ── Pact Magic ────────────────────────────────────────────────────────
        // All regular slots set to 0; pact slots from table
        for (let i = 1; i <= 9; i++) {
          updates[`system.spells.spell${i}.max`] = 0;
          updates[`system.spells.spell${i}.value`] = 0;
        }
        const pact = WARLOCK_PACT_TABLE[idx];
        updates['system.spells.pact.max'] = pact.max;
        updates['system.spells.pact.value'] = pact.max;
        updates['system.spells.pact.level'] = pact.level;
      } else {
        // ── Regular spell slots ───────────────────────────────────────────────
        let slotRow: number[];

        if (cls === 'artificer') {
          slotRow = ARTIFICER_SLOTS[idx];
        } else if (cls === 'paladin' || cls === 'ranger') {
          slotRow = HALF_CASTER_SLOTS[idx];
          if (lvl === 1) {
            warnings.push(
              `${cls} level 1 has no spell slots — use level 2+ to unlock spellcasting`
            );
          }
        } else {
          // Full casters: wizard, cleric, druid, sorcerer, bard
          slotRow = FULL_CASTER_SLOTS[idx];
        }

        for (let i = 1; i <= 9; i++) {
          const n = slotRow[i - 1];
          updates[`system.spells.spell${i}.max`] = n;
          updates[`system.spells.spell${i}.value`] = n;
        }
      }

      // 3. Single update call
      await actor.update(updates);

      // 4. Build response
      const slots: Record<string, unknown> = {};
      if (cls === 'warlock') {
        const pact = WARLOCK_PACT_TABLE[idx];
        slots['pact'] = { max: pact.max, level: pact.level };
      } else {
        const slotRow =
          cls === 'artificer'
            ? ARTIFICER_SLOTS[idx]
            : cls === 'paladin' || cls === 'ranger'
              ? HALF_CASTER_SLOTS[idx]
              : FULL_CASTER_SLOTS[idx];

        for (let i = 1; i <= 9; i++) {
          (slots as Record<string, number>)[`spell${i}`] = slotRow[i - 1];
        }
      }

      auditLog('setActorSpellcasting', { actorId: actor.id, cls, lvl, ability }, 'success');

      return {
        actor: { id: actor.id, name: actor.name },
        spellcasting: { ability, slots },
        warnings,
      };
    } catch (error) {
      console.error(`[${MODULE_ID}] Failed to set actor spellcasting`, error);
      auditLog(
        'setActorSpellcasting',
        { actorIdentifier: data.actorIdentifier, spellcastingClass: data.spellcastingClass },
        'failure',
        error instanceof Error ? error.message : 'Unknown error'
      );
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // Add spells from compendium packs to an actor
  // ---------------------------------------------------------------------------

  async addSpellsToActor(data: any): Promise<any> {
    validateFoundryState();

    if ((game.system as any).id !== 'dnd5e') {
      throw new Error('addSpellsToActor requires the dnd5e game system');
    }

    try {
      // 1. Resolve actor
      const actor = this.access.characters.findActorByIdentifier(data.actorIdentifier);
      if (!actor) {
        throw new Error(`Actor not found: "${data.actorIdentifier}"`);
      }

      const spellNames: string[] = data.spellNames;
      const compendiumPacks: string[] = data.compendiumPacks ?? ['dnd5e.spells'];
      const warnings: string[] = [];

      // ── Phase A: deduplicate input (case-insensitive) ─────────────────────
      const seen = new Set<string>();
      const unique: string[] = [];
      const skipped: Array<{ name: string; reason: string }> = [];

      for (const name of spellNames) {
        const key = name.toLowerCase();
        if (seen.has(key)) {
          skipped.push({ name, reason: 'duplicate in input' });
        } else {
          seen.add(key);
          unique.push(name);
        }
      }

      // ── Phase B: build pack index maps (once per pack) ────────────────────
      interface PackMap {
        packId: string;
        packLabel: string;
        nameMap: Map<string, string>; // lowercase name → _id
      }
      const packMaps: PackMap[] = [];

      for (const packId of compendiumPacks) {
        const pack = game.packs.get(packId);
        if (!pack) {
          warnings.push(`Compendium pack "${packId}" not found — skipped`);
          continue;
        }

        // Q6: type guard — Item packs only
        if (pack.metadata.type !== 'Item') {
          warnings.push(
            `Pack "${packId}" has type "${pack.metadata.type}", expected "Item" — skipped`
          );
          continue;
        }

        if (!pack.indexed) {
          await pack.getIndex({});
        }

        const nameMap = new Map<string, string>();
        for (const entry of pack.index.values() as IterableIterator<any>) {
          if (entry.name) {
            nameMap.set((entry.name as string).toLowerCase(), entry._id as string);
          }
        }

        packMaps.push({ packId, packLabel: pack.metadata.label as string, nameMap });
      }

      if (packMaps.length === 0) {
        throw new Error(
          'No valid compendium packs available — check the compendiumPacks parameter. ' +
            'Valid pack IDs for D&D 5e: "dnd5e.spells" (2014) or "dnd5e.spells24" (2024).'
        );
      }

      // ── Phase C: per-spell search + import ───────────────────────────────
      const added: Array<{ name: string; packId: string; packLabel: string; itemId: string }> = [];
      const notFound: string[] = [];
      const failed: Array<{ name: string; error: string }> = [];

      for (const name of unique) {
        const normalizedName = name.toLowerCase();

        // 1. Duplicate check on actor (only items of type 'spell')
        const existing = (actor.items as any[]).find(
          (i: any) => i.type === 'spell' && i.name?.toLowerCase() === normalizedName
        );
        if (existing) {
          skipped.push({ name, reason: 'already on actor' });
          continue;
        }

        // 2. Lookup across packs — first-pack-wins
        let found: { packId: string; packLabel: string; entryId: string } | null = null;
        for (const pm of packMaps) {
          const entryId = pm.nameMap.get(normalizedName);
          if (entryId) {
            found = { packId: pm.packId, packLabel: pm.packLabel, entryId };
            break;
          }
        }

        if (!found) {
          notFound.push(name);
          continue;
        }

        // 3. Fetch full document from compendium
        const pack = game.packs.get(found.packId);
        const document = await (pack as any).getDocument(found.entryId);

        if (!document) {
          // Entry was in index but document is missing (shouldn't happen, defensive)
          notFound.push(name);
          warnings.push(
            `"${name}" found in index but document missing in pack "${found.packId}" — skipped`
          );
          continue;
        }

        // 4. Prepare data for embedding
        const spellData = (document as any).toObject() as Record<string, unknown>;
        delete spellData._id; // Let Foundry assign a new local id; prevents id clash

        // 5. Embed individually — per-spell error isolation
        try {
          const [created] = (await actor.createEmbeddedDocuments('Item', [spellData])) as any[];
          added.push({
            name,
            packId: found.packId,
            packLabel: found.packLabel,
            itemId: created.id,
          });
        } catch (embedErr) {
          failed.push({
            name,
            error: embedErr instanceof Error ? embedErr.message : 'Unknown error',
          });
        }
      }

      // ── Phase D: audit + return ───────────────────────────────────────────
      auditLog(
        'addSpellsToActor',
        {
          actorId: actor.id,
          added: added.length,
          skipped: skipped.length,
          notFound: notFound.length,
          failed: failed.length,
        },
        'success'
      );

      return {
        actor: { id: actor.id, name: actor.name },
        added,
        skipped,
        notFound,
        failed,
        warnings,
      };
    } catch (error) {
      console.error(`[${MODULE_ID}] Failed to add spells to actor`, error);
      auditLog(
        'addSpellsToActor',
        { actorIdentifier: data.actorIdentifier },
        'failure',
        error instanceof Error ? error.message : 'Unknown error'
      );
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // Add features from compendium packs to an actor
  // ---------------------------------------------------------------------------

  async addFeaturesFromCompendium(data: any): Promise<any> {
    validateFoundryState();

    if ((game.system as any).id !== 'dnd5e') {
      throw new Error('addFeaturesFromCompendium requires the dnd5e game system');
    }

    try {
      // 1. Resolve actor
      const actor = this.access.characters.findActorByIdentifier(data.actorIdentifier);
      if (!actor) {
        throw new Error(`Actor not found: "${data.actorIdentifier}"`);
      }

      const featureNames: string[] = data.featureNames;
      const compendiumPacks: string[] = data.compendiumPacks ?? [
        'dnd5e.monsterfeatures',
        'dnd5e.classfeatures',
      ];
      const warnings: string[] = [];

      // ── Phase A: deduplicate input (case-insensitive) ─────────────────────
      const seen = new Set<string>();
      const unique: string[] = [];
      const skipped: Array<{ name: string; reason: string }> = [];

      for (const name of featureNames) {
        const key = name.toLowerCase();
        if (seen.has(key)) {
          skipped.push({ name, reason: 'duplicate in input' });
        } else {
          seen.add(key);
          unique.push(name);
        }
      }

      // ── Phase B: build pack index maps (once per pack) ────────────────────
      interface PackMap {
        packId: string;
        packLabel: string;
        nameMap: Map<string, string>; // lowercase name → _id
      }
      const packMaps: PackMap[] = [];

      for (const packId of compendiumPacks) {
        const pack = game.packs.get(packId);
        if (!pack) {
          warnings.push(`Compendium pack "${packId}" not found — skipped`);
          continue;
        }

        // Type guard — Item packs only
        if (pack.metadata.type !== 'Item') {
          warnings.push(
            `Pack "${packId}" has type "${pack.metadata.type}", expected "Item" — skipped`
          );
          continue;
        }

        if (!pack.indexed) {
          await pack.getIndex({});
        }

        const nameMap = new Map<string, string>();
        for (const entry of pack.index.values() as IterableIterator<any>) {
          if (entry.name) {
            nameMap.set((entry.name as string).toLowerCase(), entry._id as string);
          }
        }

        packMaps.push({ packId, packLabel: pack.metadata.label as string, nameMap });
      }

      if (packMaps.length === 0) {
        throw new Error(
          'No valid compendium packs available — check the compendiumPacks parameter. ' +
            'Valid pack IDs for D&D 5e: "dnd5e.monsterfeatures" or "dnd5e.classfeatures" (2014), ' +
            '"dnd5e.monsterfeatures24" (2024 monster features). ' +
            'Note: 2024 class features are embedded in class items and cannot be imported with this tool.'
        );
      }

      // ── Phase C: per-feature search + import ─────────────────────────────
      const added: Array<{ name: string; packId: string; packLabel: string; itemId: string }> = [];
      const notFound: string[] = [];
      const failed: Array<{ name: string; error: string }> = [];

      for (const name of unique) {
        const normalizedName = name.toLowerCase();

        // 1. Duplicate check on actor — name-only, any item type
        //    (feature names are semantically unique on an actor regardless of stored type)
        const existing = (actor.items as any[]).find(
          (i: any) => i.name?.toLowerCase() === normalizedName
        );
        if (existing) {
          skipped.push({ name, reason: 'already on actor' });
          continue;
        }

        // 2. Lookup across packs — first-pack-wins
        let found: { packId: string; packLabel: string; entryId: string } | null = null;
        for (const pm of packMaps) {
          const entryId = pm.nameMap.get(normalizedName);
          if (entryId) {
            found = { packId: pm.packId, packLabel: pm.packLabel, entryId };
            break;
          }
        }

        if (!found) {
          notFound.push(name);
          continue;
        }

        // 3. Fetch full document from compendium
        const pack = game.packs.get(found.packId);
        const document = await (pack as any).getDocument(found.entryId);

        if (!document) {
          // Entry was in index but document is missing (shouldn't happen, defensive)
          notFound.push(name);
          warnings.push(
            `"${name}" found in index but document missing in pack "${found.packId}" — skipped`
          );
          continue;
        }

        // 4. Prepare data for embedding
        const featureData = (document as any).toObject() as Record<string, unknown>;
        delete featureData._id; // Let Foundry assign a new local id; prevents id clash

        // 5. Embed individually — per-feature error isolation
        try {
          const [created] = (await actor.createEmbeddedDocuments('Item', [featureData])) as any[];
          added.push({
            name,
            packId: found.packId,
            packLabel: found.packLabel,
            itemId: created.id,
          });
        } catch (embedErr) {
          failed.push({
            name,
            error: embedErr instanceof Error ? embedErr.message : 'Unknown error',
          });
        }
      }

      // ── Phase D: audit + return ───────────────────────────────────────────
      auditLog(
        'addFeaturesFromCompendium',
        {
          actorId: actor.id,
          added: added.length,
          skipped: skipped.length,
          notFound: notFound.length,
          failed: failed.length,
        },
        'success'
      );

      return {
        actor: { id: actor.id, name: actor.name },
        added,
        skipped,
        notFound,
        failed,
        warnings,
      };
    } catch (error) {
      console.error(`[${MODULE_ID}] Failed to add features from compendium`, error);
      auditLog(
        'addFeaturesFromCompendium',
        { actorIdentifier: data.actorIdentifier },
        'failure',
        error instanceof Error ? error.message : 'Unknown error'
      );
      throw error;
    }
  }
}
