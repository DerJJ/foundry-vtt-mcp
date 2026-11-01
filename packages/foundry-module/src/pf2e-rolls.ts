/**
 * PF2e lookups for roll requests. PF2e has no D&D-style ability checks or passive scores:
 * skills, perception and saves are Statistics on the actor, each with a modifier and a roll().
 */

const SKILL_ALIASES: Record<string, string> = {
  acr: 'acrobatics',
  arc: 'arcana',
  ath: 'athletics',
  cra: 'crafting',
  dec: 'deception',
  dip: 'diplomacy',
  itm: 'intimidation',
  med: 'medicine',
  nat: 'nature',
  occ: 'occultism',
  prf: 'performance',
  rel: 'religion',
  soc: 'society',
  ste: 'stealth',
  sur: 'survival',
  thi: 'thievery',
  prc: 'perception',
};

const SAVE_ALIASES: Record<string, string> = {
  fort: 'fortitude',
  ref: 'reflex',
};

const slug = (value: string) => value.toLowerCase().trim().replace(/\s+/g, '-');

/** The Statistic for a skill, perception or save, or null when the actor has none. */
export function pf2eStatistic(actor: any, rollType: string, target: string): any | null {
  const key = slug(target);
  if (rollType === 'save') {
    return actor?.saves?.[SAVE_ALIASES[key] ?? key] ?? null;
  }
  if (rollType === 'skill') {
    const name = SKILL_ALIASES[key] ?? key;
    if (name === 'perception') return actor?.perception ?? null;
    return actor?.skills?.[name] ?? null;
  }
  if (rollType === 'initiative') {
    return actor?.initiative ?? actor?.perception ?? null;
  }
  return null;
}

/**
 * The modifier to roll with: from the Statistic, or the raw ability modifier for 'ability'.
 * Returns null when the actor has no such skill or save.
 */
export function pf2eModifier(actor: any, rollType: string, target: string): number | null {
  if (rollType === 'ability') {
    const mod = actor?.abilities?.[slug(target).slice(0, 3)]?.mod;
    return typeof mod === 'number' ? mod : null;
  }
  const mod = pf2eStatistic(actor, rollType, target)?.mod;
  return typeof mod === 'number' ? mod : null;
}
